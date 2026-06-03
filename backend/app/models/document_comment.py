"""DocumentComment — owner-scoped review notes on a document."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


COMMENT_STATUS_OPEN = "open"
COMMENT_STATUS_RESOLVED = "resolved"
COMMENT_STATUS_VALUES = {COMMENT_STATUS_OPEN, COMMENT_STATUS_RESOLVED}


class DocumentComment(Base):
    __tablename__ = "document_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    quote_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anchor_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anchor_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default=COMMENT_STATUS_OPEN, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<DocumentComment {self.document_id} status={self.status}>"
