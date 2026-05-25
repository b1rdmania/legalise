"""AuditEntry model — the matter's provenance log.

Every API call touching a matter, every model invocation, every privilege
change, every plugin call writes one row.

WORM enforcement (migration 0011):
- A Postgres trigger (``enforce_audit_worm``) blocks UPDATE and DELETE at the
  DB layer, independent of application code.
- Role-level REVOKE (legalise_app role) is documented in 0011_audit_worm.py as
  a v0.6 ops follow-up for stacks that have completed the role split.

Do NOT add UPDATE or DELETE paths to this model. The trigger will reject them
and surface as a 500 in production.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Integer, BigInteger, CHAR
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditEntry(Base):
    __tablename__ = "audit_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    matter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("matters.id"), nullable=True, index=True)

    action: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    # `module` namespaces the action for the matter audit log UI
    # (e.g. "document_edit", "pre_motion", "letters"). Nullable for legacy rows.
    module: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Model-call provenance (nullable; only present on `model.call` rows)
    model_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    response_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Phase 5 — first-class cost metadata for ``model.invoked`` rows.
    # Populated by ``core.audit_cost.audit_emit_model_invoked``; left
    # NULL for non-cost rows. Currency in ISO 4217. Cost is integer
    # micros (1 GBP = 100_000_000 micros) so sub-penny calls do not
    # silently round. Check constraint at migration 0017 enforces
    # ``(cost_micros NULL) = (currency NULL)`` — they move together.
    tokens_in: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cost_micros: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str | None] = mapped_column(CHAR(3), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Free-form payload (request shape, params, etc.)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    def __repr__(self) -> str:
        return f"<AuditEntry {self.timestamp.isoformat()} {self.action}>"
