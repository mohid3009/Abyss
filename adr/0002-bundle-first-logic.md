# ADR-0002: Put product logic in the UI bundle; Executa only for chat tools

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

The UI bundle can call host APIs directly: `storage.*`, `files.*`, `llm.complete`, `llm.embed`, `audio` (STT), `chat.append_artifact`. Executas run as separate JSON-RPC processes and are needed only when Anna's main agent calls tools. Time to review submission is ~2 days, so every extra moving part is risk.

## Decision

All product logic (CRUD, links, import/export, Capture, Ask, graph, visualize, settings) runs **in the UI bundle**. The Executa holds only the four chat tools (ADR-0010) and shares data through APS `app` scope.

## Alternatives Considered

### Alternative 1: Executa-centric (UI is a thin client calling Executa for everything)
- **Pros**: one code path for UI and chat; logic in Node/Python
- **Cons**: extra RPC hop per action; harder local debugging; two runtimes to ship before v1
- **Why not**: slower to build and slower to use, with no user-visible gain

### Alternative 2: Duplicate logic in both
- **Pros**: each side self-contained
- **Cons**: two implementations of link parsing, search and storage format drift apart
- **Why not**: drift corrupts shared data

## Consequences

### Positive
- v1 can ship without the Executa if needed (cut line to be set in PLAN.md, pending /plan)
- Fast iteration with `anna-app dev` hot reload

### Negative
- Executa re-implements a small subset (search, read, create, append) — must stay format-compatible

### Risks
- Format drift between UI and Executa → shared constants (key names, note schema version `v:1`) and the same `selfcheck.mjs` fixtures run against both
