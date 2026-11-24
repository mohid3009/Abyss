// Note storage on APS `app` scope (ADR-0003).
//   note/{id}  -> full note
//   index/{h}  -> [{id, title, path, tags, links, private, updated, etag}]   h = 0..f
// The index is sharded 16 ways by a hash of the note id: one key would pass
// the 64 KB value cap at ~250 notes; 16 shards hold ~4,000.
// `etag` in an index entry is the note key's etag: it makes the startup
// repair a cheap list-vs-index diff and gives every save its if_match.
// Shared with the abyss-tools Executa later (ADR-0002) — keep it host-agnostic.

export const SCHEMA_V = 1;
export const NOTE_PREFIX = "note/";
export const INDEX_PREFIX = "index/";
const SHARDS = [..."0123456789abcdef"];
// ponytail: hard limit instead of the files.* overflow from ADR-0003 (files.* is a
// stub in the local harness); add the overflow path when a real vault hits it.
export const MAX_NOTE_BYTES = 60_000;
const MAX_SHARD_BYTES = 60_000;
const INDEX_RETRIES = 3;

export class ConflictError extends Error {}

const isConflict = (e) => e?.code === -32023 || /if_match|precondition|\b412\b/i.test(e?.message ?? "");
const now = () => new Date().toISOString();
const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
const shardOf = (id) => {   // FNV-1a, low 4 bits
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return SHARDS[h & 15];
};

export function newNote({ title, body = "", path = "", tags = [], links = [] }) {
  const t = now();
  return { v: SCHEMA_V, id: crypto.randomUUID(), title, path, body, tags, links,
           private: false, created: t, updated: t, imported: null };
}

const entryOf = (n, etag) => ({ id: n.id, title: n.title, path: n.path ?? "", tags: n.tags ?? [],
  links: n.links ?? [], private: !!n.private, updated: n.updated, etag });

// if_match for a write: the known etag; "" = must not exist yet; undefined =
// exists but the host gave us no etag (dev harness) — write unguarded.
// ponytail: the dev harness ignores if_match entirely, so conflict handling is
// only exercised by tests (memKv) and the production APS.
const guard = (etag, exists) => etag ?? (exists ? undefined : "");

export function createStore(kv) {
  const shards = new Map(SHARDS.map((s) => [s, { entries: [], etag: null, exists: false }]));
  let flat = [];
  const reflatten = () => { flat = [...shards.values()].flatMap((s) => s.entries); };

  async function readShard(s) {
    const r = await kv.get({ key: INDEX_PREFIX + s });
    shards.set(s, { entries: r.value ?? [], etag: r.etag ?? null, exists: r.value != null });
  }

  // Upsert `entries` and remove `removeIds`, shard by shard, each with if_match;
  // on a concurrent write, re-read that shard and re-apply (the other writer's
  // entries survive). If a shard can't be written, memory is still updated (so
  // the next save uses the right etag) and the error is rethrown — the startup
  // repair persists it later.
  async function updateIndex(entries = [], removeIds = []) {
    const touched = new Map();
    for (const e of entries) (touched.get(shardOf(e.id)) ?? touched.set(shardOf(e.id), { up: [], rm: [] }).get(shardOf(e.id))).up.push(e);
    for (const id of removeIds) (touched.get(shardOf(id)) ?? touched.set(shardOf(id), { up: [], rm: [] }).get(shardOf(id))).rm.push(id);
    let failure = null;
    for (const [s, { up, rm }] of touched) {
      const drop = new Set([...rm, ...up.map((e) => e.id)]);
      const apply = (cur) => [...cur.filter((e) => !drop.has(e.id)), ...up];
      for (let attempt = 0; ; attempt++) {
        const sh = shards.get(s);
        const next = apply(sh.entries);
        try {
          if (bytes(next) > MAX_SHARD_BYTES) throw new Error("Vault too large for this version of Abyss (about 4,000 notes max)");
          const r = await kv.set({ key: INDEX_PREFIX + s, value: next, if_match: guard(sh.etag, sh.exists) });
          shards.set(s, { entries: next, etag: r.etag ?? null, exists: true });
          break;
        } catch (e) {
          if (isConflict(e) && attempt < INDEX_RETRIES) { await readShard(s); continue; }
          shards.set(s, { ...sh, entries: next });   // memory only; see above
          failure ??= e;
          break;
        }
      }
    }
    reflatten();
    if (failure) throw failure;
  }

  async function writeNote(note, { imported = false } = {}) {
    let t = now();
    // "untouched since import" is updated === imported, so a normal save must never
    // land on the import's exact millisecond.
    if (!imported && t === note.imported) t = new Date(Date.parse(t) + 1).toISOString();
    const saved = { ...note, v: SCHEMA_V, updated: t, ...(imported && { imported: t }) };
    if (bytes(saved) > MAX_NOTE_BYTES) {
      throw new Error(`Note "${note.title}" is too large (over ${MAX_NOTE_BYTES / 1000} KB)`);
    }
    const entry = flat.find((e) => e.id === note.id);
    let r;
    try {
      r = await kv.set({ key: NOTE_PREFIX + note.id, value: saved, if_match: guard(entry?.etag, !!entry) });
    } catch (e) {
      if (isConflict(e)) throw new ConflictError(`"${note.title}" changed somewhere else. Reload to get the latest version.`);
      throw e;
    }
    Object.assign(note, { v: SCHEMA_V, updated: saved.updated, imported: saved.imported ?? null });
    return entryOf(saved, r.etag ?? null);
  }

  async function listNoteKeys() {
    const out = [];
    let cursor;
    do {
      const r = await kv.list({ prefix: NOTE_PREFIX, cursor, limit: 1000 });
      out.push(...(r.entries ?? r.items ?? []));      // APS: entries/cursor; dev harness: items/next_cursor
      cursor = r.cursor ?? r.next_cursor ?? undefined;
    } while (cursor);
    return out;
  }

  return {
    entries: () => flat,

    // Load the index, then repair it against the real note keys (crash between
    // the note write and the index write, or a writer that died mid-save).
    // A repair that can't be persisted is kept in memory so the app still opens.
    async load() {
      await Promise.all(SHARDS.map(readShard));
      reflatten();
      const byId = new Map(flat.map((e) => [e.id, e]));
      const listed = await listNoteKeys();
      const seen = new Set();
      const fixes = [];
      for (const { key, etag } of listed) {
        const id = key.slice(NOTE_PREFIX.length);
        seen.add(id);
        if (etag && byId.get(id)?.etag === etag) continue;
        const r = await kv.get({ key });
        if (r.value) fixes.push(entryOf(r.value, r.etag ?? etag ?? null));
      }
      const dropped = flat.filter((e) => !seen.has(e.id)).map((e) => e.id);
      if (fixes.length || dropped.length) {
        try { await updateIndex(fixes, dropped); }
        catch (e) { console.warn("Abyss: index repair not saved:", e.message); }
      }
      return flat;
    },

    async get(id) {
      return (await kv.get({ key: NOTE_PREFIX + id })).value ?? null;
    },

    // Writes the note guarded by the etag we last saw (from the index), then
    // the index. Throws ConflictError if someone else changed the note first.
    // `imported: true` stamps imported = updated (ADR-0007 re-import check).
    async save(note, opts = {}) {
      await updateIndex([await writeNote(note, opts)]);
      return note;
    },

    // Bulk save (import): notes written `concurrency` at a time, then one write
    // per touched index shard. Returns [{note, error}] for notes that failed.
    async saveAll(notes, { imported = false, concurrency = 8, onProgress } = {}) {
      const entries = [], failed = [];
      let next = 0, done = 0;
      const worker = async () => {
        while (next < notes.length) {
          const note = notes[next++];
          try { entries.push(await writeNote(note, { imported })); }
          catch (error) { failed.push({ note, error }); }
          onProgress?.(++done, notes.length);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (entries.length) await updateIndex(entries);
      return failed;
    },

    async remove(id) {
      await kv.delete({ key: NOTE_PREFIX + id });
      await updateIndex([], [id]);
    },
  };
}
