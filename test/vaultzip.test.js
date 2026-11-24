import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { memKv } from "../src/lib/memkv.js";
import { createStore } from "../src/lib/store.js";
import { saveNote, backlinks } from "../src/lib/vault.js";
import { importVault, exportVault } from "../src/lib/vaultzip.js";

const PRICING = "# Pricing v2\nAnnual plan: 2 months free. Asked by [[Arjun]].\n";
const ARJUN = "---\ntags: [customer]\nstatus: active\n---\nCustomer since March. See [[Pricing v2|pricing]].\n";

async function vaultZip(files) {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "uint8array" });
}

const base = () => vaultZip({
  "MyVault/Pricing v2.md": PRICING,
  "MyVault/clients/Arjun.md": ARJUN,
  "MyVault/.obsidian/app.json": "{}",
  "MyVault/img/photo.png": "PNG",
});

async function freshStore() {
  const s = createStore(memKv());
  await s.load();
  return s;
}
const byTitle = (s, t) => s.entries().find((e) => e.title === t);

test("import: strips root folder, keeps folders as path, frontmatter tags, links resolve, skips .obsidian", async () => {
  const s = await freshStore();
  const r = await importVault(s, await base());
  assert.deepEqual({ created: r.created, attachments: r.attachments }, { created: 2, attachments: 1 });
  const arjun = byTitle(s, "Arjun");
  assert.equal(arjun.path, "clients");
  assert.deepEqual(arjun.tags, ["customer"]);
  assert.equal((await s.get(arjun.id)).body, ARJUN, "frontmatter kept verbatim");
  assert.deepEqual(backlinks(s.entries(), arjun).map((e) => e.title), ["Pricing v2"]);
});

test("export round-trips unedited notes byte-identical, folders restored", async () => {
  const s = await freshStore();
  await importVault(s, await base());
  const out = await JSZip.loadAsync(await exportVault(s, { type: "uint8array" }));
  assert.deepEqual(Object.keys(out.files).filter((n) => !out.files[n].dir).sort(), ["Pricing v2.md", "clients/Arjun.md"]);
  assert.equal(await out.file("Pricing v2.md").async("string"), PRICING);
  assert.equal(await out.file("clients/Arjun.md").async("string"), ARJUN);
});

test("re-import: unedited note updates in place, edited note keeps Abyss version + conflict copy, nothing deleted", async () => {
  const s = await freshStore();
  await importVault(s, await base());
  const pricingId = byTitle(s, "Pricing v2").id;
  // user edits Arjun inside Abyss
  const arjun = await s.get(byTitle(s, "Arjun").id);
  await saveNote(s, { ...arjun, body: arjun.body + "Edited in Abyss.\n" });
  // vault changed in Obsidian: both notes edited, a new note added, nothing else
  const r = await importVault(s, await vaultZip({
    "Pricing v2.md": PRICING + "Now 3 months free.\n",
    "clients/Arjun.md": ARJUN + "Edited in Obsidian.\n",
    "New idea.md": "fresh",
  }));
  assert.deepEqual({ created: r.created, updated: r.updated, conflicts: r.conflicts }, { created: 1, updated: 1, conflicts: ["Arjun"] });
  assert.equal(byTitle(s, "Pricing v2").id, pricingId, "updated in place");
  assert.match((await s.get(pricingId)).body, /3 months/);
  assert.match((await s.get(arjun.id)).body, /Edited in Abyss/, "Abyss edit kept");
  const copy = s.entries().find((e) => e.title.startsWith("Arjun (imported "));
  assert.equal(copy.path, "clients");
  assert.match((await s.get(copy.id)).body, /Edited in Obsidian/);
  assert.equal(s.entries().length, 4, "nothing deleted");
});

test("re-importing with an unresolved conflict does not pile up more copies", async () => {
  const s = await freshStore();
  await importVault(s, await base());
  const arjun = await s.get(byTitle(s, "Arjun").id);
  await saveNote(s, { ...arjun, body: "Edited in Abyss." });
  await importVault(s, await base());               // conflict copy #1
  const r = await importVault(s, await base());     // same vault again
  assert.deepEqual(r.conflicts, []);
  assert.equal(s.entries().filter((e) => e.title.startsWith("Arjun (imported ")).length, 1);
});

test("re-import of an unchanged vault changes nothing", async () => {
  const s = await freshStore();
  await importVault(s, await base());
  const r = await importVault(s, await base());
  assert.deepEqual({ created: r.created, updated: r.updated, unchanged: r.unchanged }, { created: 0, updated: 0, unchanged: 2 });
});

test("a single top folder without .obsidian is a real folder, not stripped", async () => {
  const s = await freshStore();
  await importVault(s, await vaultZip({ "Notes/a.md": "a", "Notes/b.md": "b" }));
  assert.deepEqual(s.entries().map((e) => e.path), ["Notes", "Notes"]);
});

test("zip entries differing only in case: second is skipped, not duplicated", async () => {
  const s = await freshStore();
  const r = await importVault(s, await vaultZip({ "Idea.md": "one", "idea.md": "two" }));
  assert.equal(r.created, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /same name/);
});

test("oversized notes are reported, the rest import", async () => {
  const s = await freshStore();
  const r = await importVault(s, await vaultZip({ "big.md": "x".repeat(70_000), "ok.md": "fine" }));
  assert.equal(r.created, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /too large/);
});
