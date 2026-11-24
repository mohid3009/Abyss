# ADR-0004: Semantic search with llm.embed + quantized vectors + in-process cosine

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Ask, Capture (finding related notes), link suggestions and semantic graph edges all need "find notes about this". Anna provides `llm.embed` (UI) and `embeddings/create` (Executa): alias `anna-managed-v1`, 1536 dims, ≤ 64 inputs per call, ~text-embedding-3-small pricing (≈ $0.02 per 1M tokens). There is no host vector index. Vaults are single-user, typically 100–3,000 notes.

## Decision

Embed `title + first 1,500 chars` per note. Quantize each vector to **int8**, base64-encode (~2 KB), store **25 per KV key** in `vec/{n}` with `{alias, dims}`. Load all packs at startup and rank by cosine **in a Web Worker**. Re-embed only when the embedded text changes. Keyword search is the fallback when vectors are missing.

## Alternatives Considered

### Alternative 1: External vector DB (Pinecone, Qdrant, pgvector)
- **Pros**: scales to millions; ANN indexes
- **Cons**: note content leaves Anna; another service, key and bill
- **Why not**: overkill for one user's vault; privacy cost

### Alternative 2: Keyword/BM25 only
- **Pros**: no embedding cost; deterministic
- **Cons**: misses "annual pricing" ↔ "yearly plan"; the core Ask magic disappears
- **Why not**: semantic recall is the product

### Alternative 3: Store float32 vectors
- **Pros**: no quantization error
- **Cons**: ~8 KB/vector base64 → 4× the keys and load time
- **Why not**: int8 cosine ranking loss is negligible for top-k retrieval

## Consequences

### Positive
- Whole-vault embedding is cheap (a 2,000-note import ≈ a cent)
- Same vectors serve Ask, Capture, link suggestions and graph AI layers

### Negative
- Startup loads all vectors (2,000 notes ≈ 4 MB, 80 KV reads) → load in the Web Worker **after** first paint; Ask uses keyword search until packs are ready

### Risks
- `ponytail:` brute-force cosine fine to ~10k notes; past that, add a k-means bucket index
- Embedding alias rotation → store `alias`+`dims` per pack; re-embed in background when the alias changes

## Implementation notes (v1, 2026-11-24)

- Cosine ranking runs on the main thread, not a Web Worker: ~5 ms for 2,000 notes. Move it to a worker past ~10k notes.
- Each pack item stores `rev` (the note key's etag, or `updated` on hosts without etags) to skip unchanged notes without reading them, plus `h` (text hash) to skip re-embedding saves that didn't change the embedded text.
- Packs are written last-writer-wins (only the UI writes `vec/*`).
- Verified against the dev harness: `llm.embed({input})` returns `{model: "anna-managed-v1", data: [{index, embedding}]}`.
