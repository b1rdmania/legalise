"""Audited hybrid retrieval over a matter's indexed document chunks (P3).

Two pure data functions the assistant runtime calls instead of passively
receiving stuffed document bodies:

- ``search_documents`` — hybrid (vector ∪ keyword) search over
  ``document_chunks``, scoped to one matter and restricted to chunks whose
  parent document has reached ``index_status == INDEX_INDEXED``. The two
  result sets are merged with reciprocal-rank fusion (RRF). If the vector
  path errors (e.g. embeddings backend unavailable, pgvector bindings
  missing) it degrades to keyword-only rather than failing the turn.
- ``read_document`` — the full extracted body of one owned-in-matter
  document, truncated to a char budget.

Neither function writes audit rows. Auditing is the caller's job so the
audit row commits inside the request transaction alongside the work it
records (see ``app.modules.assistant.pipeline``). See
``docs/RETRIEVAL_DESIGN.md``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import embeddings
from app.models.document import INDEX_INDEXED, Document
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody
from app.models.document_chunk import DocumentChunk

# Reciprocal-rank-fusion constant. score = sum(1 / (RRF_K + rank)) across the
# vector and keyword lists; 60 is the conventional default and damps the
# influence of any single list's ordering.
_RRF_K = 60

# How many candidates to pull from each list before fusion. A pool wider than
# the requested ``k`` lets RRF reward chunks that rank in both lists.
_CANDIDATE_POOL = 40


@dataclass(frozen=True)
class RetrievalHit:
    """One retrieved chunk with its fused relevance score."""

    document_id: uuid.UUID
    chunk_index: int
    text: str
    char_start: int
    char_end: int
    score: float


# Internal candidate shape shared by both search paths: the chunk identity and
# body columns, keyed for fusion by chunk id.
@dataclass(frozen=True)
class _Candidate:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    text: str
    char_start: int
    char_end: int


def _row_to_candidate(row) -> _Candidate:
    # Both queries select the same first six columns in the same order.
    return _Candidate(
        chunk_id=row[0],
        document_id=row[1],
        chunk_index=row[2],
        text=row[3],
        char_start=row[4],
        char_end=row[5],
    )


async def _vector_candidates(
    session: AsyncSession,
    matter_id: uuid.UUID,
    query_vector: list[float],
    limit: int,
) -> list[_Candidate]:
    """Top chunks by cosine distance (ascending) to the query vector.

    Uses the pgvector ``cosine_distance`` comparator on the embedding column.
    Raises if the bindings/operator are unavailable; the caller treats that as
    a signal to fall back to keyword-only.
    """
    stmt = (
        select(
            DocumentChunk.id,
            DocumentChunk.document_id,
            DocumentChunk.chunk_index,
            DocumentChunk.text,
            DocumentChunk.char_start,
            DocumentChunk.char_end,
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            DocumentChunk.matter_id == matter_id,
            Document.index_status == INDEX_INDEXED,
            DocumentChunk.embedding.isnot(None),
        )
        .order_by(DocumentChunk.embedding.cosine_distance(query_vector))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [_row_to_candidate(row) for row in rows]


# Keyword search uses raw SQL so the FTS config ('english') is a SQL literal
# rather than a bound parameter — a bound param resolves to text and fails to
# match plainto_tsquery's regconfig overload. ``tsv`` is a generated, unmapped
# column, so it is referenced here directly.
_KEYWORD_SQL = sql_text(
    """
    SELECT dc.id, dc.document_id, dc.chunk_index, dc.text,
           dc.char_start, dc.char_end,
           ts_rank(dc.tsv, plainto_tsquery('english', :query)) AS rank
    FROM document_chunks AS dc
    JOIN documents AS d ON d.id = dc.document_id
    WHERE dc.matter_id = :matter_id
      AND d.index_status = :indexed
      AND dc.tsv @@ plainto_tsquery('english', :query)
    ORDER BY rank DESC
    LIMIT :limit
    """
)


async def _keyword_candidates(
    session: AsyncSession,
    matter_id: uuid.UUID,
    query: str,
    limit: int,
) -> list[_Candidate]:
    """Top chunks by full-text ``ts_rank`` for the query."""
    rows = (
        await session.execute(
            _KEYWORD_SQL,
            {
                "query": query,
                "matter_id": matter_id,
                "indexed": INDEX_INDEXED,
                "limit": limit,
            },
        )
    ).all()
    return [_row_to_candidate(row) for row in rows]


def _fuse(
    vector_hits: list[_Candidate],
    keyword_hits: list[_Candidate],
    k: int,
) -> list[RetrievalHit]:
    """Reciprocal-rank fusion of the two candidate lists, top-k unique chunks."""
    scores: dict[uuid.UUID, float] = {}
    candidates: dict[uuid.UUID, _Candidate] = {}
    for ranked_list in (vector_hits, keyword_hits):
        for rank, candidate in enumerate(ranked_list, start=1):
            scores[candidate.chunk_id] = scores.get(candidate.chunk_id, 0.0) + 1.0 / (
                _RRF_K + rank
            )
            candidates[candidate.chunk_id] = candidate

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:k]
    out: list[RetrievalHit] = []
    for chunk_id, score in ranked:
        c = candidates[chunk_id]
        out.append(
            RetrievalHit(
                document_id=c.document_id,
                chunk_index=c.chunk_index,
                text=c.text,
                char_start=c.char_start,
                char_end=c.char_end,
                score=score,
            )
        )
    return out


async def search_documents(
    session: AsyncSession,
    matter_id: uuid.UUID,
    query: str,
    *,
    k: int = 8,
) -> list[RetrievalHit]:
    """Hybrid, matter-scoped search over indexed document chunks.

    Combines vector similarity (cosine distance on the query embedding) with
    full-text keyword match (``ts_rank``), merges with reciprocal-rank fusion,
    and returns the top-``k`` unique chunks. Restricted to chunks whose parent
    document has reached ``INDEX_INDEXED``.

    Pure data: writes no audit. If the embedding/vector path errors, falls back
    to keyword-only rather than failing the turn.
    """
    if k <= 0 or not query.strip():
        return []

    pool = max(k, _CANDIDATE_POOL)

    # Keyword search always runs (it never depends on the embeddings backend).
    keyword_hits = await _keyword_candidates(session, matter_id, query, pool)

    vector_hits: list[_Candidate] = []
    try:
        query_vector = await embeddings.embed_query(query)
        vector_hits = await _vector_candidates(session, matter_id, query_vector, pool)
    except Exception:
        # Embeddings backend unavailable, pgvector bindings/operator missing,
        # or any vector-path failure: degrade to keyword-only.
        vector_hits = []

    return _fuse(vector_hits, keyword_hits, k)


async def read_document(
    session: AsyncSession,
    matter_id: uuid.UUID,
    document_id: uuid.UUID,
    *,
    char_budget: int,
) -> str | None:
    """Return the extracted body of an owned-in-matter document, budgeted.

    ``None`` if the document is not in this matter. An in-matter document with
    no extracted body returns ``""``. Pure data: writes no audit.
    """
    owned = await session.scalar(
        select(Document.id).where(
            Document.id == document_id,
            Document.matter_id == matter_id,
        )
    )
    if owned is None:
        return None

    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    text = body.extracted_text if body and body.extracted_text else ""
    if char_budget <= 0:
        return ""
    if len(text) <= char_budget:
        return text
    return text[:char_budget].rstrip() + "…"


__all__ = ["RetrievalHit", "search_documents", "read_document"]
