"""StateMachineInstance — substrate primitive model.

An instance is one running state machine bound to an `(owner_scope,
owner_id)` tuple. The owner could be a matter, a workspace, a prospect
record, or any future entity that wants to host a state machine — the
substrate stays agnostic.

Each instance carries the `definition_version` it was created under so
the runtime can load the right transitions even if the module has since
registered a newer definition version.

Per docs/architecture/STATE_MACHINE_PRIMITIVE.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Valid owner scopes. The substrate accepts any string; the constants
# below are the v0.2 vocabulary that reference modules use.
OWNER_SCOPE_MATTER = "matter"
OWNER_SCOPE_WORKSPACE = "workspace"
OWNER_SCOPE_PROSPECT = "prospect"


class StateMachineInstance(Base):
    __tablename__ = "state_machine_instances"
    __table_args__ = (
        Index("ix_state_machine_instances_owner", "owner_scope", "owner_id"),
        Index("ix_state_machine_instances_definition_id", "definition_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("state_machine_definitions.id"),
        nullable=False,
    )

    # Denormalised at create time so the runtime can locate the exact
    # definition version this instance is operating under without an
    # extra join. Definition rows are mostly-immutable but the version
    # field is the canonical "which transition set applies" answer.
    definition_version: Mapped[str] = mapped_column(String(32), nullable=False)

    # The thing this state machine is attached to. The substrate does
    # not enforce a foreign key on (owner_scope, owner_id) because the
    # owner table varies per scope; reference modules are responsible
    # for keeping the linkage live (e.g. matter-scoped instances should
    # be revoked when the matter is closed).
    owner_scope: Mapped[str] = mapped_column(String(32), nullable=False)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # The instance's current state. Updated by completed transitions.
    # Initial value matches the definition's `initial_state` at create
    # time.
    current_state: Mapped[str] = mapped_column(String(64), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<StateMachineInstance {self.id} "
            f"{self.owner_scope}/{self.owner_id} state={self.current_state}>"
        )
