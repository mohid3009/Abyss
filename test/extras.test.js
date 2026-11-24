import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { topoPath } from "../src/lib/topo.js";
import { parseRepo, fetchRepoZip } from "../src/lib/github.js";
import { graphData } from "../src/lib/graphdata.js";
import { memKv } from "../src/lib/memkv.js";
import { createStore } from "../src/lib/store.js";
import { importVault } from "../src/lib/vaultzip.js";

test("topoPath draws many contour segments and is deterministic", () => {
  const p = topoPath();
  assert.ok((p.match(/M/g) ?? []).length > 500);
  assert.equal(p, topoPath());
});

test("parseRepo handles shorthand, branch, tree URL, .git and junk", () => {
  assert.deepEqual(parseRepo("octo/notes"), { owner: "octo", repo: "notes", ref: "" });
  assert.deepEqual(parseRepo("octo/notes@dev"), { owner: "octo", repo: "notes", ref: "dev" });
  assert.deepEqual(parseRepo("https://github.com/octo/notes.git"), { owner: "octo", repo: "notes", ref: "" });
  assert.deepEqual(parseRepo("https://github.com/octo/notes/tree/main"), { owner: "octo", repo: "notes", ref: "main" });
  assert.equal(parseRepo("not a repo"), null);
});

test("fetchRepoZip lists the tree, downloads markdown only, and builds a zip", async () => {
  const urls = [];
  const fetchFn = async (u) => {
    urls.push(u);
    if (u.includes("/git/trees/")) return { ok: true, status: 200, json: async () => ({ sha: "abc", tree: [
      { type: "blob", path: "README.md" }, { type: "blob", path: "docs/My Note.md" }, { type: "blob", path: "img/a.png" },
      { type: "blob", path: ".github/x.md" }, { type: "tree", path: "docs" }] }) };
    return { ok: true, status: 200, text: async () => "body of " + u.split("/").pop() };
  };
  const { bytes } = await fetchRepoZip({ owner: "o", repo: "r", ref: "" }, { fetchFn, JSZip });
  const z = await JSZip.loadAsync(bytes);
  assert.deepEqual(Object.keys(z.files).filter((n) => !z.files[n].dir).sort(), ["README.md", "docs/My Note.md"]);
  assert.ok(urls.some((u) => u.endsWith("/git/trees/HEAD?recursive=1")));
  assert.ok(urls.some((u) => u.includes("/HEAD/docs/My%20Note.md")));
});

test("fetchRepoZip gives specific errors", async () => {
  const mk = (status) => async () => ({ status, ok: status < 400, json: async () => ({ tree: [] }) });
  await assert.rejects(fetchRepoZip({ owner: "o", repo: "r", ref: "" }, { fetchFn: mk(404), JSZip }), /public/);
  await assert.rejects(fetchRepoZip({ owner: "o", repo: "r", ref: "" }, { fetchFn: mk(403), JSZip }), /rate limiting/);
  await assert.rejects(fetchRepoZip({ owner: "o", repo: "r", ref: "" }, { fetchFn: mk(200), JSZip }), /No markdown/);
});

test("stripRoot drops the GitHub zip's single top folder", async () => {
  const zip = new JSZip();
  zip.file("octo-notes-abc123/Idea.md", "hello [[Other]]");
  zip.file("octo-notes-abc123/docs/Other.md", "x");
  const s = createStore(memKv());
  await s.load();
  await importVault(s, await zip.generateAsync({ type: "uint8array" }), { stripRoot: true });
  assert.deepEqual(s.entries().map((e) => e.path).sort(), ["", "docs"]);
});

test("graphData can hide unresolved (ghost) notes", () => {
  const e = [{ id: "a", title: "A", links: ["Missing"], tags: [], path: "" }];
  assert.equal(graphData(e).nodes.length, 2);
  assert.equal(graphData(e, { ghosts: false }).nodes.length, 1);
});
