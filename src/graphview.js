// Graph UI glue: whole-vault view (filter, orphans, colour groups) and the
// local graph in the links panel (depth 1–3). Settings live in APS `settings`.
import { graphData } from "./lib/graphdata.js";

// force-graph (~300 KB) is split out and fetched the first time a graph shows.
let graphModule = null;
const loadGraph = () => (graphModule ??= import("./graph.js"));

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};
const DEFAULTS = { nodeSize: 0.7, linkWidth: 1.2, labelZoom: 1.4, ghosts: true, repel: 90, distance: 36, center: 0.06 };
const PALETTE = ["#2f9e5b", "#3b82f6", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

export function initGraphs({ store, settings, saveSettings, onOpenNode, onLinkNodes, currentNote }) {
  let whole = null;             // created on first show: the canvas needs a sized container
  let local = null;
  let localKey = "";
  let filterTimer = null;
  const groups = () => settings.groups ?? [];
  const cfg = () => ({ ...DEFAULTS, ...(settings.graph ?? {}) });
  const applyConfig = () => { local?.configure(cfg()); whole?.configure(cfg()); };

  async function renderWhole({ refit = false } = {}) {
    if ($("graph-view").hidden) return;
    const data = graphData(store.entries(), {
      orphans: settings.orphans !== false, ghosts: cfg().ghosts, filter: $("graph-filter").value, groups: groups(),
    });
    $("graph-count").textContent = `${data.nodes.length} nodes · ${data.links.length} links`;
    if (!whole) { whole = (await loadGraph()).createGraph($("graph-canvas"), { onOpen: onOpenNode, onLink: onLinkNodes }); whole.configure(cfg()); }
    whole.set(data, { refit });
  }

  async function renderLocal(note = currentNote()) {
    if (!note) return;
    const depth = settings.localDepth ?? 1;
    const data = graphData(store.entries(), { center: note.id, depth, ghosts: cfg().ghosts, groups: groups() });
    // Redraw only when what's drawn changes (nodes, titles, colours, edges), so
    // autosaves don't restart the simulation but renames do relabel.
    const key = [note.id, data.links.length, ...data.nodes.map((n) => `${n.id}\u0001${n.title}\u0001${n.color ?? ""}`)].join("\u0000");
    if (key === localKey) return;
    localKey = key;
    if (!local) { local = (await loadGraph()).createGraph($("local-graph"), { onOpen: onOpenNode, onLink: onLinkNodes }); local.configure(cfg()); }
    if (localKey === key) local.set(data, { focus: note.id });   // skip if a newer render started meanwhile
  }

  function changed() {
    saveSettings();
    renderWhole();
    renderLocal();
  }

  function renderGroups() {
    $("group-rows").replaceChildren(...groups().map((g, i) => el("div", { className: "group-row" },
      el("input", { className: "body-6", value: g.query, placeholder: "#tag, path:folder or title", ariaLabel: "Group query",
        oninput: (e) => { g.query = e.target.value; changed(); } }),
      el("input", { type: "color", value: g.color, ariaLabel: "Group colour",
        oninput: (e) => { g.color = e.target.value; changed(); } }),
      el("button", { type: "button", className: "btn-icon", textContent: "×", ariaLabel: "Remove group",
        onclick: () => { settings.groups.splice(i, 1); renderGroups(); changed(); } }),
    )));
  }

  $("graph-filter").addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => renderWhole({ refit: true }), 200);
  });
  $("graph-orphans").checked = settings.orphans !== false;
  $("graph-orphans").addEventListener("change", (e) => { settings.orphans = e.target.checked; changed(); });
  $("graph-fit").addEventListener("click", () => whole?.zoomToFit());
  $("add-group").addEventListener("click", () => {
    settings.groups = [...groups(), { query: "", color: PALETTE[groups().length % PALETTE.length] }];
    renderGroups();
    $("group-rows").lastElementChild?.querySelector("input")?.focus();
  });
  // settings panel: sliders write settings.graph, apply live, persist (debounced by saveSettings)
  const setters = { nodeSize: "set-nodeSize", linkWidth: "set-linkWidth", labelZoom: "set-labelZoom", repel: "set-repel", distance: "set-distance", center: "set-center" };
  const syncPanel = () => {
    for (const [k, id] of Object.entries(setters)) $(id).value = String(cfg()[k]);
    $("set-ghosts").checked = cfg().ghosts;
  };
  for (const [k, id] of Object.entries(setters)) {
    $(id).addEventListener("input", (e) => { settings.graph = { ...(settings.graph ?? {}), [k]: Number(e.target.value) }; applyConfig(); saveSettings(); });
  }
  $("set-ghosts").addEventListener("change", (e) => { settings.graph = { ...(settings.graph ?? {}), ghosts: e.target.checked }; localKey = ""; applyConfig(); changed(); });
  $("set-reset").addEventListener("click", () => { delete settings.graph; syncPanel(); localKey = ""; applyConfig(); changed(); });
  syncPanel();
  $("local-depth").value = String(settings.localDepth ?? 1);
  $("local-depth").addEventListener("change", (e) => { settings.localDepth = Number(e.target.value); changed(); });
  renderGroups();

  // Canvas colours come from CSS tokens — re-read them when the theme flips.
  new MutationObserver(() => { local?.refreshTheme(); whole?.refreshTheme(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return { renderWhole, renderLocal };
}
