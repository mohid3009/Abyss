// Index entries -> force-graph {nodes, links} (ADR-0006). Pure, so it's tested
// without a canvas.
import { makeResolver } from "./parse.js";

// "#tag" (matches nested tags too: #project matches project/alpha),
// "path:folder" (prefix), otherwise a case-insensitive title substring.
export function matchesQuery(node, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (q.startsWith("#")) {
    const t = q.slice(1);
    return (node.tags ?? []).some((x) => { x = x.toLowerCase(); return x === t || x.startsWith(t + "/"); });
  }
  if (q.startsWith("path:")) {
    const p = q.slice(5);
    const np = (node.path ?? "").toLowerCase();
    return np === p || np.startsWith(p + "/");
  }
  return node.title.toLowerCase().includes(q);
}

// opts: center (note id) + depth for a local graph; orphans (default true);
// filter (query string); groups ([{query, color}], first match wins).
export function graphData(entries, { center = null, depth = 1, orphans = true, ghosts = true, filter = "", groups = [] } = {}) {
  const resolve = makeResolver(entries);
  const nodes = new Map(entries.map((e) => [e.id, { id: e.id, title: e.title, tags: e.tags, path: e.path, degree: 0 }]));
  const pairs = new Map();
  for (const e of entries) {
    for (const target of e.links) {
      let to = resolve(target)?.id;
      if (!to && !ghosts) continue;
      if (!to) {
        to = "ghost:" + target.toLowerCase();
        if (!nodes.has(to)) nodes.set(to, { id: to, title: target, tags: [], path: "", degree: 0, ghost: true });
      }
      if (to === e.id) continue;
      const key = e.id < to ? `${e.id}\u0000${to}` : `${to}\u0000${e.id}`;
      if (!pairs.has(key)) pairs.set(key, { source: e.id, target: to });
    }
  }

  let keep = null;   // Set of node ids, or null = all
  if (center && nodes.has(center)) {
    const adj = new Map();
    for (const { source, target } of pairs.values()) {
      (adj.get(source) ?? adj.set(source, []).get(source)).push(target);
      (adj.get(target) ?? adj.set(target, []).get(target)).push(source);
    }
    keep = new Set([center]);
    let frontier = [center];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const id of frontier) for (const n of adj.get(id) ?? []) if (!keep.has(n)) { keep.add(n); next.push(n); }
      frontier = next;
    }
  }
  if (filter.trim()) {
    const hits = new Set([...nodes.values()].filter((n) => matchesQuery(n, filter)).map((n) => n.id));
    keep = keep ? new Set([...keep].filter((id) => hits.has(id) || id === center)) : hits;
  }

  const links = [...pairs.values()].filter((l) => !keep || (keep.has(l.source) && keep.has(l.target)));
  for (const l of links) { nodes.get(l.source).degree++; nodes.get(l.target).degree++; }
  const out = [...nodes.values()].filter((n) => (!keep || keep.has(n.id)) && (orphans || n.degree > 0 || n.id === center));
  for (const n of out) {
    const g = groups.find((g) => g.query && matchesQuery(n, g.query));
    if (g) n.color = g.color;
  }
  return { nodes: out, links };
}
