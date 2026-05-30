"""DocumentBody — extracted / redacted / summary text bodies for a document.

Composite PK ``(document_id, kind)`` so a single document can carry
multiple parallel bodies (e.g. original ``extracted`` + ``redacted``)
without schema growth on ``documents``.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
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
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Populated only for kind="redacted" bodies. `mapping` carries
    # `{tokens: {...}, spans: [...]}`; `engine` is the producer
    # ("presidio" or "claude"); `anonymised_at` is the run timestamp.
    mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    engine: Mapped[str | None] = mapped_column(String(32), nullable=True)
    anonymised_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<DocumentBody {self.document_id} kind={self.kind} method={self.extraction_method}>"


async def extracted_body_for(
    session: AsyncSession, document_id: uuid.UUID
) -> DocumentBody | None:
    """Load the ``extracted`` DocumentBody for a document, or None.

    A document can carry multiple body rows (extracted / redacted /
    summary). Anything reading source text for a **grounded or hashed**
    output — source anchors, ``body_sha256``, prompt context fed to an
    anchoring runtime — MUST go through this helper. Selecting
    DocumentBody by ``document_id`` alone silently undermines the
    integrity guarantees ``body_sha256`` and ``quote_found_in_source``
    rely on (Source Anchors v1 redline P1).

    Loaders that only need *any* readable text and are not feeding a
    grounded output may continue to filter inline if a specific kind is
    intended.
    """
    return await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
