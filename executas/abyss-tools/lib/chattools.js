// Tools Anna's assistant (and, if the user opts in, other apps) can call: search, read,
// create and append notes (ADR-0010). Pure functions over a kv store so the same code
// runs in the abyss-tools Executa and in unit tests. Access rules live here, where data
// leaves Abyss:
//   - settings.chatAccess (default ON)   gates every tool
//   - settings.sharing    (default OFF)  additionally required for calls from another app
//   - private notes are NEVER returned, listed, created over or modified
import { createStore, newNote } from "./store.js";
import { makeResolver, cleanTitle } from "./parse.js";
import { saveNote, uniqueTitle } from "./vault.js";

export const DEFAULT_SETTINGS = { chatAccess: true, sharing: false };
const MAX_BODY = 20_000;     // characters returned or accepted per call
const MAX_SCAN = 120;        // note bodies read per search

const cleanTag = (t) => String(t).trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_/-]/gu, "");

export class AccessError extends Error {}

export async function readSettings(kv) {
  const v = (await kv.get({ key: "settings" })).value ?? {};
  return { chatAccess: v.chatAccess ?? DEFAULT_SETTINGS.chatAccess, sharing: v.sharing ?? DEFAULT_SETTINGS.sharing };
}

// caller: undefined/"chat" = Anna's assistant; anything else = another app.
export function checkAccess(settings, caller) {
  if (!settings.chatAccess) throw new AccessError("Abyss chat access is off. Turn it on in Abyss under Privacy.");
  if (caller && caller !== "chat" && !settings.sharing) {
    throw new AccessError("Abyss sharing with other apps is off. Turn it on in Abyss under Privacy.");
  }
}

const excerpt = (body, terms, n = 200) => {
  const lower = body.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, at - 40);
  return (from > 0 ? "…" : "") + body.slice(from, from + n).replace(/\s+/g, " ").trim();
};

export function createChatTools(kv, { caller } = {}) {
  const visible = (store) => store.entries().filter((e) => !e.private);

  // Fresh read of the vault for every call: the tool process is stateless.
  async function open() {
    checkAccess(await readSettings(kv), caller);
    const store = createStore(kv);
    await store.load();
    return store;
  }

  async function find(store, title) {
    const hit = makeResolver(visible(store))(String(title ?? ""));
    return hit ? { entry: hit, note: await store.get(hit.id) } : null;
  }

  return {
    async search_notes({ query, limit = 5 } = {}) {
      const store = await open();
      const terms = String(query ?? "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
      if (!terms.length) return { results: [], note: "Give a few words to search for." };
      const scored = visible(store).map((e) => ({
        e, score: terms.reduce((s, t) => s + (e.title.toLowerCase().includes(t) ? 3 : 0)
          + (e.tags.some((x) => x.toLowerCase().includes(t)) ? 2 : 0) + (e.path.toLowerCase().includes(t) ? 1 : 0), 0),
      }));
      // read bodies for index matches first, then the most recent notes, up to MAX_SCAN
      const order = [...scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score),
        ...scored.filter((x) => x.score === 0).sort((a, b) => b.e.updated.localeCompare(a.e.updated))].slice(0, MAX_SCAN);
      const found = [];
      for (const { e, score } of order) {
        const note = await store.get(e.id);
        if (!note || note.private) continue;
        const body = note.body.toLowerCase();
        const hits = terms.reduce((s, t) => s + (body.includes(t) ? 1 : 0), 0);
        if (score + hits === 0) continue;
        found.push({ rank: score * 2 + hits, title: note.title, path: note.path, tags: note.tags, updated: note.updated, snippet: excerpt(note.body, terms) });
      }
      found.sort((a, b) => b.rank - a.rank);
      return { results: found.slice(0, Math.min(Math.max(1, limit), 20)).map(({ rank, ...r }) => r) };
    },

    async read_note({ title } = {}) {
      const store = await open();
      const hit = await find(store, title);
      if (!hit?.note) return { found: false, message: `No note called "${title}".` };   // same answer for private notes: nothing leaks
      const n = hit.note;
      return { found: true, title: n.title, path: n.path, tags: n.tags, links: n.links, updated: n.updated,
        body: n.body.slice(0, MAX_BODY), truncated: n.body.length > MAX_BODY };
    },

    async create_note({ title, body = "", tags = [] } = {}) {
      const store = await open();
      const t = cleanTitle(title ?? "");
      if (!t) throw new Error("A title is required.");
      const existing = await find(store, t);
      if (existing) return { created: false, exists: true, title: existing.note.title, message: "A note with that title already exists. Use append_note to add to it." };
      // a private note with this title is invisible to us, so just pick a free title
      const tagLine = (Array.isArray(tags) ? tags : []).map(cleanTag).filter((x) => /\D/.test(x)).slice(0, 8).map((x) => `#${x}`).join(" ");
      const text = String(body).slice(0, MAX_BODY).trim() + (tagLine ? `\n\n${tagLine}` : "") + "\n";
      const note = newNote({ title: uniqueTitle(store.entries(), t), body: text });
      await saveNote(store, note);
      return { created: true, title: note.title };
    },

    async append_note({ title, text } = {}) {
      const store = await open();
      const add = String(text ?? "").slice(0, MAX_BODY).trim();
      if (!add) throw new Error("Text to append is required.");
      const hit = await find(store, title);
      if (!hit?.note) return { appended: false, message: `No note called "${title}". Use create_note to make it.` };
      const note = hit.note;
      note.body = note.body.replace(/\s+$/, "") + "\n\n" + add + "\n";
      await saveNote(store, note);
      return { appended: true, title: note.title };
    },
  };
}
