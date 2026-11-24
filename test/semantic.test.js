import { test } from "node:test";
import assert from "node:assert/strict";
import { memKv } from "../src/lib/memkv.js";
import { createStore, newNote } from "../src/lib/store.js";
import { saveNote } from "../src/lib/vault.js";
import { quantize, cosine, createSemanticIndex } from "../src/lib/semantic.js";

// Fake embedder: bag-of-words over a tiny vocabulary, so "annual"≈"yearly".
const VOCAB = [["annual", "yearly", "pricing", "plan"], ["arjun", "customer", "call"], ["slack", "integration", "zapier"], ["churn", "mrr", "metrics"]];
function fakeLlm() {
  const calls = { embed: 0, texts: 0 };
  return {
    calls,
    async embed(texts) {
      calls.embed++;
      calls.texts += texts.length;
      const vectors = texts.map((t) => {
        const w = t.toLowerCase();
        return [...VOCAB.map((g) => g.filter((x) => w.includes(x)).length), 0.01];
      });
      return { model: "fake-v1", vectors };
    },
  };
}

test("int8 quantization preserves cosine ranking", () => {
  const a = [0.1, 0.9, -0.3], b = [0.12, 0.85, -0.25], c = [-0.8, 0.1, 0.5];
  const [qa, qb, qc] = [a, b, c].map(quantize);
  assert.ok(cosine(qa, qb) > 0.98);
  assert.ok(cosine(qa, qb) > cosine(qa, qc));
});

async function setup() {
  const kv = memKv();
  const store = createStore(kv);
  await store.load();
  const notes = {
    pricing: newNote({ title: "Pricing v2", body: "Annual plan, 2 months free." }),
    call: newNote({ title: "Call Arjun", body: "Customer call about Slack integration." }),
    metrics: newNote({ title: "Metrics Nov", body: "MRR up, churn down." }),
  };
  for (const n of Object.values(notes)) await saveNote(store, n);
  return { kv, store, notes };
}

test("sync embeds every note once; unchanged notes are skipped next time (no reads, no embeds)", async () => {
  const { kv, store } = await setup();
  const llm = fakeLlm();
  const idx = createSemanticIndex(kv, llm);
  await idx.load();
  await idx.sync(store);
  assert.equal(llm.calls.texts, 3);
  const again = createSemanticIndex(kv, llm);
  await again.load();
  const before = llm.calls.texts;
  await again.sync(store);
  assert.equal(llm.calls.texts, before, "persisted vectors reused");
  assert.equal(again.size(), 3);
});

test("search ranks by meaning and re-embeds only edited notes; deleted notes drop out", async () => {
  const { kv, store, notes } = await setup();
  const llm = fakeLlm();
  const idx = createSemanticIndex(kv, llm);
  await idx.load();
  await idx.sync(store);
  assert.equal((await idx.search("yearly plan", 1))[0].id, notes.pricing.id);

  notes.metrics.body = "Zapier integration launch.";
  await saveNote(store, notes.metrics);
  await store.remove(notes.call.id);
  const before = llm.calls.texts;
  await idx.sync(store);
  assert.equal(llm.calls.texts - before, 1, "only the edited note re-embedded");
  assert.equal(idx.size(), 2);
  assert.equal((await idx.search("slack integration", 1))[0].id, notes.metrics.id);
});

test("packs hold at most 25 vectors per key", async () => {
  const kv = memKv();
  const store = createStore(kv);
  await store.load();
  for (let i = 0; i < 60; i++) await saveNote(store, newNote({ title: `n${i}`, body: "plan" }));
  const idx = createSemanticIndex(kv, fakeLlm());
  await idx.load();
  await idx.sync(store);
  const packs = (await kv.list({ prefix: "vec/" })).entries;
  assert.equal(packs.length, 3);
  for (const p of packs) assert.ok((await kv.get({ key: p.key })).value.items.length <= 25);
});
