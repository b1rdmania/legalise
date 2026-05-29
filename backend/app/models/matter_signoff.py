"""MatterSignoff — Professional Sign-Off v1 substrate.

The author sign-off gate: a solicitor records that they have reviewed an
AI-prepared work product and stand behind it (or do not). This is the
product's core moment — preparation becomes advice when a professional
puts their name on it.

Distinct from ``MatterReview`` (supervisor review, where reviewer ≠
author). Here the **author may sign their own** AI-assisted output — the
sole-practitioner / small-firm hero loop. No qualified-solicitor role
wall: every signed-in user is treated as professionally accountable and
signs *as themselves* ("Signed in Legalise by <email>"). Firm-mode role
gating stays dormant/configurable elsewhere.

Append-only: every sign-off is kept. Re-signing the same artifact (e.g.
after a reject, or a fresh look) inserts a new row; the *current* sign-off
is the latest by ``signed_at``. The row table is the record — the
``output.*`` audit rows emitted alongside are the immutable trail.

The ``artifact_hash`` pins the exact output payload that was signed
(canonical JSON of {artifact_id, kind, payload}), so a signature can never
silently come to mean something other than what the signer saw.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Decision vocabulary. Honest framing: "signed" = stands behind it as-is;
# "signed_with_observations" = signs and stands behind it, noting points
# they would change / that warrant attention (no in-app edit in v1);
# "rejected" = does not stand behind this draft.
SIGNOFF_SIGNED = "signed"
SIGNOFF_SIGNED_WITH_OBSERVATIONS = "signed_with_observations"
SIGNOFF_REJECTED = "rejected"

SIGNOFF_DECISIONS = frozenset(
    {SIGNOFF_SIGNED, SIGNOFF_SIGNED_WITH_OBSERVATIONS, SIGNOFF_REJECTED}
)

# Decisions that record the output as a signed/finalised work product
# (vs a rejection). Used to derive an artifact's "signed" status.
SIGNOFF_AFFIRMATIVE = frozenset(
    {SIGNOFF_SIGNED, SIGNOFF_SIGNED_WITH_OBSERVATIONS}
)

# Reasoning is mandatory when the signer qualifies or rejects — that
# reasoning is the professional-judgement artifact in the record.
SIGNOFF_REASONING_REQUIRED = frozenset(
    {SIGNOFF_SIGNED_WITH_OBSERVATIONS, SIGNOFF_REJECTED}
)


class MatterSignoff(Base):
    __tablename__ = "matter_signoffs"
    __table_args__ = (
        Index("ix_matter_signoffs_matter_signed", "matter_id", "signed_at"),
        Index("ix_matter_signoffs_artifact", "artifact_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id"), nullable=False
    )
    artifact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matter_artifacts.id"), nullable=False
    )
    # Provenance snapshot — pins what was signed even if joins change.
    invocation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    module_id: Mapped[str] = mapped_column(String(128), nullable=False)
    capability_id: Mapped[str] = mapped_column(String(256), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)

    # sha256 (hex) of canonical JSON {artifact_id, kind, payload}.
    artifact_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    # Required for signed_with_observations / rejected; optional for signed.
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    signer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<MatterSignoff {self.id} {self.kind} [{self.decision}]>"
