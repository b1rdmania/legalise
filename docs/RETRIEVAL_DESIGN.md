# Retrieval design (P3)

> Turn the assistant from "reads a few documents" into "retrieves the relevant passages across the whole matter", with every search and read logged so "what did the AI see?" is a precise audit trail.

## Decisions

- **Embedding backend: local + keyless by default.** `fastembed` (BAAI/bge-small-en-v1.5, 384-dim, ONNX, CPU), with a deterministic 384-dim hash backend as the test/keyless fallback (`LEGALISE_EMBEDDING_BACKEND`). A fork works with no keys, and **privileged content is never sent to a third party to be indexed** — the index is in-tenant. OpenAI / Ollama backends can slot in behind the same interface; the dimension is fixed at 384 for v1 so the pgvector column is stable.
- **Store: pgvector.** A `document_chunks` table holds chunk text + `vector(384)` + a generated `tsvector`. Hybrid retrieval = vector similarity ∪ full-text, merged and ranked.
- **Indexing: async on upload.** Chunk + embed in the background after extraction; track per-document status so the UI can be honest about what's searchable yet.
- **Access: governed, audited tools.** The assistant calls `search_documents` and `read_document` rather than receiving stuffed bodies; each call writes an audit row.

## Schema (`document_chunks`)

`id` (uuid pk), `document_id` (fk → documents, ON DELETE CASCADE), `matter_id` (fk → matters, scope filter), `chunk_index`, `text`, `char_start` / `char_end` (offsets into extracted_text for click-back), `embedding vector(384)` (nullable until embedded), `tsv` (generated), `created_at`.

Indexes: HNSW/ivfflat on `embedding` (cosine), GIN on `tsv`, btree on `document_id` and `matter_id`.

## Pipeline and build order

1. Migration + `DocumentChunk` model; `embeddings.py` (interface + fastembed + hash fallback); `chunking.py`.
2. Embed-on-upload hook + status field (`indexed` / `pending` / `failed`) + reindex endpoint.
3. Hybrid query + retrieval tools, each writing audit rows: `search_documents(matter_id, query, k)` → top-k chunks (emits `retrieval.search`); `read_document(matter_id, document_id)` → budgeted body (emits `retrieval.read`).
4. Assistant wiring: expose both tools; drop passive 3-recent stuffing.
5. Frontend: show "searched for X / read Y" in activity + assistant UI.

## Honesty boundaries

- Until a document is `indexed`, the agent must say it isn't searchable yet.
- Hybrid retrieval is ranked, not certified; the agent cites for review.
- Vector dim is fixed at 384 for v1; switching embedding model is a migration.
