import { test } from "node:test";
import assert from "node:assert/strict";
import { memKv } from "../src/lib/memkv.js";
import { createStore, newNote } from "../src/lib/store.js";
import { saveNote, renameNote, backlinks, linkNotes } from "../src/lib/vault.js";

async function vault() {
  const s = createStore(memKv());
  await s.load();
  const pricing = newNote({ title: "Pricing" });
  const call = newNote({ title: "Call", body: "Discussed [[Pricing]] and [[pricing|plan]]. #customer" });
  const other = newNote({ title: "Other", body: "No links here." });
  for (const n of [pricing, call, other]) await saveNote(s, n);
  return { s, pricing, call, other };
}

test("saveNote derives links and tags into the index", async () => {
  const { s, call } = await vault();
  const e = s.entries().find((x) => x.id === call.id);
  assert.deepEqual(e.links, ["Pricing"]);
  assert.deepEqual(e.tags, ["customer"]);
});

test("backlinks finds notes linking to a note", async () => {
  const { s, pricing, call } = await vault();
  assert.deepEqual(backlinks(s.entries(), pricing).map((e) => e.id), [call.id]);
});

test("renameNote rewrites inbound links and keeps backlinks", async () => {
  const { s, pricing, call } = await vault();
  await renameNote(s, pricing, "Pricing v2");
  assert.equal((await s.get(call.id)).body, "Discussed [[Pricing v2]] and [[Pricing v2|plan]]. #customer");
  assert.equal((await s.get(pricing.id)).title, "Pricing v2");
  assert.deepEqual(backlinks(s.entries(), { ...pricing, title: "Pricing v2" }).map((e) => e.id), [call.id]);
});

test("renameNote that fails to save keeps the old title in memory", async () => {
  const { s, pricing } = await vault();
  const failing = { ...s, entries: s.entries, save: async () => { throw new Error("network down"); } };
  await assert.rejects(renameNote(failing, pricing, "Pricing v3"), /network down/);
  assert.equal(pricing.title, "Pricing");
});

test("renameNote refuses a duplicate title in the same folder", async () => {
  const { s, pricing } = await vault();
  await assert.rejects(renameNote(s, pricing, "other"), /already exists/);
});

test("linkNotes appends a Related line, extends it, and skips duplicates and self", async () => {
  const { s, pricing, other } = await vault();
  const t = (e) => ({ id: e.id, title: e.title, path: e.path });
  const r1 = await linkNotes(s, other.id, t(pricing));
  assert.equal(r1.added, true);
  assert.equal((await s.get(other.id)).body, "No links here.\n\nRelated: [[Pricing]]\n");
  const third = newNote({ title: "Third" });
  await saveNote(s, third);
  await linkNotes(s, other.id, t(third));
  assert.match((await s.get(other.id)).body, /Related: \[\[Pricing\]\] · \[\[Third\]\]\n$/);
  assert.equal((await linkNotes(s, other.id, t(pricing))).reason, "exists");
  assert.equal((await linkNotes(s, other.id, t(other))).reason, "self");
  assert.deepEqual(backlinks(s.entries(), pricing).map((e) => e.id).includes(other.id), true);
});
