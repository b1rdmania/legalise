"""DocumentEdit — a single pending/accepted/rejected change on a version.

`change_id` is a server-assigned UUID String(64). `correlation_id` is the
transient `c1`/`c2` tag returned by the model on a given response and used
only to round-trip the model's identifiers through the API; it has no
uniqueness guarantee across versions.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


EDIT_STATUS_PENDING = "pending"
EDIT_STATUS_ACCEPTED = "accepted"
EDIT_STATUS_REJECTED = "rejected"
EDIT_STATUS_VALUES = {EDIT_STATUS_PENDING, EDIT_STATUS_ACCEPTED, EDIT_STATUS_REJECTED}


class DocumentEdit(Base):
    __tablename__ = "document_edits"
    __table_args__ = (
        UniqueConstraint("document_version_id", "change_id", name="uq_document_edits_version_change"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    change_id: Mapped[str] = mapped_column(String(64), nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    deleted_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    inserted_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    context_before: Mapped[str] = mapped_column(Text, nullable=False, default="")
    context_after: Mapped[str] = mapped_column(Text, nullable=False, default="")

    status: Mapped[str] = mapped_column(String(16), nullable=False, default=EDIT_STATUS_PENDING, index=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<DocumentEdit {self.id} status={self.status}>"
