// Obsidian vault .zip import / export (ADR-0007).
// JSZip is split out and fetched only when importing or exporting.
const loadZip = async () => (await import("jszip")).default;
import { newNote } from "./store.js";
import { deriveMeta } from "./parse.js";

// Obsidian config, trash, OS junk and other hidden files/folders.
const SKIP = /(^|\/)(\.[^/]*|__MACOSX)(\/|$)/;
const keyOf = (path, title) => `${(path ?? "").toLowerCase()}\u0000${title.toLowerCase()}`;
const fileName = (title) => title.replace(/[\\/:*?"<>|]/g, "-") + ".md";

// Run fn over items, n at a time.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

export async function readVaultZip(data, { stripRoot = false } = {}) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(data);
  const files = Object.values(zip.files).filter((f) => !f.dir && !SKIP.test(f.name));
  // Zipping the vault folder itself adds one root folder — strip it, but only
  // when it is the vault root (holds .obsidian/); otherwise a real top folder
  // like "Notes/" would vanish and later re-imports would stop matching.
  const first = files[0]?.name.split("/")[0];
  const isVaultRoot = first && Object.keys(zip.files).some((n) => n.startsWith(`${first}/.obsidian/`));
  const root = (isVaultRoot || stripRoot) && files.every((f) => f.name.startsWith(first + "/")) ? first + "/" : "";
  const md = files.filter((f) => /\.md$/i.test(f.name));
  const notes = await pool(md, 8, async (f) => {
    const rel = f.name.slice(root.length);
    const slash = rel.lastIndexOf("/");
    return {
      path: slash >= 0 ? rel.slice(0, slash) : "",
      title: rel.slice(slash + 1).replace(/\.md$/i, ""),
      body: (await f.async("string")).replace(/^﻿/, ""),
    };
  });
  // ponytail: attachments are counted, not stored — files.* is a stub in the
  // local harness. Store them in files.* once it's verified (ADR-0007).
  return { notes, attachments: files.length - md.length };
}

// Re-import rules (ADR-0007): match by path + title; a note not edited in Abyss
// since its last import is overwritten; one edited in both places is kept and the
// file arrives as "Title (imported YYYY-MM-DD)"; nothing is ever deleted.
export async function importVault(store, data, { onProgress, stripRoot = false } = {}) {
  const { notes: files, attachments } = await readVaultZip(data, { stripRoot });
  const existing = new Map(store.entries().map((e) => [keyOf(e.path, e.title), e]));
  const taken = new Set(existing.keys());
  const date = new Date().toLocaleDateString("sv");
  const freshTitle = (path, base) => {
    let t = base;
    for (let i = 2; taken.has(keyOf(path, t)); i++) t = `${base} ${i}`;
    taken.add(keyOf(path, t));
    return t;
  };

  const current = await pool(files, 8, (f) => {
    const hit = existing.get(keyOf(f.path, f.title));
    return hit ? store.get(hit.id) : null;
  });

  // An earlier conflict copy with the same text means this conflict is already
  // waiting for the user — don't add another copy.
  const hasCopy = async (f) => {
    const prefix = `${f.title} (imported `.toLowerCase();
    const copies = store.entries().filter((e) => e.path === f.path && e.title.toLowerCase().startsWith(prefix));
    for (const e of copies) if ((await store.get(e.id))?.body === f.body) return true;
    return false;
  };

  const plan = [];          // [{note, kind}]
  const skipped = [];
  const inZip = new Set();
  let unchanged = 0;
  for (const [i, f] of files.entries()) {
    const cur = current[i];
    const k = keyOf(f.path, f.title);
    if (inZip.has(k)) {     // "Idea.md" and "idea.md": titles compare case-insensitively
      skipped.push({ title: f.title, reason: "another file with the same name (different case) was already imported" });
      continue;
    }
    inZip.add(k);
    if (!cur) {
      plan.push({ kind: "created", note: Object.assign(newNote(f), deriveMeta(f)) });
    } else if (cur.body === f.body) {
      unchanged++;
    } else if (cur.imported && cur.updated === cur.imported) {   // untouched in Abyss since import
      plan.push({ kind: "updated", note: { ...cur, body: f.body, ...deriveMeta(f) } });
    } else if (await hasCopy(f)) {
      unchanged++;
    } else {
      const title = freshTitle(f.path, `${f.title} (imported ${date})`);
      plan.push({ kind: "conflict", source: f.title, note: Object.assign(newNote({ ...f, title }), deriveMeta(f)) });
    }
  }

  const failed = await store.saveAll(plan.map((p) => p.note), { imported: true, onProgress });
  const bad = new Set(failed.map((x) => x.note));
  const ok = plan.filter((p) => !bad.has(p.note));
  return {
    created: ok.filter((p) => p.kind === "created").length,
    updated: ok.filter((p) => p.kind === "updated").length,
    unchanged,
    conflicts: ok.filter((p) => p.kind === "conflict").map((p) => p.source),
    skipped: [...skipped, ...failed.map(({ note, error }) => ({ title: note.title, reason: error.message }))],
    attachments,
  };
}

// type: "blob" in the browser, "uint8array" in tests.
export async function exportVault(store, { type = "blob", onProgress } = {}) {
  const JSZip = await loadZip();
  const zip = new JSZip();
  const entries = store.entries();
  let done = 0;
  await pool(entries, 8, async (e) => {
    const n = await store.get(e.id);
    if (n) zip.file((n.path ? n.path + "/" : "") + fileName(n.title), n.body);
    onProgress?.(++done, entries.length);
  });
  return zip.generateAsync({ type });
}
