# Architecture Decision Records — Abyss

Requirements: [PRD](../abyss.prd.md) · Stories: [use cases](../abyss-usecase-story.md) · Build plan: PLAN.md (pending /plan)

## System at a glance

```
┌──────────────────────────── Anna (desktop + cloud) ────────────────────────────┐
│                                                                                │
│  Anna main chat ──(#abyss, runtime tool discovery)──► Executa: abyss-tools     │
│        ▲                                       search / read / create / append │
│        │ chat.append_artifact                                 │                │
│  ┌─────┴──────────── Abyss UI bundle (sandboxed iframe) ──────┼─────────────┐  │
│  │ Editor · Graph · Ask · Capture · Visualize · Settings      │             │  │
│  │      │ storage.*  llm.complete  llm.embed  audio(STT)      │             │  │
│  └──────┼─────────────────────────────────────────────────────┼─────────────┘  │
│         ▼                                                     ▼                │
│     APS (scope: app) — notes, index, vectors, settings, schedules             │
└────────────────────────────────────┬───────────────────────────────────────────┘
                                     │ HTTPS (title + preview only)
                                     ▼
          Notification service (Cloudflare Worker + D1 + Cron) ──► Resend ──► user email
```

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-ship-as-anna-app.md) | Ship as an Anna App (UI bundle + one Executa) | accepted | 2026-11-24 |
| [0002](0002-bundle-first-logic.md) | Put product logic in the UI bundle; Executa only for chat tools | accepted | 2026-11-24 |
| [0003](0003-aps-note-storage.md) | Store notes in APS app scope, one key per note + one index key | accepted | 2026-11-24 |
| [0004](0004-semantic-search-in-process.md) | Semantic search with llm.embed + quantized vectors + in-process cosine | accepted | 2026-11-24 |
| [0005](0005-frontend-stack.md) | Vanilla JS + Vite with vendored libraries; theming via CSS tokens | accepted | 2026-11-24 |
| [0006](0006-graph-force-graph.md) | Knowledge graph rendered with force-graph (canvas) | accepted | 2026-11-24 |
| [0007](0007-obsidian-zip-interop.md) | Obsidian interop via .zip import/export with title-based links | accepted | 2026-11-24 |
| [0008](0008-ai-runs-validated-no-fail.md) | AI runs: grounded, schema-validated, never fail | accepted | 2026-11-24 |
| [0009](0009-visualize-mermaid-chartjs.md) | Flow graphs via Mermaid, infographics via extracted data + Chart.js | accepted | 2026-11-24 |
| [0010](0010-chat-and-cross-app-access.md) | Chat/cross-app access through Executa tools — chat on by default, other apps opt-in, private notes never | accepted | 2026-11-24 |
| [0011](0011-email-notifications-external.md) | Email notifications via external Cloudflare Worker + Resend | accepted | 2026-11-24 |
