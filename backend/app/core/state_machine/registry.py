"""State machine definition registry.

Modules declare their state-machine shape by calling
``register_definition``. The runtime stores the definition in
``state_machine_definitions``, keyed by
``(module_id, definition_key, version)``. Definitions are versioned;
instances record their definition version so the runtime can resolve
the right transition set even after a module ships a newer definition.

Definition validation happens at register time:

- ``initial_state`` must be in ``states``
- every ``terminal_state`` must be in ``states``
- every transition's ``from`` and ``to`` must be in ``states``
- transition shape must be ``{"from": str, "to": str, "gates": [str],
  "required_capabilities": [str]}`` (gates and required_capabilities
  default to empty lists if omitted)

Per docs/architecture/STATE_MACHINE_PRIMITIVE.md.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StateMachineDefinition


class InvalidDefinitionError(ValueError):
    """Raised when a definition fails structural validation at register
    time. The runtime never persists an invalid definition; the caller
    must fix the shape and retry."""


class DefinitionNotFoundError(LookupError):
    """Raised when ``load_definition`` cannot find the requested
    definition. Distinct from ``InvalidDefinitionError`` so callers can
    differentiate "you asked for a thing that does not exist" from
    "you asked to register a thing that does not pass validation"."""


def _validate_definition(
    *,
    states: list[str],
    initial_state: str,
    terminal_states: list[str],
    transitions: list[dict],
) -> list[dict]:
    """Validate the structural correctness of a definition payload.

    Returns the normalised transitions list (with ``gates`` and
    ``required_capabilities`` defaulted to empty lists where absent).

    Raises ``InvalidDefinitionError`` on any structural violation.
    """
    if not isinstance(states, list) or not states:
        raise InvalidDefinitionError("`states` must be a non-empty list")
    if not all(isinstance(s, str) and s for s in states):
        raise InvalidDefinitionError("every state must be a non-empty string")
    states_set = set(states)
    if len(states_set) != len(states):
        raise InvalidDefinitionError("duplicate state names in `states`")

    if not isinstance(initial_state, str) or initial_state not in states_set:
        raise InvalidDefinitionError(
            f"`initial_state` {initial_state!r} must be a member of `states`"
        )

    if not isinstance(terminal_states, list):
        raise InvalidDefinitionError("`terminal_states` must be a list")
    for terminal in terminal_states:
        if terminal not in states_set:
            raise InvalidDefinitionError(
                f"terminal state {terminal!r} must be a member of `states`"
            )

    if not isinstance(transitions, list):
        raise InvalidDefinitionError("`transitions` must be a list")

    normalised: list[dict] = []
    for idx, raw in enumerate(transitions):
        if not isinstance(raw, dict):
            raise InvalidDefinitionError(
                f"transition #{idx} must be a dict, got {type(raw).__name__}"
            )
        from_state = raw.get("from")
        to_state = raw.get("to")
        if from_state not in states_set:
            raise InvalidDefinitionError(
                f"transition #{idx}.from {from_state!r} not in `states`"
            )
        if to_state not in states_set:
            raise InvalidDefinitionError(
                f"transition #{idx}.to {to_state!r} not in `states`"
            )
        # Terminal states cannot be the `from` of a transition — that
        # would let an instance leave a terminal state.
        if from_state in set(terminal_states):
            raise InvalidDefinitionError(
                f"transition #{idx}.from {from_state!r} is a terminal state; "
                "terminal states cannot be the source of a transition"
            )
        gates = raw.get("gates", [])
        if not isinstance(gates, list) or not all(isinstance(g, str) for g in gates):
            raise InvalidDefinitionError(
                f"transition #{idx}.gates must be a list of strings"
            )
        required_caps = raw.get("required_capabilities", [])
        if not isinstance(required_caps, list) or not all(
            isinstance(c, str) for c in required_caps
        ):
            raise InvalidDefinitionError(
                f"transition #{idx}.required_capabilities must be a list of strings"
            )
        normalised.append(
            {
                "from": from_state,
                "to": to_state,
                "gates": gates,
                "required_capabilities": required_caps,
            }
        )
    return normalised


async def register_definition(
    session: AsyncSession,
    *,
    module_id: str,
    definition_key: str,
    version: str,
    states: list[str],
    initial_state: str,
    terminal_states: list[str] | None = None,
    transitions: list[dict] | None = None,
) -> StateMachineDefinition:
    """Register a new definition version.

    Idempotent on ``(module_id, definition_key, version)``: if a row
    already exists with the same triple, that row is returned unchanged
    (no UPDATE). Re-registering with the same triple but different
    contents is currently silently ignored — modules should bump the
    version when the shape changes.

    Raises ``InvalidDefinitionError`` on structural validation failure.
    """
    normalised_transitions = _validate_definition(
        states=states,
        initial_state=initial_state,
        terminal_states=terminal_states or [],
        transitions=transitions or [],
    )

    existing = await session.scalar(
        select(StateMachineDefinition).where(
            StateMachineDefinition.module_id == module_id,
            StateMachineDefinition.definition_key == definition_key,
            StateMachineDefinition.version == version,
        )
    )
    if existing is not None:
        return existing

    definition = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id=module_id,
        definition_key=definition_key,
        version=version,
        states=states,
        initial_state=initial_state,
        terminal_states=terminal_states or [],
        transitions=normalised_transitions,
    )
    session.add(definition)
    await session.flush()
    return definition


async def load_definition(
    session: AsyncSession,
    *,
    definition_id: uuid.UUID | None = None,
    module_id: str | None = None,
    definition_key: str | None = None,
    version: str | None = None,
) -> StateMachineDefinition:
    """Load a definition by id or by ``(module_id, definition_key,
    version)`` tuple. Raises ``DefinitionNotFoundError`` if not found.

    Exactly one of ``definition_id`` or the tuple must be supplied.
    """
    if definition_id is not None:
        row = await session.scalar(
            select(StateMachineDefinition).where(
                StateMachineDefinition.id == definition_id
            )
        )
        if row is None:
            raise DefinitionNotFoundError(
                f"definition id={definition_id} not found"
            )
        return row

    if not (module_id and definition_key and version):
        raise ValueError(
            "either definition_id or (module_id, definition_key, version) "
            "must be supplied"
        )
    row = await session.scalar(
        select(StateMachineDefinition).where(
            StateMachineDefinition.module_id == module_id,
            StateMachineDefinition.definition_key == definition_key,
            StateMachineDefinition.version == version,
        )
    )
    if row is None:
        raise DefinitionNotFoundError(
            f"definition {module_id}/{definition_key}@{version} not found"
        )
    return row


async def list_definitions(
    session: AsyncSession,
    *,
    module_id: str | None = None,
    definition_key: str | None = None,
) -> list[StateMachineDefinition]:
    """List definitions, optionally filtered by module or
    ``(module, key)``. Returns all matching rows ordered by created_at."""
    stmt = select(StateMachineDefinition).order_by(
        StateMachineDefinition.created_at
    )
    if module_id is not None:
        stmt = stmt.where(StateMachineDefinition.module_id == module_id)
    if definition_key is not None:
        stmt = stmt.where(StateMachineDefinition.definition_key == definition_key)
    rows = await session.scalars(stmt)
    return list(rows.all())


def find_transition(
    definition: StateMachineDefinition, *, from_state: str, to_state: str
) -> dict[str, Any] | None:
    """Return the transition dict for ``(from_state, to_state)`` on the
    definition, or None if no such transition is declared."""
    for transition in definition.transitions:
        if transition["from"] == from_state and transition["to"] == to_state:
            return transition
    return None


def available_transitions(
    definition: StateMachineDefinition, *, current_state: str
) -> list[dict[str, Any]]:
    """Return all transitions whose ``from`` matches ``current_state``."""
    return [t for t in definition.transitions if t["from"] == current_state]
