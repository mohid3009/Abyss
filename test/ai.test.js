import { test } from "node:test";
import assert from "node:assert/strict";
import { memKv } from "../src/lib/memkv.js";
import { createStore, newNote } from "../src/lib/store.js";
import { saveNote } from "../src/lib/vault.js";
import { parseJson, ask, capture } from "../src/lib/ai.js";

// llm.complete returns queued replies in order; search returns all notes.
function fakes(replies) {
  const queue = [...replies];
  const prompts = [];
  return {
    prompts,
    llm: { async complete(req) { prompts.push(req); const r = queue.shift(); if (r instanceof Error) throw r; return r; } },
    index: (store) => ({ search: async () => [...store.entries()].sort((a, b) => a.title.localeCompare(b.title)).map((e) => ({ id: e.id, score: 0.5 })) }),
  };
}

async function vault() {
  const store = createStore(memKv());
  await store.load();
  for (const [title, body] of [["Pricing v2", "Annual plan: 2 months free."], ["Board notes Q2", "Approved annual pricing."], ["Arjun", "Customer at Northwind."]]) {
    await saveNote(store, newNote({ title, body }));
  }
  return store;
}

test("parseJson: plain, fenced, with prose around it", () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure! Here it is: {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.throws(() => parseJson("no json"));
});

test("ask: answer keeps only citations that are real provided notes", async () => {
  const store = await vault();
  const f = fakes([JSON.stringify({ found: true, answer: "Annual = 10x monthly.", citations: ["pricing v2", "Board notes Q2", "Invented note"] })]);
  const r = await ask({ question: "annual pricing?", store, index: f.index(store), llm: f.llm });
  assert.equal(r.found, true);
  assert.equal(r.answer, "Annual = 10x monthly.");
  assert.deepEqual(r.citations.map((c) => c.title), ["Pricing v2", "Board notes Q2"]);
  assert.match(f.prompts[0].prompt, /Annual plan: 2 months free/, "notes are in the prompt");
});

test("ask: citations by number, 'Note N: Title' and [[Title]] all resolve; out-of-range dropped", async () => {
  const store = await vault();
  const f = fakes([JSON.stringify({ found: true, answer: "x", citations: [2, "Note 3: Pricing v2", "[[Arjun]]", 9, "Note 7"] })]);
  const r = await ask({ question: "q", store, index: f.index(store), llm: f.llm });
  // search order (title-sorted): 1 Arjun, 2 Board notes Q2, 3 Pricing v2
  assert.deepEqual(r.citations.map((c) => c.title), ["Board notes Q2", "Pricing v2", "Arjun"]);
});

test("ask: same title in two folders — the cited note is the one opened (by id)", async () => {
  const store = createStore(memKv());
  await store.load();
  const a = newNote({ title: "Arjun", path: "clients", body: "current" });
  const b = newNote({ title: "Arjun", path: "archive", body: "old" });
  await saveNote(store, a);
  await saveNote(store, b);
  const f = { llm: { complete: async () => JSON.stringify({ found: true, answer: "x", citations: [2] }) } };
  const index = { search: async () => [{ id: a.id }, { id: b.id }] };
  const r = await ask({ question: "q", store, index, llm: f.llm });
  assert.deepEqual(r.citations.map((c) => c.id), [b.id]);
  assert.deepEqual(r.related.map((c) => c.id), [a.id]);
});

test("capture: slashes and brackets in the model's title are cleaned", async () => {
  const store = await vault();
  const f = fakes([JSON.stringify({ title: "AC/DC [tour] plan", body: "notes" })]);
  const { note } = await capture({ text: "x", store, index: f.index(store), llm: f.llm });
  assert.equal(note.title, "AC-DC -tour- plan");
});

test("ask: retries once on bad JSON, then succeeds", async () => {
  const store = await vault();
  const f = fakes(["not json at all", JSON.stringify({ found: true, answer: "Yes.", citations: ["Arjun"] })]);
  const r = await ask({ question: "who is Arjun?", store, index: f.index(store), llm: f.llm });
  assert.equal(r.found, true);
  assert.equal(f.prompts.length, 2);
});

test("ask: two failures fall back to related notes, never throws", async () => {
  const store = await vault();
  const f = fakes(["garbage", new Error("upstream 500")]);
  const r = await ask({ question: "pricing", store, index: f.index(store), llm: f.llm });
  assert.equal(r.found, false);
  assert.equal(r.fallback, true);
  assert.ok(r.related.length > 0);
});

test("ask: not-found answer is reported as not found", async () => {
  const store = await vault();
  const f = fakes([JSON.stringify({ found: false, answer: "Your notes don't mention hiring.", citations: [] })]);
  const r = await ask({ question: "hiring plan?", store, index: f.index(store), llm: f.llm });
  assert.equal(r.found, false);
  assert.equal(r.fallback, false);
  assert.match(r.answer, /don't mention/);
});

test("capture: clean note saved; links limited to real notes; tags normalised into the body; title unique", async () => {
  const store = await vault();
  const f = fakes([JSON.stringify({
    title: "Arjun", body: "Arjun wants a Slack integration and an annual plan.",
    tags: ["Customer", "call notes"], links: ["Pricing v2", "Made Up"],
  })]);
  const { note, fallback } = await capture({ text: "talked to arjun um he wants slack and annual", store, index: f.index(store), llm: f.llm });
  assert.equal(fallback, false);
  assert.equal(note.title, "Arjun 2", "unique title");
  assert.deepEqual(note.links, ["Pricing v2"]);
  assert.deepEqual(note.tags, ["customer", "call-notes"]);
  assert.match(note.body, /\[\[Pricing v2\]\]/);
  assert.ok(!/Made Up/.test(note.body));
  assert.ok(store.entries().some((e) => e.id === note.id));
});

test("capture: model failure saves the raw input — nothing is lost", async () => {
  const store = await vault();
  const f = fakes(["nope", "still nope"]);
  const { note, fallback } = await capture({ text: "Idea: usage-based add-on\nper seat over 10", store, index: f.index(store), llm: f.llm });
  assert.equal(fallback, true);
  assert.equal(note.title, "Idea: usage-based add-on");
  assert.equal(note.body, "Idea: usage-based add-on\nper seat over 10");
});
