# ADR-006 — Hybrid local retrieval (pgvector + full-text), audited per search

**Status:** Accepted, shipped 2026-06-29 (migrations 0036–0038).

## Context

Before P3, chat context was "the 3 most recent docs" — indefensible. But the
obvious fix (call a hosted embeddings API) breaks the privilege story: legal
professional privilege can be waived by disclosure to a third party, and
Legalise's TRUST.md §1 promise is "indexing privileged documents does not send
text to a model provider". The model gateway is supposed to be the *single*
egress point for matter content (THREAT_MODEL); a second egress via an
embedding API would double the sub-processor surface for every document —
including on `C_paused` matters, which must generate zero cloud traffic.

## Decision

- **Embeddings are computed locally, in-tenant, keyless by default:**
  `fastembed` BAAI/bge-small-en-v1.5, 384-dim ONNX, CPU, no torch
  (`backend/app/core/embeddings.py`). The Docker image pre-bakes the model
  (no runtime download). A deterministic 384-dim `hash` backend
  (`LEGALISE_EMBEDDING_BACKEND=hash`) is the slim/offline/CI fallback —
  lexical-ish, NOT semantic, and honest about it.
- **Retrieval is hybrid:** pgvector cosine (HNSW) + Postgres full-text (GIN
  tsvector) with reciprocal-rank fusion, over `document_chunks`
  (migration 0036: text + char offsets + `vector(384)` + generated tsvector),
  indexed-docs-only (`documents.index_status`, migration 0037). One store
  (Postgres) holds relational, audit, and vectors — no separate vector DB.
- **Every search is audited:** each turn writes a `retrieval.search` row
  (query hashed, k, hit_count, document_ids) — "what did the AI see" is a
  precise per-turn trail, replayable not inferred. The retrieval functions
  themselves are pure data (`backend/app/core/retrieval.py` writes no audit;
  auditing is the caller's job so the row commits with the work — but note
  the assistant writes it **out-of-band** via `audit_out_of_band` to avoid
  the advisory-lock deadlock in ADR-002).
- **Sources are first-class:** the assistant persists the passages it relied
  on (`assistant_messages.sources`, migration 0038), rendered as clickable
  citations into the document reader at the char range. Reviewable before
  sign-off.
- The pgvector column and index are **fixed at 384 dims for v1**; both
  backends emit unit-norm 384-dim vectors by contract.

## Consequences

- Retrieval quality is bounded by a small local model — a deliberate
  privilege-over-quality trade-off, framed as a *choice* in LIMITATIONS.md.
- Changing the embedding model/dimension is a re-index migration, not a config
  flip.
- History note: pgvector was *removed* from deps in June (post-IC-report
  cleanup, when unused) and deliberately re-added as a main dependency when
  retrieval shipped. Don't read the June removal as "pgvector is unwanted".

## What not to change, and why

- **Do not route embedding of matter content through any third-party API**
  (OpenAI embeddings, Voyage, Cohere, etc.). This silently breaks the LPP
  promise and the single-egress threat model. If a better embedder is needed,
  it must run in-tenant.
- **Do not remove the `retrieval.search` audit row or batch it away** — the
  per-turn evidence trail is a stated product promise ("What did it see?").
- **Do not swap the hash fallback for a "small remote model"** in slim
  installs — offline means offline.
- **Keep retrieval functions audit-free and callers audit-responsible**, and
  keep the out-of-band write pattern (see the deadlock rule in ADR-002).
