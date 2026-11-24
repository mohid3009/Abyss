// Canvas knowledge graph on force-graph (ADR-0006). Data comes from lib/graphdata.js.
import ForceGraph from "force-graph";
import { forceX, forceY } from "d3-force-3d";

// "#rrggbb" -> rgba(...) (canvas can't use CSS variables)
const withAlpha = (hex, a) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex;
};
const idOf = (x) => (typeof x === "object" ? x.id : x);
// display knobs shared by every graph (set through configure())
let sizeK = 0.7, linkW = 1.2, labelZoom = 1.4;
const radius = (n) => Math.sqrt(1 + n.degree * 0.8) * 3 * sizeK;

export function createGraph(el, { onOpen, onLink }) {
  let dropTarget = null;   // node under the one being dragged: release = link them
  let colors = {};
  let font = "sans-serif";
  let hover = null;
  let focusId = null;
  let adj = new Map();
  let fitted = false;

  // CSS tokens are read once per theme change, not per frame.
  const refreshTheme = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n) => s.getPropertyValue(n).trim();
    colors = { fg: v("--fg"), muted: v("--muted"), line: v("--line"), accent: v("--accent") };
    colors.edge = withAlpha(colors.muted, 0.7);   // edges: muted text tone, not the near-invisible divider colour
    font = getComputedStyle(document.body).fontFamily || font;
  };
  refreshTheme();

  // zoom-to-fit, but never past 1.2x: small graphs would otherwise fill the pane with huge nodes
  const fit = () => { fg.zoomToFit(400, 30); setTimeout(() => { if (fg.zoom() > 1.2) fg.zoom(1.2, 300); }, 450); };
  const lit = (id) => !hover || id === hover.id || adj.get(hover.id)?.has(id);
  const touchesHover = (l) => hover && (idOf(l.source) === hover.id || idOf(l.target) === hover.id);

  const fg = new ForceGraph(el)
    .backgroundColor("rgba(0,0,0,0)")
    .nodeRelSize(3)
    .nodeVal((n) => 1 + n.degree * 0.8)
    .nodeLabel(() => "")                 // labels are drawn on canvas; the default tooltip is innerHTML
    .linkColor((l) => (touchesHover(l) ? colors.accent : colors.edge))
    .linkWidth((l) => (touchesHover(l) ? linkW * 2.2 : linkW))
    .warmupTicks(80)           // settle off screen first: no explosion on open
    .cooldownTicks(120)
    .onEngineStop(() => { if (!fitted) { fitted = true; fit(); } })
    .onNodeHover((n) => { hover = n; el.style.cursor = n ? "pointer" : ""; })
    .onNodeClick((n) => onOpen(n))
    // Drag a node onto another to link them (source = dragged, ghost nodes can't be sources).
    .onNodeDrag((n) => {
      dropTarget = null;
      if (!onLink || n.ghost) return;
      let best = Infinity;
      for (const m of fg.graphData().nodes) {
        if (m === n) continue;
        const d = Math.hypot(m.x - n.x, m.y - n.y);
        if (d < radius(m) + radius(n) + 6 && d < best) { best = d; dropTarget = m; }
      }
    })
    .onNodeDragEnd((n) => {
      const target = dropTarget;
      dropTarget = null;
      if (target && onLink && !n.ghost) onLink(n, target);
    })
    .nodeCanvasObject((n, ctx, scale) => {
      const r = radius(n);
      ctx.globalAlpha = lit(n.id) ? 1 : 0.18;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      if (n.ghost) {
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.strokeStyle = colors.muted;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = n.id === focusId ? colors.accent : n.color ?? colors.muted;
        ctx.fill();
        if (n.id === focusId) { ctx.strokeStyle = colors.fg; ctx.lineWidth = 1.5 / scale; ctx.stroke(); }
      }
      if (n === dropTarget) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4 / scale, 0, 2 * Math.PI);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
      if (scale > labelZoom || n.id === focusId || (hover && lit(n.id)) || n.degree >= 6) {
        ctx.font = `500 ${12 / scale}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = n.ghost ? colors.muted : colors.fg;
        ctx.fillText(n.title.length > 40 ? n.title.slice(0, 38) + "…" : n.title, n.x, n.y + r + 2 / scale);
      }
      ctx.globalAlpha = 1;
    })
    .nodePointerAreaPaint((n, color, ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius(n) + 2, 0, 2 * Math.PI);
      ctx.fill();
    });

  // weak pull to the centre keeps orphans near the cluster (as in Obsidian)
  fg.d3Force("x", forceX(0).strength(0.06)).d3Force("y", forceY(0).strength(0.06));
  fg.d3Force("charge").strength(-90);
  fg.d3Force("link").distance(36);

  const ro = new ResizeObserver(() => fg.width(el.clientWidth).height(el.clientHeight));
  ro.observe(el);

  return {
    // refit: zoom to fit once the new layout settles
    set(data, { focus = null, refit = true } = {}) {
      focusId = focus;
      adj = new Map();
      for (const l of data.links) {
        const s = idOf(l.source), t = idOf(l.target);
        (adj.get(s) ?? adj.set(s, new Set()).get(s)).add(t);
        (adj.get(t) ?? adj.set(t, new Set()).get(t)).add(s);
      }
      if (refit) fitted = false;
      fg.graphData(data);
    },
    refreshTheme,
    // forces: repel 10-300, distance 10-120, center 0-0.3; display: size, link width, label zoom
    configure(o = {}) {
      sizeK = o.nodeSize ?? sizeK; linkW = o.linkWidth ?? linkW; labelZoom = o.labelZoom ?? labelZoom;
      fg.d3Force("charge").strength(-(o.repel ?? 90));
      fg.d3Force("link").distance(o.distance ?? 36);
      fg.d3Force("x").strength(o.center ?? 0.06);
      fg.d3Force("y").strength(o.center ?? 0.06);
      fg.d3ReheatSimulation();
    },
    zoomToFit: () => fit(),
    destroy() { ro.disconnect(); fg._destructor?.(); },
  };
}
