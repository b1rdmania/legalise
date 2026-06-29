"""DocumentChunk model — the retrieval substrate for P3.

One row per chunk of a document's extracted text. Each chunk carries a
pgvector embedding (vector similarity) and a DB-generated ``tsvector``
(full-text keyword search); together they back the assistant's hybrid,
matter-scoped retrieval. See docs/RETRIEVAL_DESIGN.md.

``embedding`` is nullable: chunks are written first and embedded by an
async job, so it stays NULL until the document is indexed. ``tsv`` is a
generated, DB-managed column and is deliberately not mapped here — the ORM
must never try to write it.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# The embedding column is ``vector(384)`` in Postgres (pgvector). Map it with
# the pgvector SQLAlchemy type when available; fall back to an unmapped column
# type so the model stays importable in environments without the bindings.
try:
    from pgvector.sqlalchemy import Vector  # type: ignore

    _EmbeddingType = Vector(384)
except Exception:  # pragma: no cover - bindings always present in app/CI
    from sqlalchemy.types import UserDefinedType

    class _Vector384(UserDefinedType):  # type: ignore[misc]
        cache_ok = True

        def get_col_spec(self, **kw: object) -> str:
            return "vector(384)"

    _EmbeddingType = _Vector384()


# Embedding dimension is fixed at 384 for v1 (BAAI/bge-small-en-v1.5 / hash
# fallback). Changing it is a migration, not a config flip.
EMBEDDING_DIM = 384


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id"),
        nullable=False,
        index=True,
    )

    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_start: Mapped[int] = mapped_column(Integer, nullable=False)
    char_end: Mapped[int] = mapped_column(Integer, nullable=False)

    # vector(384); NULL until the async embed job fills it.
    embedding: Mapped[list[float] | None] = mapped_column(_EmbeddingType, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # NB: the ``tsv`` tsvector column is generated and DB-managed; it is
    # intentionally not mapped so the ORM never writes to it.

    def __repr__(self) -> str:
        return f"<DocumentChunk doc={self.document_id} idx={self.chunk_index}>"
