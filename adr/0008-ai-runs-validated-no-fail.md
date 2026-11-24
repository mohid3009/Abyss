# ADR-0008: AI runs — grounded, schema-validated, never fail

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Capture, Ask and Visualize are the **qualified runs** that earn MAU; a failed run doesn't count and hurts trust. LLM output can be malformed JSON or cite notes that don't exist. The model is chosen and billed by the host via `llm.complete`.

## Decision

Every AI run follows one pipeline:
1. **Retrieve** with ADR-0004 (top-k notes) — the model only sees provided notes.
2. **Generate** with low temperature (0.2) and a strict JSON schema in the prompt.
3. **Validate**: parse JSON; drop links/citations whose titles aren't in `index`; require non-empty fields.
4. **Retry once** on parse failure.
5. **Fallback** (never an error screen): Capture → save raw input as a note; Ask → keyword results + "not found in your notes"; Visualize → plain outline of the note.

Citations are rendered from validated titles only, never from free text.

## Alternatives Considered

### Alternative 1: Free-text output, render as-is
- **Pros**: simplest
- **Cons**: hallucinated citations, broken links, unparseable structure
- **Why not**: wrong citations destroy trust in a memory product

### Alternative 2: Agent session with tools (`agent.*`) for every run
- **Pros**: model can search iteratively
- **Cons**: slower, costlier, less predictable
- **Why not**: single retrieve-then-generate is enough for v1; revisit for "Talk" mode (milestone 2)

## Consequences

### Positive
- Runs always end with a meaningful result for the user
- Citations are always real notes

### Negative
- Validation drops some legitimately useful model suggestions

### Risks
- Unverified: whether a run that ends in a fallback still counts as a Qualified App Run depends on how Anna records runs server-side → confirm with the platform docs/team; don't count fallbacks in our own metrics until confirmed
- Host model changes alter output quality → keep 10 fixture prompts in `selfcheck` and re-run on SDK/model changes

## Implementation notes (v1, 2026-11-24)

- Ask asks the model to cite **note numbers** (`[1, 3]`) rather than titles; titles, `Note N: Title` and `[[Title]]` are still accepted. In testing, title citations failed to match when near-duplicate titles were in context; numbers are unambiguous. Every citation is still resolved against the notes actually sent.
- Retrieval falls back to title/tag keyword matching when vectors are missing or `llm.embed` fails.
- Capture writes tags and links into the note body (Obsidian-style), so the index derives them like any other note.
