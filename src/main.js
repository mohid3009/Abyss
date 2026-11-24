import "@fontsource-variable/geist/wght.css";
import "./style.css";
import { icon, decorate, swapIcon, setBusy, whileBusy } from "./icons.js";
import { createStore, newNote, ConflictError } from "./lib/store.js";
import { memKv } from "./lib/memkv.js";
import { saveNote, renameNote, backlinks, uniqueTitle, linkNotes } from "./lib/vault.js";
import { initAi } from "./aiview.js";
import { makeResolver, cleanTitle } from "./lib/parse.js";
import { importVault, exportVault } from "./lib/vaultzip.js";
import { parseRepo, fetchRepoZip, MAX_FILES } from "./lib/github.js";
import { topoPath } from "./lib/topo.js";
import { initGraphs } from "./graphview.js";

const SDK = "/static/anna-apps/_sdk/latest/index.js";
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

let store, graphs, ai, kv, anna = null;
let editor = null;         // Promise of the CodeMirror editor (lazy, see getEditor)
let settings = {};         // APS `settings` key: graph groups/orphans/depth, theme (ADR-0003)
let current = null;        // the open note (full object)
let saveTimer = null;
let queue = Promise.resolve();   // saves run one at a time so etags never race
// The caller sees its own job's failure; the queue itself never stays rejected.
const enqueue = (fn) => {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
};

async function connect() {
  try {
    // dynamic so a standalone preview (no host, no SDK URL) still boots
    const { AnnaAppRuntime } = await import(/* @vite-ignore */ SDK);
    const a = await AnnaAppRuntime.connect();
    a.onThemeChange?.(({ theme }) => { annaTheme = theme; applyTheme(); });
    return { anna: a, kv: a.storage };
  } catch {
    return { anna: null, kv: memKv() };   // standalone preview: in-memory, nothing persists
  }
}

function setStatus(text, action) {
  const s = $("status");
  s.replaceChildren(text);
  // fade each new message up; progress updates ("…") replace in place without flashing
  if (text && !text.includes("…")) { s.classList.remove("flash"); void s.offsetWidth; s.classList.add("flash"); }
  if (action) s.append(el("button", { type: "button", className: "btn btn-quiet button-xsm", textContent: action.label, onclick: action.run }));
}

const pathLabel = (p) => (p ? p.split("/").join(" / ") : "");
const listEmpty = (text) => el("li", { className: "list-empty caption-2", textContent: text });

function renderList() {
  const list = $("note-list");
  list.ariaBusy = "false";
  const q = $("search").value.trim().toLowerCase().replace(/^#/, "");
  const items = store.entries()
    .filter((e) => !q || e.title.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  list.replaceChildren(...items.map((e) => {
    const on = e.id === current?.id;
    const b = el("button", { type: "button", draggable: true, className: on ? "active" : "", onclick: () => openNote(e.id), ondragstart: (ev) => ev.dataTransfer.setData("text/plain", `[[${e.path ? e.path + "/" : ""}${e.title}]]`) },
      el("span", { className: "note-title body-5", textContent: e.title || "Untitled" }));
    if (e.path) b.append(el("span", { className: "note-path caption-5", textContent: pathLabel(e.path) }));
    if (on) b.ariaCurrent = "true";
    return el("li", {}, b);
  }));
  if (!items.length) list.append(listEmpty(q ? "No notes match that search." : "No notes yet."));
  const n = store.entries().length;
  $("count").textContent = `${n} ${n === 1 ? "note" : "notes"}${anna ? "" : ", preview only"}`;
  renderWelcome();
}

// Empty state (B9): composed welcome; copy adapts to whether the vault has notes.
function renderWelcome() {
  const has = store.entries().length > 0;
  $("welcome-eyebrow").textContent = has ? "Your vault" : "Your notes, connected";
  $("welcome-title").replaceChildren(...(has
    ? ["Pick a note, or ask", el("br"), "your vault a question."]
    : ["Ask your notes anything.", el("br"), "Get answers with sources."]));
  $("welcome-sub").textContent = has
    ? `${store.entries().length} notes are ready. Open one from the list, explore the graph, or ask a question and get an answer that cites your notes.`
    : "Abyss links your notes, draws them as a graph, and answers questions using only what you wrote.";
  const primary = $("welcome-primary");
  const action = has ? "ask" : "import";
  if (primary.dataset.action === action) return;   // renderList runs on every save; only animate real changes
  primary.dataset.action = action;
  swapIcon(primary, has ? "sparkle" : "upload");
  primary.querySelector(".label").textContent = has ? "Ask your notes" : "Import Obsidian vault";
}

// settings.theme: "anna" (follow Anna's light/dark, default) | "light" | "dark"
let annaTheme = null;
function applyTheme() {
  const t = settings.theme && settings.theme !== "anna" ? settings.theme : annaTheme;
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;     // standalone: prefers-color-scheme
}

let settingsTimer = null;
// ponytail: last-writer-wins on `settings` — only the UI writes it today; add
// etag merge when the Executa starts writing settings.
function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => kv.set({ key: "settings", value: settings }).catch((e) => setStatus("Settings not saved: " + e.message)), 400);
}

function renderLinks() {
  $("links").hidden = !current || $("editor-pane").hidden;
  if (!current) return;
  graphs.renderLocal(current);
  const entries = store.entries();
  const resolve = makeResolver(entries);
  const back = backlinks(entries, current);
  const out = (current.links ?? []).map((t) => ({ t, hit: resolve(t) }));
  // Rebuild only when the rows change, so autosaves don't replay the icon entry.
  const key = JSON.stringify([current.id, back.map((e) => [e.id, e.title]), out.map(({ t, hit }) => [t, !!hit])]);
  if (key === renderLinks.key) return;
  renderLinks.key = key;
  let row = 0;
  const linkRow = (label, onclick, extra = {}) => el("li", {}, el("button", { type: "button", onclick, ...extra },
    icon("note", { i: ++row }), el("span", { className: "note-title body-6", textContent: label })));
  $("backlinks").replaceChildren(...(back.length
    ? back.map((e) => linkRow(e.title, () => openNote(e.id)))
    : [listEmpty("No notes link here yet.")]));
  row = 0;
  $("outlinks").replaceChildren(...(out.length
    ? out.map(({ t, hit }) => linkRow(t, () => openLink(t), {
      className: hit ? "" : "unresolved", title: hit ? "Open" : "Not written yet. Click to create it." }))
    : [listEmpty("Type [[ in the note to link another note.")]));
}

// view: "note" | "empty" | "graph" | "ask" | "capture"
const VIEWS = { note: "editor-pane", empty: "empty", graph: "graph-view", ask: "ask-view", capture: "capture-view" };
const TOGGLES = { graph: "show-graph", ask: "show-ask", capture: "show-capture" };
function showView(view) {
  for (const [v, id] of Object.entries(VIEWS)) $(id).hidden = v !== view;
  for (const [v, id] of Object.entries(TOGGLES)) $(id).ariaPressed = String(v === view);
  renderLinks();
  if (view === "graph") graphs.renderWhole({ refit: true });
}
const showEditor = (show) => showView(show ? "note" : "empty");

async function flush() {
  if (!saveTimer) return queue;
  clearTimeout(saveTimer);
  saveTimer = null;
  return persist();
}

function persist() {
  const note = current;
  return enqueue(async () => {
    if (!note) return;
    try {
      await saveNote(store, note);
      if (note === current) setStatus("Saved");
      renderList();
      renderLinks();
      graphs.renderWhole();
      ai.scheduleSync();
    } catch (e) {
      if (e instanceof ConflictError) {
        setStatus(e.message, { label: "Reload", run: async () => { await store.load(); await openNote(note.id, { skipFlush: true }); } });
      } else {
        setStatus("Not saved: " + e.message);
      }
    }
  });
}

async function openNote(id, { skipFlush = false } = {}) {
  if (!skipFlush) await flush();
  const n = await store.get(id);
  if (!n) {
    setStatus("That note no longer exists.");
    await store.load();
    renderList();
    return;
  }
  current = n;
  $("title").value = n.title;
  $("private").checked = !!n.private;
  $("note-path").textContent = pathLabel(n.path);
  showEditor(true);
  const ed = await getEditor();
  if (current !== n) return;   // another note was opened while the editor loaded
  ed.setDoc(n.body);
  setStatus("");
  renderList();
  renderLinks();
}

// Open a [[link]] target; an unresolved link creates the note (Obsidian behaviour).
async function openLink(target) {
  const hit = makeResolver(store.entries())(target);
  if (hit) return openNote(hit.id);
  const slash = target.lastIndexOf("/");
  const n = newNote({ title: target.slice(slash + 1).trim(), path: slash >= 0 ? target.slice(0, slash) : "" });
  await enqueue(() => saveNote(store, n));
  await openNote(n.id);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function runImport(file, { stripRoot = false, load = null } = {}) {
  if (!load && !/\.zip$/i.test(file.name)) { setStatus("Import needs a .zip of your Obsidian vault folder."); return; }
  await flush();
  setStatus(`Reading ${file.name}…`);
  swapIcon($("import"), "spinner", { spin: true });
  await whileBusy(() => enqueue(async () => {
    try {
      const r = await importVault(store, load ? await load() : await file.arrayBuffer(), {
        stripRoot,
        onProgress: (done, total) => setStatus(`Importing… ${done} / ${total}`),
      });
      const parts = [plural(r.created, "new note"), `${r.updated} updated`, `${r.unchanged} unchanged`];
      if (r.conflicts.length) parts.push(`${plural(r.conflicts.length, "conflict")} kept side by side (${r.conflicts.slice(0, 3).join(", ")}${r.conflicts.length > 3 ? "…" : ""})`);
      if (r.skipped.length) parts.push(`${r.skipped.length} skipped: ${r.skipped.slice(0, 2).map((s) => s.reason).join("; ")}`);
      if (r.attachments) parts.push(`${plural(r.attachments, "attachment")} not imported yet`);
      setStatus(`Import finished. ${parts.join(", ")}.`);
    } catch (e) {
      setStatus("Import failed: " + e.message);
    }
  }));
  swapIcon($("import"), "upload");
  renderList();
  ai.scheduleSync(0);
  if (current) await openNote(current.id);   // it may have been updated; flushes anything typed meanwhile
  else showView("graph");    // first import: show the vault bloom
}

async function runExport() {
  await flush();
  setStatus("Preparing export…");
  swapIcon($("export"), "spinner", { spin: true });
  setBusy(1);
  try {
    const blob = await exportVault(store, { onProgress: (d, t) => setStatus(`Exporting… ${d} / ${t}`) });
    const a = el("a", { href: URL.createObjectURL(blob), download: `abyss-vault-${new Date().toLocaleDateString("sv")}.zip` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    setStatus(`Exported ${plural(store.entries().length, "note")}`);
  } catch (e) {
    setStatus("Export failed: " + e.message);
  } finally {
    setBusy(-1);
    swapIcon($("export"), "download");
  }
}

async function runGithubImport(spec) {
  const err = (t) => { $("gh-error").textContent = t; $("gh-error").hidden = !t; };
  err("");
  $("gh-form").querySelectorAll("input,button").forEach((x) => { x.disabled = true; });
  try {
    let note = "";
    await runImport({ name: `${spec.owner}/${spec.repo}` }, { load: async () => {
      const JSZip = (await import("jszip")).default;
      const r = await fetchRepoZip(spec, { JSZip, onProgress: (d, t) => setStatus(`Downloading notes… ${d} / ${t}`) });
      if (r.truncated) note = ` Imported the first ${MAX_FILES} of ${r.total} markdown files.`;
      return r.bytes;
    } });
    if (note) setStatus($("status").textContent + note);
    if (/^Import failed/.test($("status").textContent)) throw new Error($("status").textContent.replace(/^Import failed: /, ""));
    $("gh-form").hidden = true;
    $("gh-input").value = "";
  } catch (e) {
    err(e.message);
  } finally {
    $("gh-form").querySelectorAll("input,button").forEach((x) => { x.disabled = false; });
  }
}

function setSidebar(collapsed, { save = true } = {}) {
  document.body.classList.toggle("collapsed", collapsed);
  const t = $("sidebar-toggle");
  t.setAttribute("aria-expanded", String(!collapsed));
  t.ariaLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  t.title = `${t.ariaLabel} (Ctrl+B)`;
  if (save) { settings.sidebar = collapsed ? "collapsed" : "open"; saveSettings(); }
}

function wire() {
  $("replay-tour").addEventListener("click", startTour);
  $("sidebar-toggle").addEventListener("click", () => setSidebar(!document.body.classList.contains("collapsed")));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      setSidebar(!document.body.classList.contains("collapsed"));
    }
  });
  setSidebar(settings.sidebar === "collapsed", { save: false });
  $("import-github").addEventListener("click", () => {
    $("gh-form").hidden = !$("gh-form").hidden;
    if (!$("gh-form").hidden) $("gh-input").focus();
  });
  $("gh-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const spec = parseRepo($("gh-input").value);
    if (!spec) { $("gh-error").textContent = "Enter a repository like owner/repo or owner/repo@branch."; $("gh-error").hidden = false; return; }
    runGithubImport(spec);
  });
  $("search").addEventListener("input", renderList);
  $("show-graph").addEventListener("click", async () => {
    if (!$("graph-view").hidden) return showView(current ? "note" : "empty");
    await flush();
    showView("graph");
  });

  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) runImport(f);
  });
  $("export").addEventListener("click", runExport);
  document.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types ?? [])].includes("Files")) { e.preventDefault(); document.body.classList.add("dropping"); } });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
  document.addEventListener("drop", (e) => {
    document.body.classList.remove("dropping");
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;   // a note dragged into the editor is handled by the editor itself
    e.preventDefault();
    runImport(f);
  });

  const createNote = async () => {
    await flush();
    const n = newNote({ title: uniqueTitle(store.entries(), "Untitled") });
    await enqueue(() => saveNote(store, n));
    await openNote(n.id);
    $("title").select();
  };
  $("new-note").addEventListener("click", createNote);
  $("welcome-secondary").addEventListener("click", createNote);

  // The whole note page is a writing surface: a click on empty space below the
  // text puts the caret at the end; Enter in the title moves into the body.
  $("editor-pane").querySelector(".note-scroll").addEventListener("mousedown", (e) => {
    if (e.target.closest(".cm-content, #title")) return;
    e.preventDefault();
    getEditor().then((ed) => ed.focusEnd());
  });
  $("title").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    getEditor().then((ed) => ed.focusEnd());   // moving focus fires the title's change (rename)
  });
  $("welcome-primary").addEventListener("click", (e) => {
    if (e.currentTarget.dataset.action === "ask") $("show-ask").click();
    else $("import-file").click();
  });

  $("title").addEventListener("change", async () => {
    const t = cleanTitle($("title").value);
    if (!current || !t || t === current.title) { $("title").value = current?.title ?? ""; return; }
    await flush();
    await enqueue(async () => {
      try {
        const inbound = backlinks(store.entries(), current).length;
        await renameNote(store, current, t);
        $("title").value = current.title;   // shows the cleaned title
        setStatus(inbound ? `Renamed. Updated the links in ${plural(inbound, "note")}.` : "Renamed");
      } catch (e) {
        setStatus(e.message);
        $("title").value = current.title;
      }
    });
    renderList();
    renderLinks();
  });

  $("private").addEventListener("change", () => {
    current.private = $("private").checked;
    persist();
  });

  // Two step delete: sandboxed iframes may block confirm().
  const delLabel = () => $("delete").querySelector(".label");
  let armed = null;
  $("delete").addEventListener("click", async () => {
    if (!current) return;
    if (!armed) {
      delLabel().textContent = "Click again to delete";
      swapIcon($("delete"), "warning");
      armed = setTimeout(() => { armed = null; delLabel().textContent = "Delete"; swapIcon($("delete"), "trash"); }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    delLabel().textContent = "Delete";
    swapIcon($("delete"), "trash");
    clearTimeout(saveTimer);
    saveTimer = null;
    const { id, title } = current;
    await enqueue(() => store.remove(id));
    current = null;
    showEditor(false);
    setStatus(`Deleted "${title}"`);
    renderList();
    renderLinks();
  });
}

// Graph drag-to-link: dropping node A on node B appends [[B]] to note A.
async function dragLink(source, target) {
  await flush();
  try {
    const r = await enqueue(() => linkNotes(store, source.id, { id: target.ghost ? null : target.id, title: target.title, path: target.path }));
    if (!r.added) {
      setStatus(r.reason === "exists" ? `"${source.title}" already links to "${target.title}".` : "A note can't link to itself.");
      return;
    }
    setStatus(`Linked "${source.title}" to "${target.title}".`);
    renderList();
    graphs.renderWhole();
    if (current?.id === source.id) await openNote(source.id, { skipFlush: true });
    ai.scheduleSync();
  } catch (e) {
    setStatus("Could not link the notes: " + e.message);
  }
}

// Startup splash: rings scale in, then it fades once notes are loaded (at least ~1.7 s, so it never flashes).
const splashStart = performance.now();
function hideSplash() {
  const sp = $("splash");
  if (!sp) return;
  setTimeout(() => {
    sp.classList.add("out");
    setTimeout(() => { sp.remove(); document.dispatchEvent(new Event("splash-gone")); }, 800);   // timer, not transitionend: that never fires in a hidden tab
  }, Math.max(0, 1700 - (performance.now() - splashStart)));
}
setTimeout(hideSplash, 8000);   // safety: never trap the UI behind it

// Tutorial: a spotlight tour on first run (after the splash), replayable from the sidebar.
let tourPromise = null;
function startTour() {
  tourPromise ??= import("./tour.js");
  tourPromise.then(({ createTour }) => createTour({
    onDone: () => { if (settings.tutorial !== "done") { settings.tutorial = "done"; saveSettings(); } },
  }).start());
}
const afterSplash = (fn) => ($("splash") ? document.addEventListener("splash-gone", fn, { once: true }) : fn());

async function main() {
  $("topo").firstElementChild.setAttribute("d", topoPath());
  decorate();
  setBusy(1);   // logo arcs spin until notes are loaded
  ({ anna, kv } = await connect());
  annaTheme ??= anna?.theme ?? null;
  applyTheme();
  store = createStore(kv);
  try {
    await store.load();
    settings = (await kv.get({ key: "settings" })).value ?? {};
  } catch (e) {
    setStatus("Could not load notes: " + e.message);
    return;
  } finally {
    setBusy(-1);
    hideSplash();
  }
  // ?demo (standalone only): sample vault in memory, for screenshots and a quick look
  let demo = null;
  if (new URLSearchParams(location.search).has("still")) document.documentElement.classList.add("still");   // no animation (screenshots)
  if (!anna && new URLSearchParams(location.search).has("demo")) demo = await (await import("./demo.js")).seedDemo(store, settings);
  applyTheme();
  $("theme").value = settings.theme ?? "anna";
  $("theme").addEventListener("change", (e) => { settings.theme = e.target.value; applyTheme(); saveSettings(); });
  graphs = initGraphs({
    store, settings, saveSettings,
    currentNote: () => current,
    onOpenNode: (n) => (n.ghost ? openLink(n.title) : openNote(n.id)),
    onLinkNodes: dragLink,
  });
  ai = initAi({
    anna, kv, store, enqueue, setStatus, openNote,
    show: async (view) => {
      if (!$(VIEWS[view]).hidden) return showView(current ? "note" : "empty");
      await flush();
      showView(view);
    },
    afterSave: () => { renderList(); graphs.renderWhole(); },
  });
  wire();
  showEditor(false);
  renderList();
  setStatus("");
  if (demo) {
    const entry = store.entries().find((e) => e.title === demo.note);
    if (demo.view === "graph") $("show-graph").click();
    else if (demo.view === "ask") $("show-ask").click();
    else if (demo.view === "capture") $("show-capture").click();
    else if (demo.view === "note" && entry) openNote(entry.id);
  }
  window.addEventListener("pagehide", () => { flush(); });
  if (settings.tutorial !== "done") afterSplash(() => setTimeout(startTour, 400));
  // Prefetch the editor once the first screen is up, so opening a note stays instant.
  (window.requestIdleCallback ?? setTimeout)(() => getEditor());
}

// CodeMirror is the largest dependency; it's split out and created on first use.
function getEditor() {
  return (editor ??= import("./editor.js").then(({ createEditor }) => createEditor($("editor"), {
    titles: () => store.entries().map((e) => e.title),
    onOpenLink: openLink,
    onChange(text) {
      if (!current) return;
      current.body = text;
      setStatus("Editing…");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 700);
    },
  })));
}

main();
