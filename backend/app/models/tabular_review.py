"""TabularReview + TabularReviewRow — spreadsheet-style review across docs.

A review owns a set of columns (each a prompt + type) and a set of rows
keyed by document. `tabular_review_rows` uses a composite PK
`(review_id, document_id)` deliberately — no standalone `id` column — because
the natural key is the review-document pair and a surrogate id buys nothing.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TabularReview(Base):
    __tablename__ = "tabular_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    # columns_config shape (documented, not enforced):
    #   [{"key": str, "label": str, "prompt": str, "type": "text"|"date"|"yesno"|"number"}, ...]
    columns_config: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    def __repr__(self) -> str:
        return f"<TabularReview {self.title}>"


class TabularReviewRow(Base):
    """No standalone `id` — composite PK is intentional."""

    __tablename__ = "tabular_review_rows"

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tabular_reviews.id", ondelete="CASCADE"),
        primary_key=True,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    extracted_values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<TabularReviewRow review={self.review_id} doc={self.document_id}>"
