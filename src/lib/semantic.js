// Semantic search (ADR-0004): llm.embed -> int8 vectors, packed into vec/{n}
// keys, brute-force cosine in memory.
//   vec/{n} = {alias, dims, items: [{id, rev, h, v}]}   v = base64 int8, h = text hash
// `rev` (note etag, or `updated` on hosts without etags) lets sync skip unchanged
// notes without reading them; `h` avoids
// re-embedding when a save didn't change the embedded text.
// ponytail: brute force on the main thread — ~5 ms for 2k notes; move to a
// Web Worker / bucket index past ~10k notes.
import { splitFrontmatter } from "./parse.js";

const PREFIX = "vec/";
const MAX_PER_PACK = 25;
const EMBED_BATCH = 64;
const PACK_BUDGET = 56_000;   // bytes per KV value, under the 64 KB default

export function quantize(vec) {
  let max = 0;
  for (const x of vec) max = Math.max(max, Math.abs(x));
  const q = new Int8Array(vec.length);
  if (max) for (let i = 0; i < vec.length; i++) q[i] = Math.round((vec[i] / max) * 127);
  return q;
}

// Scale cancels out, so cosine works directly on the int8 values.
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const toB64 = (q) => {
  const u = new Uint8Array(q.buffer, q.byteOffset, q.length);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
const fromB64 = (s) => {
  const bin = atob(s);
  const q = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
  return q;
};
const hash = (s) => {   // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
};

export const embedText = (note) => `${note.title}\n${splitFrontmatter(note.body ?? "").rest.slice(0, 1500)}`;

// llm.embed(texts) -> {model, vectors}
export function createSemanticIndex(kv, llm) {
  const items = new Map();   // id -> {id, rev, h, q, pack}
  const packs = new Map();   // key -> Set(ids)
  const dirty = new Set();
  let alias = null;
  let dims = 0;
  let running = null, again = false;

  const capacity = () => Math.max(1, Math.min(MAX_PER_PACK, Math.floor(PACK_BUDGET / (Math.ceil(dims / 3) * 4 + 120))));

  function put(rec, q) {
    dims ||= q.length;
    const it = items.get(rec.id);
    if (it) {
      Object.assign(it, { rev: rec.rev, h: rec.h, q });
      dirty.add(it.pack);
      return;
    }
    let key = [...packs].find(([, ids]) => ids.size < capacity())?.[0];
    if (!key) {
      const n = Math.max(-1, ...[...packs.keys()].map((k) => Number(k.slice(PREFIX.length)))) + 1;
      key = PREFIX + n;
      packs.set(key, new Set());
    }
    packs.get(key).add(rec.id);
    items.set(rec.id, { id: rec.id, rev: rec.rev, h: rec.h, q, pack: key });
    dirty.add(key);
  }

  function drop(id) {
    const it = items.get(id);
    packs.get(it.pack)?.delete(id);
    items.delete(id);
    dirty.add(it.pack);
  }

  async function flush() {
    for (const key of dirty) {
      const ids = packs.get(key);
      if (!ids?.size) {
        packs.delete(key);
        await kv.delete({ key });
        continue;
      }
      await kv.set({ key, value: { alias, dims, items: [...ids].map((id) => {
        const it = items.get(id);
        return { id, rev: it.rev, h: it.h, v: toB64(it.q) };
      }) } });
    }
    dirty.clear();
  }

  async function doSync(store, onProgress) {
    const entries = store.entries();
    const live = new Set(entries.map((e) => e.id));
    for (const id of [...items.keys()]) if (!live.has(id)) drop(id);

    const rev = (e) => e.etag ?? e.updated;
    const stale = entries.filter((e) => items.get(e.id)?.rev !== rev(e));
    const todo = [];
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < stale.length) {
        const e = stale[next++];
        const n = await store.get(e.id);
        if (!n) continue;
        const text = embedText(n);
        const h = hash(text);
        const it = items.get(e.id);
        if (it && it.h === h) { it.rev = rev(e); dirty.add(it.pack); }
        else todo.push({ id: e.id, rev: rev(e), h, text });
      }
    }));

    for (let i = 0; i < todo.length; i += EMBED_BATCH) {
      const batch = todo.slice(i, i + EMBED_BATCH);
      const { model, vectors } = await llm.embed(batch.map((b) => b.text));
      if (alias && model && model !== alias) {
        // Embedding model rotated: old vectors are incomparable — rebuild everything.
        for (const key of packs.keys()) dirty.add(key);
        for (const ids of packs.values()) ids.clear();
        items.clear();
        alias = model;
        dims = 0;
        await flush();
        return doSync(store, onProgress);
      }
      alias ??= model;
      batch.forEach((b, j) => put(b, quantize(vectors[j])));
      onProgress?.(Math.min(i + EMBED_BATCH, todo.length), todo.length);
    }
    await flush();
  }

  return {
    size: () => items.size,

    async load() {
      let cursor;
      const keys = [];
      do {
        const r = await kv.list({ prefix: PREFIX, cursor, limit: 1000 });
        keys.push(...(r.entries ?? r.items ?? []).map((x) => x.key));
        cursor = r.cursor ?? r.next_cursor ?? undefined;
      } while (cursor);
      for (const key of keys) {
        const p = (await kv.get({ key })).value;
        if (!p) continue;
        alias ??= p.alias;
        dims ||= p.dims;
        packs.set(key, new Set(p.items.map((x) => x.id)));
        for (const x of p.items) items.set(x.id, { id: x.id, rev: x.rev, h: x.h, q: fromB64(x.v), pack: key });
      }
    },

    // Serialised: a sync requested while one runs is coalesced into one re-run.
    sync(store, { onProgress } = {}) {
      if (running) { again = true; return running; }
      running = doSync(store, onProgress).finally(() => {
        running = null;
        if (again) { again = false; this.sync(store, { onProgress }); }
      });
      return running;
    },

    async search(query, k = 8) {
      if (!items.size) return [];
      const { vectors: [v] } = await llm.embed([query]);
      const q = quantize(v);
      return [...items.values()]
        .map((it) => ({ id: it.id, score: cosine(q, it.q) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}
