import { test } from "node:test";
import assert from "node:assert/strict";
import { memKv } from "../src/lib/memkv.js";
import { createStore, newNote, ConflictError, INDEX_PREFIX } from "../src/lib/store.js";

test("save creates note and index entry; update keeps one entry", async () => {
  const s = createStore(memKv());
  await s.load();
  const n = newNote({ title: "Pricing v2", body: "annual" });
  await s.save(n);
  n.body = "annual, 2 months free";
  await s.save(n);
  assert.equal(s.entries().length, 1);
  assert.equal(s.entries()[0].title, "Pricing v2");
  assert.equal((await s.get(n.id)).body, "annual, 2 months free");
  assert.equal((await s.get(n.id)).v, 1);
});

test("stale note write raises ConflictError", async () => {
  const kv = memKv();
  const a = createStore(kv), b = createStore(kv);
  await a.load();
  const n = newNote({ title: "Arjun" });
  await a.save(n);
  await b.load();
  await b.save({ ...n, body: "from chat" });   // b wins
  await assert.rejects(a.save({ ...n, body: "stale" }), ConflictError);
});

test("concurrent index writers both survive (etag retry)", async () => {
  const kv = memKv();
  const ui = createStore(kv), executa = createStore(kv);
  await ui.load();
  await executa.load();
  await executa.save(newNote({ title: "From chat" }));  // ui's cached index etag is now stale
  await ui.save(newNote({ title: "From UI" }));
  const fresh = createStore(kv);
  await fresh.load();
  assert.deepEqual(fresh.entries().map((e) => e.title).sort(), ["From UI", "From chat"]);
});

test("load repairs index after a crash between note and index writes", async () => {
  const kv = memKv();
  const s = createStore(kv);
  await s.load();
  const kept = newNote({ title: "Kept" }), gone = newNote({ title: "Gone" });
  await s.save(kept);
  await s.save(gone);
  // crash simulations: orphan note with no index entry, edited note, deleted note
  const orphan = newNote({ title: "Orphan" });
  await kv.set({ key: `note/${orphan.id}`, value: orphan });
  await kv.set({ key: `note/${kept.id}`, value: { ...kept, title: "Kept (renamed)" } });
  await kv.delete({ key: `note/${gone.id}` });

  const r = createStore(kv);
  await r.load();
  assert.deepEqual(r.entries().map((e) => e.title).sort(), ["Kept (renamed)", "Orphan"]);
  const fresh = createStore(kv);
  await fresh.load();
  assert.equal(fresh.entries().length, 2, "repaired index is persisted");
  const shards = (await kv.list({ prefix: INDEX_PREFIX })).entries;
  let persisted = 0;
  for (const { key } of shards) persisted += (await kv.get({ key })).value.length;
  assert.equal(persisted, 2);
});

test("load pages through more than one list page", async () => {
  const kv = memKv();
  for (let i = 0; i < 1005; i++) {
    const n = newNote({ title: `n${i}` });
    await kv.set({ key: `note/${n.id}`, value: n });
  }
  const s = createStore(kv);
  await s.load();
  assert.equal(s.entries().length, 1005);
});

test("remove deletes note and index entry", async () => {
  const s = createStore(memKv());
  await s.load();
  const n = newNote({ title: "Temp" });
  await s.save(n);
  await s.remove(n.id);
  assert.equal(s.entries().length, 0);
  assert.equal(await s.get(n.id), null);
});

// The anna-app dev harness ("legacy in-memory" backend) returns no etags from
// get/set, ignores if_match, and lists as {items, next_cursor}.
function legacyKv() {
  const kv = memKv();
  return {
    get: async (a) => ({ value: (await kv.get(a)).value }),
    set: async ({ key, value }) => { await kv.set({ key, value }); return { ok: true }; },
    delete: (a) => kv.delete(a),
    list: async (a) => {
      const r = await kv.list(a);
      return { items: r.entries.map((e) => ({ ...e, size_bytes: 1 })), next_cursor: r.cursor };
    },
  };
}

test("works on a host without etags (dev harness shape)", async () => {
  const kv = legacyKv();
  const s = createStore(kv);
  await s.load();
  const n = newNote({ title: "A" });
  await s.save(n);
  await s.save({ ...n, body: "edited" });
  await s.save(newNote({ title: "B" }));
  const r = createStore(kv);
  await r.load();
  assert.deepEqual(r.entries().map((e) => e.title).sort(), ["A", "B"]);
  assert.equal((await r.get(n.id)).body, "edited");
  await r.save({ ...(await r.get(n.id)), body: "again" });   // no stale-etag false conflict
});

test("a 2,000-note vault fits: index shards stay under the 64 KB value cap", async () => {
  const kv = memKv();
  const s = createStore(kv);
  await s.load();
  const notes = Array.from({ length: 2000 }, (_, i) => newNote({
    title: `Customer call ${i} — renewal and integrations`, path: "customers/2026",
    tags: ["customer", "call"], links: [`Customer call ${i + 1} — renewal and integrations`, "Pricing v2", "Integrations roadmap"],
  }));
  assert.deepEqual(await s.saveAll(notes), []);
  const r = createStore(kv);
  await r.load();
  assert.equal(r.entries().length, 2000);
});

test("emoji/CJK size is measured in bytes, with the friendly error", async () => {
  const s = createStore(memKv());
  await s.load();
  await assert.rejects(s.save(newNote({ title: "Big", body: "日本語".repeat(8_000) })), /too large/);
});

test("oversized note is rejected before writing", async () => {
  const s = createStore(memKv());
  await s.load();
  await assert.rejects(s.save(newNote({ title: "Big", body: "x".repeat(61_000) })), /too large/);
  assert.equal(s.entries().length, 0);
});

// The live Anna host rejected the "only if it doesn't exist yet" guard (if_match: "") for new
// keys, which looked like an edit conflict ("changed somewhere else") on every new note.
const rejecting = (rejectIf) => {
  const kv = memKv();
  return { ...kv, set: async (a) => {
    if (a.if_match !== undefined && rejectIf(a.if_match)) throw Object.assign(new Error("precondition failed"), { code: -32023 });
    return kv.set(a);
  } };
};

test("a host that rejects the empty if_match guard still saves new notes and shards", async () => {
  const kv = rejecting((m) => m === "");
  const s = createStore(kv);
  await s.load();
  const n = newNote({ title: "Project Task Assignments" });
  await s.save(n);
  await s.save({ ...n, body: "edited" });
  const r = createStore(kv);
  await r.load();
  assert.deepEqual(r.entries().map((e) => e.title), ["Project Task Assignments"]);
  assert.equal((await r.get(n.id)).body, "edited");
});

test("a host that rejects every if_match guard still saves, updates and imports", async () => {
  const kv = rejecting(() => true);
  const s = createStore(kv);
  await s.load();
  const a = newNote({ title: "A" });
  await s.save(a);
  await s.save({ ...a, body: "edited" });
  assert.deepEqual(await s.saveAll([newNote({ title: "B" }), newNote({ title: "C" })]), []);
  const r = createStore(kv);
  await r.load();
  assert.deepEqual(r.entries().map((e) => e.title).sort(), ["A", "B", "C"]);
});

test("with a rejecting host, a note really changed elsewhere is still reported as a conflict", async () => {
  const base = memKv();
  const kv = { ...base, set: async (a) => {
    if (a.if_match !== undefined) throw Object.assign(new Error("precondition failed"), { code: -32023 });
    return base.set(a);
  } };
  const a = createStore(kv), b = createStore(kv);
  await a.load();
  const n = newNote({ title: "Shared" });
  await a.save(n);
  await b.load();
  await b.save({ ...n, body: "from the other writer" });
  await assert.rejects(a.save({ ...n, body: "stale" }), ConflictError);
});
