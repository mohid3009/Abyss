# ADR-0005: Vanilla JS + Vite with vendored libraries; theming via CSS tokens

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

The UI is a static bundle in a sandboxed iframe with a host-enforced CSP; only the Anna SDK origin is allowlisted by default. Needs: a real markdown editor, graph, diagrams, charts, zip handling, and user-customizable themes that also follow Anna's light/dark (`anna.onThemeChange`). One builder, ~2 days to v1.

## Decision

Vanilla JS (ES modules) built with **Vite** into `bundle/`; all libraries **vendored into the bundle** (no CDN). Libraries: CodeMirror 6 + `@codemirror/lang-markdown` (editor), `marked` (preview), `jszip`, `force-graph` (ADR-0006), `mermaid` + `chart.js` (ADR-0009, lazy-loaded). Theming: CSS custom properties (`--bg`, `--fg`, `--accent`, `--font-body`, …); a theme is a saved set of token values in `settings`.

## Alternatives Considered

### Alternative 1: React (+ component library)
- **Pros**: familiar; ecosystem (React Flow, etc.)
- **Cons**: more boilerplate and bundle weight for a mostly imperative UI (editor, canvas graph)
- **Why not**: the heavy parts are imperative libraries anyway; React adds little

### Alternative 2: No build step, CDN imports
- **Pros**: zero tooling
- **Cons**: CDN origins must be added to CSP; CodeMirror 6 is many packages; review fragility
- **Why not**: CSP and reliability risk in review

### Alternative 3: Textarea + preview instead of CodeMirror
- **Pros**: trivial
- **Cons**: no live markdown styling, no `[[` autocomplete
- **Why not**: Obsidian users expect a real editor

## Consequences

### Positive
- No CSP surprises; one self-contained bundle
- Themes are data — new styles need no code

### Negative
- Bundle size grows with Mermaid (~1 MB) → lazy-load Visualize code

### Risks
- Hand-rolled UI state gets messy as features grow → one `state` module with explicit `render*()` functions; revisit framework choice only if state bugs appear
