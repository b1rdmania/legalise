"""StateMachineTransition — Phase 1 substrate primitive model.

A transition row records one requested change to an instance's state.
Rows are append-only: WORM-enforced via a Postgres trigger in migration
0012 (same pattern as `audit_entries` from migration 0011). Every
transition request appends a row regardless of outcome — successful
completions, capability denials, gate blocks, invalid transitions, and
system failures all leave provenance.

Status values (one row per transition request, terminal status only —
``requested`` is intentionally absent because the WORM trigger blocks
UPDATEs and an in-flight `requested→completed` two-step would be
illegal):

- ``completed`` — transition validated, instance state updated.
- ``blocked`` — non-system rejection (capability denied, gate blocked,
  invalid transition). The `gate_state` field carries the canonical
  ``BlockedPayload`` shape.
- ``failed`` — system error (DB write failure, programming bug). The
  `gate_state` field carries an error description.

The runtime appends the row at the end of the request, after all
validation and gate execution have settled on a final status. All
three statuses are committed in the same transaction as any related
instance.current_state update (only on completed) so partial state
is impossible.

Per docs/architecture/STATE_MACHINE_PRIMITIVE.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Status vocabulary for state_machine_transitions.status.
# `requested` is intentionally absent — see module docstring.
TRANSITION_STATUS_COMPLETED = "completed"
TRANSITION_STATUS_BLOCKED = "blocked"
TRANSITION_STATUS_FAILED = "failed"

TRANSITION_STATUS_VALUES = frozenset(
    {
        TRANSITION_STATUS_COMPLETED,
        TRANSITION_STATUS_BLOCKED,
        TRANSITION_STATUS_FAILED,
    }
)


class StateMachineTransition(Base):
    __tablename__ = "state_machine_transitions"
    __table_args__ = (
        Index(
            "ix_state_machine_transitions_instance_occurred",
            "instance_id",
            "occurred_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("state_machine_instances.id"),
        nullable=False,
    )

    from_state: Mapped[str] = mapped_column(String(64), nullable=False)
    to_state: Mapped[str] = mapped_column(String(64), nullable=False)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # The module + capability id under which this transition was attempted.
    # For substrate-direct transitions these are typically "core" and the
    # generic substrate capability; for reference-module-driven transitions
    # they carry the module's identity.
    module_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    capability_id: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Caller-supplied free-form reason (e.g. "Conflict check completed").
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Caller-supplied metadata bag. Named ``extra_metadata`` to avoid the
    # SQLAlchemy DeclarativeBase ``metadata`` attribute clash.
    extra_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Gate execution / blocked-payload carrier. On ``completed`` rows this
    # is the gate execution result (typically `{}` when no gates configured);
    # on ``blocked`` rows this is the canonical ``BlockedPayload.to_dict()``;
    # on ``failed`` rows this is `{"error": "<type>", "detail": "<message>"}`.
    gate_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # See module docstring for status semantics.
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<StateMachineTransition {self.id} "
            f"{self.from_state}->{self.to_state} [{self.status}]>"
        )
