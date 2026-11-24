// AI runs (ADR-0008): retrieve -> generate JSON -> validate -> retry once ->
// fallback. A run never ends in an error screen, and citations/links are only
// ever titles of notes that were actually given to the model.
//   llm.complete({system, prompt, maxTokens}) -> string
//   index.search(query, k) -> [{id, score}]
import { newNote } from "./store.js";
import { saveNote, uniqueTitle } from "./vault.js";
import { cleanTitle } from "./parse.js";

const NOTE_CHARS = 3000;   // per note in the prompt

export function parseJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object in model output");
  return JSON.parse(s.slice(a, b + 1));
}

// Call the model, parse + validate; one retry on any failure. null = give up.
async function generate(llm, req, validate) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const v = validate(parseJson(await llm.complete(req)));
      if (v) return v;
    } catch { /* retry once, then fall back */ }
  }
  return null;
}

// Titles the model may use -> exact title (case-insensitive match).
const titleMap = (titles) => new Map(titles.map((t) => [t.toLowerCase(), t]));
const pickTitles = (map, xs, max) =>
  [...new Set((Array.isArray(xs) ? xs : []).map((x) => map.get(String(x).trim().toLowerCase())).filter(Boolean))].slice(0, max);

// Keyword fallback when there are no vectors yet: title/tag word overlap.
function keywordHits(entries, query, k) {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return entries
    .map((e) => ({ id: e.id, score: words.reduce((s, w) =>
      s + (e.title.toLowerCase().includes(w) ? 3 : 0) + (e.tags.some((t) => t.toLowerCase().includes(w)) ? 2 : 0), 0) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

async function retrieve(store, index, query, k) {
  let hits = [];
  try { hits = await index.search(query, k); } catch { /* embeddings down: keyword fallback */ }
  if (!hits.length) hits = keywordHits(store.entries(), query, k);
  return (await Promise.all(hits.map((h) => store.get(h.id)))).filter(Boolean);
}

// A citation may come back as a note number (asked for), "Note 2", "Note 2: Title",
// "[[Title]]" or a bare title. Returns the given notes it points to (by identity —
// two notes can share a title in different folders); anything else is dropped.
function pickNotes(notes, xs, max) {
  const out = [];
  for (const x of Array.isArray(xs) ? xs : []) {
    const s = String(x).trim();
    const num = /^(?:note\s*)?#?(\d+)\b/i.exec(s);
    const t = s.replace(/^note\s*\d+\s*:\s*/i, "").replace(/^\[\[|\]\]$/g, "").trim().toLowerCase();
    const note = num && Number(num[1]) >= 1 && Number(num[1]) <= notes.length
      ? notes[Number(num[1]) - 1]
      : notes.find((n) => n.title.toLowerCase() === t);
    if (note && !out.includes(note)) out.push(note);
  }
  return out.slice(0, max);
}

const ASK_SYSTEM = `You answer questions using ONLY the user's notes given below. Never use outside knowledge.
Respond with JSON only, no prose: {"found": boolean, "answer": string, "citations": [number]}
- "citations": the numbers of the notes you used, e.g. [1, 3].
- If the notes do not contain the answer, set "found": false and make "answer" one sentence saying what is missing.
- Keep "answer" under 120 words, plain text.`;

export async function ask({ question, store, index, llm, k = 6 }) {
  const notes = await retrieve(store, index, question, k);
  const related = notes.map((n) => ({ id: n.id, title: n.title }));
  if (!notes.length) return { found: false, fallback: false, answer: "Your vault has no notes about this yet.", citations: [], related };

  const prompt = notes.map((n, i) => `### Note ${i + 1}: ${n.title}\n${n.body.slice(0, NOTE_CHARS)}`).join("\n\n")
    + `\n\n### Question\n${question}`;
  const out = await generate(llm, { system: ASK_SYSTEM, prompt, maxTokens: 800 }, (o) => {
    const answer = typeof o.answer === "string" ? o.answer.trim() : "";
    if (!answer) return null;
    return { found: o.found === true, answer, cited: pickNotes(notes, o.citations, 8) };
  });
  if (!out) return { found: false, fallback: true, answer: "", citations: [], related };

  const ids = new Set(out.cited.map((n) => n.id));
  return {
    found: out.found,
    fallback: false,
    answer: out.answer,
    citations: out.cited.map((n) => ({ id: n.id, title: n.title })),
    related: related.filter((r) => !ids.has(r.id)),
  };
}

const CAPTURE_SYSTEM = `You turn messy input (typed or dictated) into one clean markdown note.
Respond with JSON only, no prose: {"title": string, "body": string, "tags": [string], "links": [string]}
- "title": specific, at most 60 characters.
- "body": clean markdown — a one-line summary, then bullet points. Keep every fact, name, number and date from the input. Never invent anything.
- "tags": up to 4 short lowercase topic tags.
- "links": up to 5 titles from the "Existing notes" list that are clearly related. Only titles from that list.`;

const cleanTag = (t) => String(t).trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_/-]/gu, "");

// `save` lets the UI run only the final write through its save queue, so the
// slow LLM call never blocks autosaves.
export async function capture({ text, store, index, llm, save = (n) => saveNote(store, n) }) {
  const raw = text.trim();
  if (!raw) throw new Error("Nothing to capture");
  const candidates = (await retrieve(store, index, raw.slice(0, 2000), 8)).map((n) => n.title);
  const byTitle = titleMap(candidates);
  const prompt = `### Existing notes\n${candidates.map((t) => `- ${t}`).join("\n") || "(none)"}\n\n### Input\n${raw}`;

  const out = await generate(llm, { system: CAPTURE_SYSTEM, prompt, maxTokens: 1500 }, (o) => {
    const title = typeof o.title === "string" ? cleanTitle(o.title).slice(0, 80) : "";
    const body = typeof o.body === "string" ? o.body.trim() : "";
    if (!title || !body) return null;
    const tags = [...new Set((Array.isArray(o.tags) ? o.tags : []).map(cleanTag).filter((t) => /\D/.test(t)))].slice(0, 6);
    return { title, body, tags, links: pickTitles(byTitle, o.links, 5) };
  });

  let note;
  if (out) {
    // Tags and links live in the body (Obsidian-style), so the index derives them.
    const missing = out.links.filter((t) => !out.body.toLowerCase().includes(`[[${t.toLowerCase()}`));
    let body = out.body;
    if (missing.length) body += `\n\nRelated: ${missing.map((t) => `[[${t}]]`).join(" · ")}`;
    if (out.tags.length) body += `\n\n${out.tags.map((t) => `#${t}`).join(" ")}`;
    note = newNote({ title: uniqueTitle(store.entries(), out.title), body });
  } else {
    const first = cleanTitle(raw.split("\n")[0]).slice(0, 60) || `Capture ${new Date().toLocaleString("sv")}`;
    note = newNote({ title: uniqueTitle(store.entries(), first), body: raw });
  }
  await save(note);
  return { note, fallback: !out };
}
