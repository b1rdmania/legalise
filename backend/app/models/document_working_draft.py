"""Server-backed working draft for the document editor.

The editor can autosave many times before a user decides to create an
immutable ``DocumentVersion``. This row is intentionally mutable and
document-scoped; the durable record remains the version history.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DocumentWorkingDraft(Base):
    __tablename__ = "document_working_drafts"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    plain_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    editor_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    base_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    version_counter: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    client_id: Mapped[str | None] = mapped_column(String(96), nullable=True)

    def __repr__(self) -> str:
        return f"<DocumentWorkingDraft {self.document_id} v{self.version_counter}>"
