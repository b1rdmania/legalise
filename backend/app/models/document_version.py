"""DocumentVersion — versioned snapshots of a document.

Each document starts with a `version_number=1, kind='upload'` row. Subsequent
versions are produced by edit instructions (`assistant_edit`), user
accept/reject flows (`user_accept`/`user_reject`), pure generation
(`generated`), replication (`replicated`), or direct editor saves
(`user_edit`).
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


VERSION_KIND_UPLOAD = "upload"
VERSION_KIND_ASSISTANT_EDIT = "assistant_edit"
VERSION_KIND_USER_ACCEPT = "user_accept"
VERSION_KIND_USER_REJECT = "user_reject"
VERSION_KIND_USER_EDIT = "user_edit"
VERSION_KIND_GENERATED = "generated"
VERSION_KIND_REPLICATED = "replicated"
VERSION_KIND_VALUES = {
    VERSION_KIND_UPLOAD,
    VERSION_KIND_ASSISTANT_EDIT,
    VERSION_KIND_USER_ACCEPT,
    VERSION_KIND_USER_REJECT,
    VERSION_KIND_USER_EDIT,
    VERSION_KIND_GENERATED,
    VERSION_KIND_REPLICATED,
}


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_versions_doc_num"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    storage_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<DocumentVersion {self.document_id} v{self.version_number} kind={self.kind}>"
