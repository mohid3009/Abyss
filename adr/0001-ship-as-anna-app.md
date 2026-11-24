# ADR-0001: Ship as an Anna App (UI bundle + one Executa)

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Founding Builder grants pay only for **Anna Marketplace Apps** with a user-facing interface and working backend logic, measured by Qualified App MAU. A repo, agent, MCP server or demo alone is not eligible. Users must be able to run Abyss inside Anna, and Anna's main agent must be able to use the notes (PRD capability 2).

## Decision

Abyss is one Anna App: a static SPA **UI bundle** (sandboxed iframe) plus one bundled Node **Executa** (`abyss-tools`) declared in `manifest.json` (schema 4).

## Alternatives Considered

### Alternative 1: Standalone web app (own domain, own auth)
- **Pros**: full control, works outside Anna, any backend
- **Cons**: not eligible for grants; own auth, hosting, LLM keys and billing
- **Why not**: fails the program's eligibility rule

### Alternative 2: Obsidian plugin + thin Anna Skill
- **Pros**: lives where Obsidian users already are
- **Cons**: runs outside Anna, so runs don't count as App MAU; Obsidian plugin review is slow
- **Why not**: no grant path, and the value moves out of Anna

### Alternative 3: Skill or Executa only (no UI)
- **Pros**: smallest build
- **Cons**: review requires an interactive UI; no graph, editor or visuals
- **Why not**: not eligible; graph is a core requirement

## Consequences

### Positive
- Eligible for grants; Anna provides hosting, accounts, LLM billing, sandboxing
- Executa tools are discovered by the main agent at runtime — `#abyss` in chat works without extra wiring

### Negative
- Bound by Anna platform limits (storage caps, sandbox CSP, no scheduler)
- Users must install Anna desktop — funnel friction outside the Anna user base

### Risks
- Platform APIs are beta (`v1.1.0-beta`) and may change → use only documented methods; run `anna-app validate --strict` in every build
