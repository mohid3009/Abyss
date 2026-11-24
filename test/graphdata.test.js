import { test } from "node:test";
import assert from "node:assert/strict";
import { graphData, matchesQuery } from "../src/lib/graphdata.js";

const E = (id, title, links = [], tags = [], path = "") => ({ id, title, links, tags, path, private: false, updated: "" });
const entries = [
  E("p", "Pricing v2", ["Board notes Q2"], ["pricing"]),
  E("b", "Board notes Q2", ["Pricing v2"], ["metrics"]),
  E("c", "Call", ["Pricing v2", "Arjun", "Missing note"], ["customer"], "customers"),
  E("a", "Arjun", ["call"], ["customer"], "customers"),
  E("o", "Lonely", []),
];
const ids = (g) => g.nodes.map((n) => n.id).sort();

test("whole graph: resolved edges deduped (a<->b once), ghost for unresolved, degree counted", () => {
  const g = graphData(entries);
  assert.deepEqual(ids(g), ["a", "b", "c", "ghost:missing note", "o", "p"]);
  assert.equal(g.links.length, 4);   // p-b, c-p, c-a, c-ghost
  const deg = Object.fromEntries(g.nodes.map((n) => [n.id, n.degree]));
  assert.deepEqual(deg, { p: 2, b: 1, c: 3, a: 1, "ghost:missing note": 1, o: 0 });
  assert.equal(g.nodes.find((n) => n.id.startsWith("ghost:")).ghost, true);
});

test("orphans can be hidden", () => {
  assert.ok(!ids(graphData(entries, { orphans: false })).includes("o"));
});

test("local graph respects depth", () => {
  assert.deepEqual(ids(graphData(entries, { center: "a", depth: 1 })), ["a", "c"]);
  assert.deepEqual(ids(graphData(entries, { center: "a", depth: 2 })), ["a", "c", "ghost:missing note", "p"]);
});

test("search filter keeps matching nodes and edges between them", () => {
  const g = graphData(entries, { filter: "#customer" });
  assert.deepEqual(ids(g), ["a", "c"]);
  assert.equal(g.links.length, 1);
});

test("colour groups: first matching rule wins", () => {
  const g = graphData(entries, { groups: [{ query: "#customer", color: "#22aa55" }, { query: "path:customers", color: "#0000ff" }, { query: "pricing", color: "#3366ff" }] });
  const col = Object.fromEntries(g.nodes.map((n) => [n.id, n.color ?? null]));
  assert.equal(col.a, "#22aa55");
  assert.equal(col.p, "#3366ff");
  assert.equal(col.o, null);
});

test("matchesQuery: #tag prefix for nested tags, path:, title substring", () => {
  const n = { title: "Call", tags: ["project/alpha"], path: "customers/eu" };
  assert.ok(matchesQuery(n, "#project"));
  assert.ok(matchesQuery(n, "path:customers"));
  assert.ok(matchesQuery(n, "cal"));
  assert.ok(!matchesQuery(n, "#proj"));
});

test("2,000 notes build in well under 100 ms", () => {
  const big = Array.from({ length: 2000 }, (_, i) => E(String(i), `Note ${i}`, [`Note ${(i * 7) % 2000}`, `Note ${(i * 13) % 2000}`, `Ghost ${i % 50}`]));
  const t = performance.now();
  const g = graphData(big);
  assert.ok(performance.now() - t < 100, `took ${performance.now() - t} ms`);
  assert.equal(g.nodes.length, 2050);
});
