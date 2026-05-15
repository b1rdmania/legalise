"""DocumentBody — extracted/redacted/summary text bodies for a document.

Composite PK `(document_id, kind)` so a single document can carry multiple
parallel bodies (e.g. original `extracted` + Phase C `redacted`) without
schema growth on `documents`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


BODY_KIND_EXTRACTED = "extracted"
BODY_KIND_REDACTED = "redacted"
BODY_KIND_SUMMARY = "summary"
BODY_KIND_VALUES = {BODY_KIND_EXTRACTED, BODY_KIND_REDACTED, BODY_KIND_SUMMARY}

EXTRACTION_METHOD_VALUES = {"pypdf", "pdfplumber", "python-docx", "passthrough", "failed"}


class DocumentBody(Base):
    __tablename__ = "document_bodies"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    kind: Mapped[str] = mapped_column(String(32), primary_key=True, default=BODY_KIND_EXTRACTED)

    extracted_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    extraction_method: Mapped[str] = mapped_column(String(32), nullable=False)
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )
    char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<DocumentBody {self.document_id} kind={self.kind} method={self.extraction_method}>"
