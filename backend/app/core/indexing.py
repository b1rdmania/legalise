"""Document indexing for audited retrieval (P3).

Turns a document's *extracted* body into searchable ``document_chunks``:
chunk the text, embed each chunk, and store the rows with their pgvector
embeddings. Per-document status (``documents.index_status``) records whether
a document is searchable yet, so the assistant can be honest about it.

The embedding backend is selected by ``LEGALISE_EMBEDDING_BACKEND`` (local +
keyless by default) — privileged content is never sent to a third party to be
indexed. See docs/RETRIEVAL_DESIGN.md.

Transaction policy: ``index_document`` never commits. The upload route owns
its transaction and indexes inline; the reindex endpoint / CLI commit after
calling these helpers. On failure ``index_document`` flips the document to
``failed`` and re-raises so the caller decides whether to swallow it (upload)
or surface it (reindex summary).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, UTC

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import embeddings
from app.core.chunking import chunk_text
from app.models.document import (
    Document,
    INDEX_EMPTY,
    INDEX_FAILED,
    INDEX_INDEXED,
)
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody
from app.models.document_chunk import DocumentChunk

logger = logging.getLogger(__name__)

# Embed at most this many chunks per call so a large document does not hold a
# big batch of vectors in memory at once. fastembed batches internally too.
_EMBED_BATCH_SIZE = 64


async def index_document(session: AsyncSession, document: Document) -> str:
    """Chunk, embed, and store ``document``'s extracted body.

    Idempotent: any existing chunks for the document are deleted first, so
    this doubles as the reindex primitive. Returns the resulting status
    string (``indexed`` | ``empty`` | ``failed``). Does NOT commit — the
    caller owns the transaction.

    On any exception the document is flipped to ``failed`` (left for the
    caller to flush/commit) and the exception is re-raised.
    """
    try:
        body = await session.scalar(
            select(DocumentBody).where(
                DocumentBody.document_id == document.id,
                DocumentBody.kind == BODY_KIND_EXTRACTED,
            )
        )
        text = body.extracted_text if body and body.extracted_text else ""

        chunks = chunk_text(text)
        if not chunks:
            # No body, or whitespace-only — nothing worth indexing. Still
            # sweep any stale chunks so a now-empty document stops matching.
            await session.execute(
                delete(DocumentChunk).where(
                    DocumentChunk.document_id == document.id
                )
            )
            document.index_status = INDEX_EMPTY
            document.indexed_at = datetime.now(UTC)
            return INDEX_EMPTY

        # Idempotent reindex: drop existing chunks before re-inserting.
        await session.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id == document.id)
        )

        # Embed in batches to keep memory sane on large documents.
        embeddings_by_index: dict[int, list[float]] = {}
        for batch_start in range(0, len(chunks), _EMBED_BATCH_SIZE):
            batch = chunks[batch_start : batch_start + _EMBED_BATCH_SIZE]
            vectors = await embeddings.embed_texts([c.text for c in batch])
            for chunk, vector in zip(batch, vectors):
                embeddings_by_index[chunk.index] = vector

        for chunk in chunks:
            session.add(
                DocumentChunk(
                    document_id=document.id,
                    matter_id=document.matter_id,
                    chunk_index=chunk.index,
                    text=chunk.text,
                    char_start=chunk.char_start,
                    char_end=chunk.char_end,
                    embedding=embeddings_by_index[chunk.index],
                )
            )

        document.index_status = INDEX_INDEXED
        document.indexed_at = datetime.now(UTC)
        return INDEX_INDEXED
    except Exception:
        # Mark the document failed so the status is honest; leave commit to
        # the caller. Re-raise so the caller can log / decide.
        document.index_status = INDEX_FAILED
        logger.exception("indexing failed for document %s", document.id)
        raise


async def reindex_matter(session: AsyncSession, matter_id: uuid.UUID) -> dict[str, int]:
    """Reindex every document in ``matter_id``; return a status count.

    Each document is indexed independently — one failure does not abort the
    rest. Returns ``{"indexed": n, "empty": n, "failed": n}``. Does NOT
    commit; the caller owns the transaction.
    """
    documents = list(
        (
            await session.scalars(
                select(Document).where(Document.matter_id == matter_id)
            )
        ).all()
    )

    summary = {INDEX_INDEXED: 0, INDEX_EMPTY: 0, INDEX_FAILED: 0}
    for document in documents:
        try:
            status = await index_document(session, document)
        except Exception:
            # index_document already set index_status=failed and logged.
            status = INDEX_FAILED
        summary[status] = summary.get(status, 0) + 1
    return summary


__all__ = ["index_document", "reindex_matter"]
