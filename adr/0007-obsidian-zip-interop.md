# ADR-0007: Obsidian interop via .zip import/export with title-based links

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Obsidian users won't move without a lossless way in and out. Obsidian vaults are folders of `.md` files; links are `[[Title]]`, `[[Title|alias]]`, `[[Title#heading]]`, resolved by file name. Apps run in a sandbox with no documented direct filesystem access (host-kit `fs_*` tools exist for the main agent, unverified for Apps).

## Decision

v1: **import a vault `.zip`** (JSZip in the browser) and **export the vault as `.zip`** of `.md` files at any time. Links resolve **by title** (file name without `.md`), case-insensitive; `[[folder/Title]]` resolves by path. Folder path is stored in the note's `path` field (ADR-0003) — not as a tag — and restored on export. YAML frontmatter is kept verbatim, and its `tags:` (list or string) are merged into `tags[]` alongside inline `#tags`. Attachments (images/PDFs) go to `files.*`. A **live local-folder mode** is deferred to a later milestone pending a spike on `fs_*` access from App agent sessions.

**Re-import** (same vault zipped again) matches notes by `path + title`:
- New file → new note.
- Existing note not edited in Abyss since its last import (`updated ≤ imported`) → overwritten with the file.
- Existing note edited in both places → Abyss version kept; file imported as `Title (imported YYYY-MM-DD)` beside it, and the import summary lists these conflicts.
- Notes missing from the zip are **never deleted**.

## Alternatives Considered

### Alternative 1: Live sync with the local vault folder now
- **Pros**: no import; users keep Obsidian as editor
- **Cons**: depends on unverified platform capability; two-way sync conflicts
- **Why not**: too risky for v1

### Alternative 2: Abyss-native IDs in links (`[[id]]`)
- **Pros**: renames never break links
- **Cons**: incompatible with Obsidian; export would need rewriting
- **Why not**: breaks round-tripping

### Alternative 3: Import individual files only
- **Pros**: simpler UI
- **Cons**: links/folders lost; tedious for 400 notes
- **Why not**: not lossless

## Consequences

### Positive
- Round-trip with Obsidian; "no lock-in" is a real claim

### Negative
- Renaming a note must rewrite inbound `[[links]]` (same as Obsidian)
- Duplicate titles in different folders are ambiguous → resolve to shortest `path`, as Obsidian does
- Re-import conflicts produce extra notes the user must merge by hand

### Risks
- Large vaults with many attachments are slow to import → progress bar; attachments upload in the background

## Implementation notes (v1, 2026-11-24)

- Attachments are counted and reported but **not stored** in v1: `files.*` is a stub in the local harness. Store them once `files.*` is verified.
- "Not edited in Abyss since import" is `updated === imported` (a normal save never lands on the import's millisecond). Re-importing a vault with an unresolved conflict does not add another copy when an identical `(imported …)` copy already exists.
- A single root folder in the zip (zipping the vault folder itself) is stripped; hidden files and folders (`.obsidian/`, `.trash/`, `__MACOSX`) are skipped.
