import { test } from "node:test";
import assert from "node:assert/strict";
import { memKv } from "../src/lib/memkv.js";
import { createStore, newNote } from "../src/lib/store.js";
import { saveNote } from "../src/lib/vault.js";
import { createChatTools, AccessError } from "../src/lib/chattools.js";

async function vault(settings) {
  const kv = memKv();
  if (settings) await kv.set({ key: "settings", value: settings });
  const store = createStore(kv);
  await store.load();
  const add = async (title, body, extra = {}) => { const n = Object.assign(newNote({ title, body }), extra); await saveNote(store, n); return n; };
  await add("Pricing v2", "Annual plan: 2 months free. Raised by [[Arjun]].");
  await add("Arjun", "Customer at Northwind. #customer", { path: "customers" });
  await add("Personal finances", "salary and savings secrets", { private: true });
  return { kv, store, add };
}
const names = (r) => r.results.map((x) => x.title);

test("defaults: chat access on, sharing with other apps off", async () => {
  const { kv } = await vault();
  assert.ok((await createChatTools(kv).search_notes({ query: "annual" })).results.length);
  await assert.rejects(createChatTools(kv, { caller: "ppt-app" }).search_notes({ query: "annual" }), /sharing with other apps is off/);
});

test("turning chat access off blocks every tool", async () => {
  const { kv } = await vault({ chatAccess: false });
  const t = createChatTools(kv);
  for (const [name, args] of [["search_notes", { query: "annual" }], ["read_note", { title: "Arjun" }], ["create_note", { title: "X" }], ["append_note", { title: "Arjun", text: "y" }]]) {
    await assert.rejects(t[name](args), AccessError, name);
  }
});

test("sharing on lets another app in, but private notes stay hidden", async () => {
  const { kv } = await vault({ chatAccess: true, sharing: true });
  const t = createChatTools(kv, { caller: "ppt-app" });
  assert.ok((await t.search_notes({ query: "pricing" })).results.length);
  assert.equal((await t.read_note({ title: "Personal finances" })).found, false);
});

test("private notes are never searched, read, created over or appended to", async () => {
  const { kv, store } = await vault();
  const t = createChatTools(kv);
  assert.deepEqual(names(await t.search_notes({ query: "salary savings secrets finances" })), []);
  const read = await t.read_note({ title: "Personal finances" });
  assert.equal(read.found, false);
  assert.equal(read.message, (await t.read_note({ title: "Nothing here" })).message.replace("Nothing here", "Personal finances"), "same answer as a missing note");
  assert.equal((await t.append_note({ title: "Personal finances", text: "hacked" })).appended, false);
  const created = await t.create_note({ title: "Personal finances", body: "new" });
  assert.equal(created.created, true);
  assert.equal(created.title, "Personal finances 2", "picks a free title instead of colliding with the private note");
  const priv = store.entries().find((e) => e.title === "Personal finances");
  assert.equal((await store.get(priv.id)).body, "salary and savings secrets");
});

test("search ranks title and tag matches first and returns a snippet", async () => {
  const { kv } = await vault();
  const r = await createChatTools(kv).search_notes({ query: "customer northwind" });
  assert.equal(r.results[0].title, "Arjun");
  assert.match(r.results[0].snippet, /Northwind/);
  assert.deepEqual((await createChatTools(kv).search_notes({ query: "" })).results, []);
});

test("read_note finds by title, case insensitive and by folder path", async () => {
  const { kv } = await vault();
  const t = createChatTools(kv);
  assert.equal((await t.read_note({ title: "pricing V2" })).found, true);
  assert.equal((await t.read_note({ title: "customers/Arjun" })).body.includes("Northwind"), true);
});

test("create_note writes a linked, tagged note the UI will see; duplicate title is not recreated", async () => {
  const { kv } = await vault();
  const t = createChatTools(kv);
  const r = await t.create_note({ title: "Call / Dana", body: "Wants Slack. See [[Arjun]].", tags: ["Customer", "call notes", "2024"] });
  assert.equal(r.created, true);
  assert.equal(r.title, "Call - Dana", "slashes cleaned so [[links]] keep working");
  const fresh = createStore(kv);
  await fresh.load();
  const e = fresh.entries().find((x) => x.title === "Call - Dana");
  assert.deepEqual(e.links, ["Arjun"]);
  assert.deepEqual(e.tags, ["customer", "call-notes"]);
  const again = await t.create_note({ title: "Call - Dana" });
  assert.equal(again.created, false);
  assert.equal(again.exists, true);
});

test("append_note adds to an existing note and reports a missing one", async () => {
  const { kv } = await vault();
  const t = createChatTools(kv);
  assert.equal((await t.append_note({ title: "Arjun", text: "Promised the Slack timeline by Friday." })).appended, true);
  const body = (await t.read_note({ title: "Arjun" })).body;
  assert.match(body, /Northwind[\s\S]*Promised the Slack timeline/);
  assert.equal((await t.append_note({ title: "Missing", text: "x" })).appended, false);
  await assert.rejects(t.append_note({ title: "Arjun", text: "  " }), /required/);
});

test("large input is capped", async () => {
  const { kv } = await vault();
  const t = createChatTools(kv);
  await t.create_note({ title: "Big", body: "x".repeat(50_000) });
  const r = await t.read_note({ title: "Big" });
  assert.ok(r.body.length <= 20_000 + 10);
});
