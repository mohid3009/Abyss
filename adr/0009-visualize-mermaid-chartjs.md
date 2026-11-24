# ADR-0009: Flow graphs via Mermaid, infographics via extracted data + Chart.js

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Milestone 3 turns notes into editable **flow graphs** (order: mind map → process flowchart → timeline → decision tree) and **infographics** (charts, stat cards, comparisons), with custom colours and PNG export. LLMs reliably write Mermaid. Infographic numbers must be true to the notes — an invented number is worse than none.

## Decision

- **Flow graphs**: the LLM emits **Mermaid** source (`mindmap`, `flowchart`, `timeline`, flowchart-as-decision-tree). Rendered with `mermaid` using `securityLevel: 'strict'` (no click handlers or HTML labels from LLM source); edited in a side-by-side source panel with live preview; colours via a Mermaid theme generated from the user's tokens. Saved as a note containing a `mermaid` code block — so it also renders in Obsidian after export.
- **Infographics**: the LLM **extracts data only** into a fixed schema `{title, stats:[{label, value, unit, sourceNoteTitle}], series:[…], comparisons:[…]}`; every value in `stats`, `series` and `comparisons` must carry a `sourceNoteTitle` that exists and whose text contains the number (validated). Matching normalises both sides first: strip currency symbols, `%`, spaces and thousands separators; expand `k`/`m`/`bn` suffixes; compare at the note's precision (`12.4k` = `12,400`). A computed value (growth, churn %) is allowed only as `{derived: true, formula, inputs:[…]}` where every input passes the same check; the card marks it "calculated". Values that fail are dropped, not shown. Rendered by our own templates (stat cards + `chart.js`). Export PNG via canvas.

## Alternatives Considered

### Alternative 1: React Flow / custom node editor for flows
- **Pros**: drag-and-drop editing
- **Cons**: needs React; layout engine (elk/dagre) wiring; days of work
- **Why not**: Mermaid covers all four types now; drag editing can come later on the same data

### Alternative 2: LLM generates full infographic HTML/SVG
- **Pros**: unlimited visual variety
- **Cons**: unverifiable numbers, inconsistent styling, script-injection risk in the iframe
- **Why not**: correctness and safety

### Alternative 3: Vega-Lite specs from the LLM
- **Pros**: declarative, powerful
- **Cons**: large runtime; LLM-written specs fail in subtle ways
- **Why not**: fixed templates are more reliable and on-brand

## Consequences

### Positive
- Four flow types with one renderer; exported notes stay Obsidian-compatible
- Every infographic number traces to a note

### Negative
- Flow editing is text-based at first (drag-and-drop editing is a later upgrade on the same Mermaid source)
- Infographic layouts limited to our templates

### Risks
- Mermaid syntax errors from the LLM → validate with `mermaid.parse`, retry once, fall back to a bullet outline (ADR-0008)
- Mermaid injects inline `<style>` into its SVG; the sandbox CSP may block it → check in the throwaway-app spike (ADR-0011) before milestone 3
