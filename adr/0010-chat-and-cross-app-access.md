# ADR-0010: Chat/cross-app access through Executa tools — chat on by default, other apps opt-in, private notes never

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Users want Anna chat to search, read, create and append to their notes, and other apps to reference them — the latter only if they choose to (PRD capability 2). Anna's main agent discovers installed Executas at runtime. APS is isolated per app, so other apps can't read Abyss storage directly. `apps.launch` can open Abyss with a payload; `chat.append_artifact` posts cards into the conversation.

## Decision

- Executa **`abyss-tools`** exposes `search_notes(query, limit)`, `read_note(title)`, `create_note(title, body, tags?)`, `append_note(title, text)`, all on APS `app` scope.
- Writes reuse the UI's note format (shared constants, ADR-0002): parse `[[links]]` and tags, write `note/{id}`, then update `index` with the etag-retry rule from ADR-0003. `create_note` on an existing title returns that note's title instead of creating a duplicate, so the agent can append.
- **Anna chat access is on by default** (`settings.chatAccess: true`), with a switch in Settings to turn it off. When off, tools return "Abyss chat access is off — enable it in Abyss settings".
- **Other apps are opt-in** (`settings.sharing`, off by default). It gates `apps.launch` payloads from other apps and any tool call the platform identifies as coming from another app.
- Notes with `private: true` are **never** returned, listed, created over or modified by any tool, regardless of settings. Enforced in the Executa, where data leaves.
- Other apps reference notes **through the agent** (tool calls) and by **opening Abyss** to a note via `apps.launch` with `{noteTitle}`.
- In-app "Send to chat" uses `chat.append_artifact` (user-initiated).

## Alternatives Considered

### Alternative 1: Chat access off by default (one opt-in for chat and apps)
- **Pros**: maximum caution
- **Cons**: `#abyss` fails out of the box; chat-access adoption collapses; Rhea's Wednesday story breaks
- **Why not**: owner decision — chat is the main "Anna remembers" surface; the private flag covers sensitive notes

### Alternative 2: Enforce privacy in the UI only
- **Pros**: simpler
- **Cons**: the agent bypasses the UI entirely
- **Why not**: enforcement must sit where data leaves — the Executa

### Alternative 3: Copy notes to a shared scope for other apps
- **Pros**: direct access for other apps
- **Cons**: docs say `user` scope isn't shared across apps; copies drift
- **Why not**: not supported, and duplicates data

## Consequences

### Positive
- `#abyss` works the moment Abyss is installed
- One privacy rule (private flag), enforced in one place
- Works with any app that can talk to Anna's agent

### Negative
- Notes are readable from chat by default → first run must show the chat switch and the per-note private flag
- Executa now writes (create + append) → more format-compatibility surface

### Risks
- The platform may not tell the Executa *which* app made a tool call (PRD open question). `ponytail:` until it does, another app going through Anna's agent looks like chat and is governed by `chatAccess`; the private flag is the hard guarantee. Tighten when caller identity is exposed.
- Unknown whether chat-invoked tool calls count as Qualified App Runs → primary MAU path stays in the UI (Capture/Ask/Visualize)

## Implementation notes (milestone 2, 2026-11-25)

Built: the `abyss-tools` Executa (`executas/abyss-tools`) with `search_notes`, `read_note`, `create_note` and `append_note`, and a Privacy dialog in the UI (chat access on by default, other apps off by default). All access rules live in `src/lib/chattools.js`, shared with the UI through copies synced by `npm run sync` (a test fails if they drift).

Checked in the `anna-app dev` harness, calling the tool through `anna.tools.invoke`: it reads notes the UI wrote, notes it creates appear in the UI, turning chat access off makes every tool refuse with a clear message, and a note marked Private is invisible to search, read and append (the answer is identical to a missing note, so its existence doesn't leak). Create over a private title picks a free title instead.

**Not verified, needs the real platform:**
- That Anna's main chat agent discovers and calls these tools on its own. The harness only exercises them from the UI.
- That the production host grants an Executa the app's own storage when chat (rather than the app window) invokes it. The CLI notes say plugin app scope exists only in a host attested form (`app_scope_ctx`); the harness allows it without that.
- Caller identity: the tool accepts an optional `context.caller` and treats anything other than chat as another app, which the sharing setting then gates. Until the host supplies it, every call counts as chat.
- The dev tool id `tool-dev-abyss-tools` in `manifest.json` and `executa.json` is replaced by a server assigned id when published.

Search is keyword and tag based (no embeddings in the Executa yet). Not built yet: Talk mode, and opening a specific note from another app with `apps.launch`.
