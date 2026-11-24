// Vault-level note operations on top of the store (ADR-0003/0007).
import { deriveMeta, makeResolver, renameLinks, parseLinks } from "./parse.js";

// Every save goes through here so links[]/tags[] in the index always match the body.
export const saveNote = (store, note) => store.save(Object.assign(note, deriveMeta(note)));

// "Untitled" -> "Untitled 2" -> … (titles compare case-insensitively).
export function uniqueTitle(entries, base) {
  const taken = new Set(entries.map((e) => e.title.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

export function backlinks(entries, note) {
  const resolve = makeResolver(entries);
  return entries.filter((e) => e.id !== note.id && e.links.some((l) => resolve(l)?.id === note.id));
}

export async function renameNote(store, note, newTitle) {
  newTitle = newTitle.trim();
  const clash = store.entries().find((e) => e.id !== note.id && e.path === (note.path ?? "")
    && e.title.toLowerCase() === newTitle.toLowerCase());
  if (clash) throw new Error(`A note called "${clash.title}" already exists in this folder`);
  const inbound = backlinks(store.entries(), note);
  const oldTitle = note.title;
  note.title = newTitle;
  try {
    await saveNote(store, note);
  } catch (e) {
    note.title = oldTitle;   // else the next autosave would persist the rename without fixing links
    throw e;
  }
  // ponytail: sequential rewrite; fine for a few hundred backlinks
  for (const e of inbound) {
    const n = await store.get(e.id);
    if (!n) continue;
    const body = renameLinks(n.body, oldTitle, newTitle);
    if (body !== n.body) await saveNote(store, { ...n, body });
  }
}

// Link `source` to `target` by appending [[Target]] to the source note's "Related:" line
// (created if missing). Path-qualified when another note shares the title. No-op when the
// link already exists. Used by drag-to-link in the graph. Returns {added, note?, label}.
export async function linkNotes(store, sourceId, target) {
  const entries = store.entries();
  const note = await store.get(sourceId);
  if (!note) throw new Error("That note no longer exists.");
  const dup = entries.some((e) => e.id !== target.id && e.title.toLowerCase() === target.title.toLowerCase());
  const label = dup && target.path ? `${target.path}/${target.title}` : target.title;
  const resolve = makeResolver(entries);
  if (note.id === target.id) return { added: false, label, reason: "self" };
  if (parseLinks(note.body).some((l) => l.toLowerCase() === label.toLowerCase() || resolve(l)?.id === target.id)) {
    return { added: false, label, reason: "exists" };
  }
  const lines = note.body.replace(/\s+$/, "").split("\n");
  if (/^Related:/.test(lines[lines.length - 1] ?? "")) lines[lines.length - 1] += ` · [[${label}]]`;
  else lines.push("", `Related: [[${label}]]`);
  note.body = lines.join("\n") + "\n";
  await saveNote(store, note);
  return { added: true, note, label };
}
