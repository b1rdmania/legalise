"""MatterReview — Supervisor Review v1 substrate.

A human-review record over one matter artifact. Unlike
``matter_artifacts`` / ``audit_entries`` / ``advice_boundary_decisions``
(which are WORM, append-only), this row is **mutable current-state**:
it starts ``pending`` and transitions once to a terminal decision. The
*immutable* history of the review lives in the ``review.*`` audit rows
emitted on each transition — the row tells the app the current state;
the audit trail is the record. A re-review is a new row, so the row
table is also append-only at the row level.

Decisions (terminal): approved / rejected / changes_requested /
overridden. ``overridden`` is approve-despite-a-flag with a mandatory
note — the explicit, audited supervised-autonomy escape hatch.

Reviewer != author by default (segregation of review); a superuser may
override that, but the override is itself recorded in the audit row.

Per the SUPERVISOR_REVIEW_V1_PLAN plan (repo history).
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# State vocabulary (ordered: pending, then the four terminal decisions).
REVIEW_PENDING = "pending"
REVIEW_APPROVED = "approved"
REVIEW_REJECTED = "rejected"
REVIEW_CHANGES_REQUESTED = "changes_requested"
REVIEW_OVERRIDDEN = "overridden"

REVIEW_TERMINAL_STATES = frozenset(
    {
        REVIEW_APPROVED,
        REVIEW_REJECTED,
        REVIEW_CHANGES_REQUESTED,
        REVIEW_OVERRIDDEN,
    }
)

REVIEW_STATE_VALUES = frozenset({REVIEW_PENDING} | REVIEW_TERMINAL_STATES)

# Artifact kinds eligible for supervisor review. The Contract Review
# findings pack plus prompt-runtime skill output — imported Lawve skills
# produce `skill_response`, and their output must be reviewable for the
# supervised-autonomy loop to apply equally to marketplace skills, not
# just first-party modules. `chat_draft` is an assistant reply saved as
# a draft output from the chat surface — same loop, same reviewability.
REVIEW_ELIGIBLE_KINDS = frozenset({"findings_pack", "skill_response", "chat_draft"})


class MatterReview(Base):
    __tablename__ = "matter_reviews"
    __table_args__ = (
        Index("ix_matter_reviews_matter_requested", "matter_id", "requested_at"),
        Index("ix_matter_reviews_artifact", "artifact_id"),
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
    # Provenance snapshot — pins what was reviewed even if the artifact
    # row is later joined differently.
    invocation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    module_id: Mapped[str] = mapped_column(String(128), nullable=False)
    capability_id: Mapped[str] = mapped_column(String(256), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)

    # sha256 of the artifact payload bytes, computed at request time.
    # Approval drifts if the underlying output changes; the hash pins
    # exactly what the reviewer decided on.
    artifact_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    state: Mapped[str] = mapped_column(
        String(32), nullable=False, default=REVIEW_PENDING
    )

    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<MatterReview {self.id} {self.kind} [{self.state}]>"
