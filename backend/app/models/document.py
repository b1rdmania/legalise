"""Document model.

Records every file attached to a matter. SHA-256 is mandatory so the audit
trail can refer to documents by content hash, not just filename.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, BigInteger, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Document tags — informational, not authorisation.
TAG_DISCLOSURE = "disclosure"
TAG_DRAFT = "draft"
TAG_CLEARED = "cleared"
TAG_SIGNED = "signed"
TAG_VALUES = {TAG_DISCLOSURE, TAG_DRAFT, TAG_CLEARED, TAG_SIGNED}


# Retrieval indexing status (P3 — see docs/RETRIEVAL_DESIGN.md). A document is
# searchable only once it reaches INDEX_INDEXED; until then the assistant must
# say so. INDEX_EMPTY means there was no extracted text worth chunking.
INDEX_PENDING = "pending"
INDEX_INDEXED = "indexed"
INDEX_FAILED = "failed"
INDEX_EMPTY = "empty"
INDEX_STATUS_VALUES = {INDEX_PENDING, INDEX_INDEXED, INDEX_FAILED, INDEX_EMPTY}


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matters.id"), nullable=False, index=True)

    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    tag: Mapped[str | None] = mapped_column(String(32), nullable=True)
    from_disclosure: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    disclosure_proceedings_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Retrieval indexing (P3). Defaults to 'pending'; the upload hook (or the
    # reindex path) chunks + embeds the extracted body and flips this to
    # 'indexed' / 'empty' / 'failed'.
    index_status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=INDEX_PENDING, default=INDEX_PENDING
    )
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Document {self.filename} sha256={self.sha256[:8]}>"
