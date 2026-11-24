import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks, parseTags, renameLinks, resolveLink, deriveMeta, cleanTitle } from "../src/lib/parse.js";

test("links: plain, alias, heading, folder; embeds and code ignored; deduped", () => {
  const body = [
    "See [[Pricing v2]] and [[Pricing v2|the plan]] and [[Board notes Q2#Decisions]].",
    "Also [[clients/Arjun]] and ![[diagram.png]].",
    "`[[not a link]]`",
    "```",
    "[[also not]]",
    "```",
  ].join("\n");
  assert.deepEqual(parseLinks(body), ["Pricing v2", "Board notes Q2", "clients/Arjun"]);
});

test("tags: inline + frontmatter list/string, nested, no numbers, no headings, case-deduped", () => {
  const body = "---\ntags: [customer, Pricing]\naliases: x\n---\n# Heading\nCall #customer #project/alpha #2024 a#b\n`#code`";
  assert.deepEqual(parseTags(body), ["customer", "Pricing", "project/alpha"]);
  assert.deepEqual(parseTags("---\ntags:\n  - one\n  - two\n---\nbody"), ["one", "two"]);
  assert.deepEqual(parseTags("---\ntags: solo\n---\n"), ["solo"]);
});

test("renameLinks rewrites every form, keeps alias/heading, case-insensitive, leaves others", () => {
  const body = "[[Pricing]] [[pricing|alias]] [[Pricing#H]] [[Pricing v2]] [[x/Pricing]]";
  assert.equal(renameLinks(body, "Pricing", "Pricing v3"),
    "[[Pricing v3]] [[Pricing v3|alias]] [[Pricing v3#H]] [[Pricing v2]] [[x/Pricing v3]]");
});

test("resolveLink: case-insensitive title, folder path, shortest path wins", () => {
  const entries = [
    { id: "a", title: "Arjun", path: "clients" },
    { id: "b", title: "Arjun", path: "archive/2023/clients" },
    { id: "c", title: "Pricing v2", path: "" },
  ];
  assert.equal(resolveLink("pricing V2", entries)?.id, "c");
  assert.equal(resolveLink("Arjun", entries)?.id, "a");
  assert.equal(resolveLink("archive/2023/clients/Arjun", entries)?.id, "b");
  assert.equal(resolveLink("Nope", entries), null);
});

test("cleanTitle removes characters that break [[links]]", () => {
  assert.equal(cleanTitle("AC/DC: Q3 | plan #1 [draft]^x\\y"), "AC-DC: Q3 - plan -1 -draft--x-y");
  assert.equal(cleanTitle("  spaced\nout  "), "spaced out");
});

test("deriveMeta fills links and tags from body", () => {
  const m = deriveMeta({ body: "#idea links to [[Pricing v2]]" });
  assert.deepEqual(m, { links: ["Pricing v2"], tags: ["idea"] });
});
