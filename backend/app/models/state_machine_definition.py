"""StateMachineDefinition — Phase 1 substrate primitive model.

A definition declares the shape of a state machine: its states, initial
state, terminal states, and the allowed transitions between states.
Definitions are versioned so a module can ship a new definition shape
without breaking running instances created against the previous version.

Per docs/architecture/STATE_MACHINE_PRIMITIVE.md.

Definitions are mostly-immutable: the runtime never updates the JSON
fields on an existing row. Modules ship a new version when the shape
changes; existing instances continue to operate against their original
version. There's no WORM trigger on this table (the registry is allowed
to soft-delete definitions in future if a module is uninstalled), but
new versions are written rather than the JSON being mutated in place.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StateMachineDefinition(Base):
    __tablename__ = "state_machine_definitions"
    __table_args__ = (
        UniqueConstraint(
            "module_id",
            "definition_key",
            "version",
            name="uq_state_machine_definitions_module_key_version",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Which module owns this definition. For substrate-internal definitions
    # this would be "core" (e.g. a noop reference definition); for reference
    # modules it would be the module id like "legalise-intake".
    module_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    # Module-scoped key. E.g. "default" for the standard flow or
    # "amicable_divorce" for a variant.
    definition_key: Mapped[str] = mapped_column(String(128), nullable=False)

    # Semver. Instances record the version they were created under so
    # subsequent definition updates do not break in-flight workflows.
    version: Mapped[str] = mapped_column(String(32), nullable=False)

    # The set of valid state strings for this definition.
    states: Mapped[list[str]] = mapped_column(JSONB, nullable=False)

    # The state every new instance starts in. Must be a member of `states`.
    initial_state: Mapped[str] = mapped_column(String(64), nullable=False)

    # Terminal states — instances in these states cannot transition further.
    # Must be a (possibly empty) subset of `states`.
    terminal_states: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    # The allowed transitions. Each entry is a dict shaped:
    #   {
    #     "from": "<state>",
    #     "to":   "<state>",
    #     "gates": ["<gate_id>", ...],          // optional, default []
    #     "required_capabilities": ["<cap>", ...] // optional, default []
    #   }
    # The runtime validates the structure on register_definition and
    # uses this field as the source of truth on every transition request.
    transitions: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.utcnow(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<StateMachineDefinition {self.module_id}/{self.definition_key}"
            f"@{self.version}>"
        )
