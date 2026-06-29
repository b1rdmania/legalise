# Retrieval design (P3)

> The real product build: turn the assistant from "reads a few documents" into
> "retrieves the relevant passages across the whole matter", with every search
> and read logged so "what did the AI see?" is a precise audit trail.

## Decisions

- **Embedding backend: local + keyless by default.** `fastembed`
  (BAAI/bge-small-en-v1.5, **384-dim**, ONNX, CPU, no torch). A deterministic
  hash backend (also 384-dim) is the fallback for tests / keyless CI. Selected
  by `LEGALISE_EMBEDDING_BACKEND` (default `fastembed`, `hash` for tests).
  - Why local: a fork works with no keys, and **privileged content is never
    sent to a third party to be indexed** — the search index is in-tenant. This
    extends the privilege posture to retrieval, it doesn't weaken it.
  - OpenAI / Ollama embedding backends can be added behind the same interface
    later; the dimension is fixed at 384 for v1 so the pgvector column is stable.
- **Store: pgvector** (already enabled). New `document_chunks` table holds the
  chunk text + `vector(384)` embedding + a generated `tsvector` for keyword
  search. Hybrid retrieval = vector similarity ∪ full-text, merged and ranked.
- **Indexing: async on upload.** After extraction, chunk + embed in the
  background; track per-document indexing status so the UI and the assistant
  can be honest about what is and isn't searchable yet.
- **Access: governed, audited tools.** The assistant calls `search_documents`
  and `read_document` rather than passively receiving stuffed bodies. Each call
  writes an audit row, so the matter record shows exactly what the agent
  searched for and which documents it read.

## Schema (`document_chunks`)

| column | type | note |
|---|---|---|
| id | uuid pk | |
| document_id | uuid fk → documents ON DELETE CASCADE | hard-delete sweeps chunks |
| matter_id | uuid fk → matters | scope filter |
| chunk_index | int | order within document |
| text | text | the chunk body |
| char_start / char_end | int | offsets into extracted_text (for click-back later) |
| embedding | vector(384) | nullable until embedded |
| tsv | tsvector (generated from text) | GIN index |
| created_at | timestamptz | |

Indexes: HNSW (or ivfflat) on `embedding` (cosine), GIN on `tsv`, btree on
`document_id` and `matter_id`.

## Pipeline changes

1. **Embed on upload** — after extraction, enqueue a chunk+embed job; mark the
   document `indexed` / `pending` / `failed` with a reindex path.
2. **Retrieval tools** in `app/core/` callable from the assistant runtime:
   - `search_documents(matter_id, query, k)` → top-k chunks (hybrid), each with
     `[doc:id]`, snippet, score. Emits `retrieval.search` audit.
   - `read_document(matter_id, document_id)` → full extracted body (budgeted).
     Emits `retrieval.read` audit.
3. **Assistant**: expose the two tools alongside skills; the matter spine (P2)
   already gives the index, so the agent searches deliberately instead of being
   stuffed. Passive 3-recent stuffing is removed once tools are wired.

## Build order

1. Foundation: migration + `DocumentChunk` model; `app/core/embeddings.py`
   (interface + fastembed + hash fallback); `app/core/chunking.py`.
2. Indexing: embed-on-upload hook + status field + reindex endpoint.
3. Retrieval: hybrid query + `search_documents` / `read_document` + audit rows.
4. Assistant wiring: tools in the runtime; drop passive stuffing.
5. Frontend: show "searched for X / read Y" in the activity + assistant UI.

## Honesty boundaries

- Until a document is `indexed`, the agent must say it isn't searchable yet.
- Hybrid retrieval is ranked, not certified; the agent cites for review.
- Vector dim is fixed at 384 for v1; switching embedding model is a migration.
