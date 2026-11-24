# ADR-0006: Knowledge graph rendered with force-graph (canvas)

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

The graph is a v1 requirement: global and local (depth 1–3) views, zoom/pan/drag, hover highlight, click-to-open, node size by degree, ghost nodes for unresolved links, orphan toggle, search/tag filters, colour groups, force sliders. Later: semantic edges and cluster labels. Vaults up to a few thousand nodes.

## Decision

Use **`force-graph`** (canvas 2D, d3-force underneath). Nodes and edges come straight from `index` (ADR-0003); ghost nodes from unresolved link titles. Force sliders map to d3-force parameters. The simulation freezes after settling (`cooldownTicks`).

## Alternatives Considered

### Alternative 1: Custom d3 SVG
- **Pros**: total control
- **Cons**: days of work for zoom, hit-testing, perf; SVG slows past ~1k nodes
- **Why not**: rebuilding what force-graph ships

### Alternative 2: Cytoscape.js
- **Pros**: rich graph-theory API, many layouts
- **Cons**: heavier; force layout looks less like Obsidian's
- **Why not**: we need the organic force look, not analysis algorithms

### Alternative 3: WebGL (sigma.js / cosmos)
- **Pros**: 100k+ nodes
- **Cons**: more setup; custom node drawing harder
- **Why not**: personal vaults don't need it yet

## Consequences

### Positive
- Obsidian-like graph in hours; custom canvas drawing for ghost nodes, labels, cluster colours

### Negative
- Canvas → labels and accessibility need care (keyboard-focusable note list beside the graph)

### Risks
- `ponytail:` canvas fine to ~5k nodes; past that switch renderer to WebGL (cosmos) — same node/edge data
