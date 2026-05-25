"""AdviceBoundaryDecision — Phase 1 substrate primitive model.

Every call to ``core.advice_boundary.check`` writes one row. The table
is append-only — WORM-enforced via Postgres trigger in migration 0014
(same pattern as ``audit_entries`` and ``state_machine_transitions``).

Status values (per docs/architecture/ADVICE_BOUNDARY.md, but note
``requested`` is intentionally absent from the runtime model because
WORM blocks UPDATE; one row per decision with the terminal status):

- ``completed`` — transition allowed, decision recorded
- ``blocked`` — transition not allowed by tier-transition rules
- ``denied`` — caller authority insufficient (wrong role, or tier
  exceeds the declared max). The blocked/denied distinction is
  load-bearing for SRA framing: blocked = rules violated;
  denied = authority insufficient.
- ``failed`` — system error

Per docs/architecture/ADVICE_BOUNDARY.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Tier vocabulary (canonical, ordered).
ADVICE_TIER_FACTUAL_EXTRACTION = "factual_extraction"
ADVICE_TIER_LEGAL_INFORMATION = "legal_information"
ADVICE_TIER_DRAFT_ADVICE = "draft_advice"
ADVICE_TIER_SUPERVISED_LEGAL_ADVICE = "supervised_legal_advice"
ADVICE_TIER_APPROVED_FINAL_ADVICE = "approved_final_advice"

ADVICE_TIER_VALUES = (
    ADVICE_TIER_FACTUAL_EXTRACTION,
    ADVICE_TIER_LEGAL_INFORMATION,
    ADVICE_TIER_DRAFT_ADVICE,
    ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
    ADVICE_TIER_APPROVED_FINAL_ADVICE,
)


# Status vocabulary. `requested` is absent — see module docstring.
DECISION_STATUS_COMPLETED = "completed"
DECISION_STATUS_BLOCKED = "blocked"
DECISION_STATUS_DENIED = "denied"
DECISION_STATUS_FAILED = "failed"

DECISION_STATUS_VALUES = frozenset(
    {
        DECISION_STATUS_COMPLETED,
        DECISION_STATUS_BLOCKED,
        DECISION_STATUS_DENIED,
        DECISION_STATUS_FAILED,
    }
)


class AdviceBoundaryDecision(Base):
    __tablename__ = "advice_boundary_decisions"
    __table_args__ = (
        Index(
            "ix_advice_boundary_decisions_output",
            "output_id",
            "decided_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # The output this decision applies to. Phase 1 stores as a free
    # string — no FK constraint because output identity comes from
    # whatever module produced it (a generated document id, an export
    # id, a redline-set id, etc.). Phase 7+ when output-lifecycle
    # reference module lands may add a typed FK.
    output_id: Mapped[str] = mapped_column(String(128), nullable=False)

    from_tier: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_tier: Mapped[str] = mapped_column(String(64), nullable=False)

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Role asserted at decision time. Phase 1 uses generic workspace
    # roles (``qualified_solicitor``, ``workspace_admin``, etc.) — Phase
    # 2 wires SRA roll verification.
    actor_role: Mapped[str | None] = mapped_column(String(64), nullable=True)

    module_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    capability_id: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # The capability's declared advice_tier_max (or None in Phase 1
    # when the gate is called directly — Phase 2 reads this from the
    # manifest).
    declared_tier_max: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Gate execution state / blocked-payload carrier.
    gate_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(16), nullable=False)

    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<AdviceBoundaryDecision {self.id} "
            f"{self.from_tier}->{self.to_tier} [{self.status}]>"
        )
