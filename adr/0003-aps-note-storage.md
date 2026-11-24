# ADR-0003: Store notes in APS app scope, one key per note + one index key

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Anna Persistent Storage (APS) gives per-user KV (value ≤ 64 KB default, 256 KB hard cap, listable by prefix, etags for optimistic concurrency) and a blob store (`files.*`, ≤ 256 MB/object). `app` scope is shared between the UI bundle and the App's Executas. The sidebar, backlinks and graph need all titles and links instantly; `storage.list` returns keys and metadata but not values.

## Decision

Use APS `app` scope:

| Key | Value |
|---|---|
| `note/{id}` | `{v:1, id, title, path, body, tags[], links[], private, created, updated, imported}` (ISO-8601 timestamps; `path` = vault folder path, `""` for root; `imported` = last import time or `null`) |
| `index/{h}` | `[{id, title, path, tags, links, private, updated, etag}]` — 16 shards (h = 0–f), all loaded at startup |
| `vec/{n}` | vector packs (ADR-0004) |
| `settings` | theme, colour groups, `chatAccess` (default on), `sharing` (other apps, default off), email opt-in |
| `sched/{id}` | local mirror of scheduled notifications (ADR-0011) |

Notes over 60 KB store `body:null, file:"notes/{id}.md"` in `files.*`. All writes use `if_match` etags.

**Write order**: write `note/{id}` first, then `index`. On an `index` etag conflict (UI and Executa writing at once), re-read `index`, re-apply the one entry, retry (max 3). **Startup check**: each `index` entry also stores its note key's `etag`. Compare `storage.list("note/")` etags against `index`; re-read only notes whose etag differs or that are missing from `index`, drop entries whose note is gone, and rewrite `index` if anything changed.

**Index sharding (v1, 2026-11-24)**: one `index` key passes the 64 KB value cap at ~250 notes (~250 bytes per entry), so v1 already uses the sharded form planned below: `index/0`…`index/f`, chosen by a hash of the note id, each written with its own `if_match` and retry. 16 shards hold ~4,000 notes; past ~60 KB per shard a save fails with a clear "vault too large" error. A repair that can't be saved is kept in memory, so the app still opens. A leftover single `index` key is ignored; the startup repair rebuilds the shards from `note/*`.

Implementation notes (from running against `anna-app dev`, 2026-11-24): the dev harness storage returns no etags from `get`/`set`, ignores `if_match`, and lists as `{items, next_cursor}` instead of `{entries, cursor}` — the store accepts both and writes unguarded when no etag is known. v1 rejects notes over 60 KB instead of overflowing to `files.*` (a stub in the local harness).

## Alternatives Considered

### Alternative 1: Whole vault in one blob (`files.*` JSON)
- **Pros**: one read on startup; trivial export
- **Cons**: every edit rewrites the whole vault; UI/Executa write conflicts lose data
- **Why not**: data-loss risk on concurrent writes

### Alternative 2: External database (Supabase/Postgres)
- **Pros**: real queries, no size caps, pgvector
- **Cons**: own auth, user data leaves Anna, extra service and cost, privacy review burden
- **Why not**: unnecessary for single-user vaults; weakens the "your data stays in Anna" pitch

### Alternative 3: Key per note, no index (list + get on startup)
- **Pros**: no denormalised index to keep in sync
- **Cons**: N gets at startup (400 notes = 400 round trips)
- **Why not**: slow first paint

## Consequences

### Positive
- Instant sidebar/graph from one read; per-note writes are small and conflict-safe
- Executa reads the same keys with no translation

### Negative
- `index` is denormalised — every note write is two writes (note + index); a crash between them is repaired by the startup check

### Risks
- Sharded index tops out at ~4,000 notes → `ponytail:` raise the shard count (re-shard on load) when a vault nears it
- Total per-user quota is undocumented → show storage usage in Settings; warn at 80%
