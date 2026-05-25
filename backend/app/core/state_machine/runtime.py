"""State machine runtime — instance lifecycle + transition execution.

The runtime owns:

- creating instances bound to ``(owner_scope, owner_id)``
- validating transition requests against the definition's allowed
  transition set
- enforcing per-transition required capabilities (using
  ``check_or_block`` from ``app.core.phase1_runtime`` so denials emit
  the canonical dual-audit pattern)
- executing per-transition gates (registered via ``register_gate``)
- updating ``instance.current_state`` on successful transitions
- appending the transition row with the final status
- emitting the canonical Phase 1 audit event for every outcome
  (completed, blocked, failed)

The runtime fails closed: any unexpected exception inside the request
flow results in a ``failed`` transition row + ``state_machine.transition.failed``
audit row before the exception propagates.

Per docs/architecture/STATE_MACHINE_PRIMITIVE.md.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.phase1_runtime import (
    BlockedPayload,
    BlockedReason,
    Phase1Blocked,
    Phase1Failed,
    audit_phase1,
    check_or_block,
)
from app.core.state_machine.registry import (
    DefinitionNotFoundError,
    available_transitions,
    find_transition,
    load_definition,
)
from app.models import (
    StateMachineDefinition,
    StateMachineInstance,
    StateMachineTransition,
    TRANSITION_STATUS_BLOCKED,
    TRANSITION_STATUS_COMPLETED,
    TRANSITION_STATUS_FAILED,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class InstanceNotFoundError(LookupError):
    """Raised when the requested instance does not exist."""


# ---------------------------------------------------------------------------
# Gate registry
# ---------------------------------------------------------------------------


# Gate handler signature: receives the session, instance, transition dict,
# and request context; returns a dict to merge into `gate_state` on the
# transition row; raises ``Phase1Blocked`` (with
# ``BlockedReason.GATE_BLOCKED``) to block the transition.
GateHandler = Callable[
    [AsyncSession, StateMachineInstance, dict, dict],
    Awaitable[dict[str, Any]],
]

_GATE_HANDLERS: dict[str, GateHandler] = {}


def register_gate(gate_id: str, handler: GateHandler) -> None:
    """Register a gate handler. Reference modules call this to plug in
    domain-specific gates (privilege posture, supervisor approval,
    advice-boundary, etc.).

    Re-registering an existing gate id replaces the handler — intentional
    so dev-mode hot reload and test fixtures can swap implementations
    without restarting the runtime.
    """
    _GATE_HANDLERS[gate_id] = handler


def unregister_gate(gate_id: str) -> None:
    """Remove a registered gate. Primarily for tests; production code
    should not need this."""
    _GATE_HANDLERS.pop(gate_id, None)


async def _noop_gate(
    session: AsyncSession,
    instance: StateMachineInstance,
    transition_def: dict,
    request_context: dict,
) -> dict[str, Any]:
    """Built-in gate that always allows. Useful as a placeholder so a
    definition can declare gates by id before the real handler ships."""
    return {"gate": "noop", "allowed": True}


# Register the built-in `noop` gate at module import so definitions can
# reference it from day one without an explicit register_gate call.
register_gate("noop", _noop_gate)


# ---------------------------------------------------------------------------
# Instance creation
# ---------------------------------------------------------------------------


async def create_instance(
    session: AsyncSession,
    *,
    definition_id: uuid.UUID | None = None,
    module_id: str | None = None,
    definition_key: str | None = None,
    version: str | None = None,
    owner_scope: str,
    owner_id: str,
    actor_id: uuid.UUID | None = None,
) -> StateMachineInstance:
    """Create a new state-machine instance against the named definition.

    Either ``definition_id`` or the tuple
    ``(module_id, definition_key, version)`` must be supplied. The
    instance's ``current_state`` is set to the definition's
    ``initial_state``; ``definition_version`` is denormalised so the
    runtime can resolve the right transition set later even after the
    module ships a newer definition.

    Emits ``state_machine.instance.created`` audit row.

    Raises ``DefinitionNotFoundError`` if the named definition does not
    exist. The caller does not commit on its behalf — caller commits.
    """
    definition = await load_definition(
        session,
        definition_id=definition_id,
        module_id=module_id,
        definition_key=definition_key,
        version=version,
    )

    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=definition.id,
        definition_version=definition.version,
        owner_scope=owner_scope,
        owner_id=owner_id,
        current_state=definition.initial_state,
    )
    session.add(instance)
    await session.flush()

    await audit_phase1(
        session,
        action="state_machine.instance.created",
        primitive="state_machine",
        actor_id=actor_id,
        module_id=definition.module_id,
        resource_type="state_machine_instance",
        resource_id=str(instance.id),
        payload={
            "definition_id": str(definition.id),
            "definition_module_id": definition.module_id,
            "definition_key": definition.definition_key,
            "definition_version": definition.version,
            "owner_scope": owner_scope,
            "owner_id": owner_id,
            "initial_state": definition.initial_state,
        },
    )
    return instance


# ---------------------------------------------------------------------------
# Transition execution
# ---------------------------------------------------------------------------


async def _append_transition(
    session: AsyncSession,
    *,
    instance: StateMachineInstance,
    to_state: str,
    actor_id: uuid.UUID | None,
    module_id: str | None,
    capability_id: str | None,
    reason: str | None,
    extra_metadata: dict | None,
    gate_state: dict,
    status: str,
) -> StateMachineTransition:
    """Append a transition row. Always called once per transition
    request — never updates an existing row (WORM)."""
    row = StateMachineTransition(
        id=uuid.uuid4(),
        instance_id=instance.id,
        from_state=instance.current_state,
        to_state=to_state,
        actor_id=actor_id,
        module_id=module_id,
        capability_id=capability_id,
        reason=reason,
        extra_metadata=extra_metadata or {},
        gate_state=gate_state,
        status=status,
    )
    session.add(row)
    await session.flush()
    return row


async def _emit_outcome_audit(
    session: AsyncSession,
    *,
    action: str,
    instance: StateMachineInstance,
    transition_row: StateMachineTransition,
    actor_id: uuid.UUID | None,
    module_id: str | None,
    capability_id: str | None,
    blocked: BlockedPayload | None = None,
    extra_payload: dict | None = None,
) -> None:
    """Emit the canonical Phase 1 audit row for a transition outcome."""
    payload: dict[str, Any] = {
        "instance_id": str(instance.id),
        "transition_id": str(transition_row.id),
        "from_state": transition_row.from_state,
        "to_state": transition_row.to_state,
        "definition_id": str(instance.definition_id),
        "definition_version": instance.definition_version,
    }
    if extra_payload:
        payload.update(extra_payload)
    await audit_phase1(
        session,
        action=action,
        primitive="state_machine",
        actor_id=actor_id,
        module_id=module_id,
        capability_id=capability_id,
        resource_type="state_machine_transition",
        resource_id=str(transition_row.id),
        payload=payload,
        blocked=blocked,
    )


async def request_transition(
    session: AsyncSession,
    *,
    instance_id: uuid.UUID,
    to_state: str,
    user_id: uuid.UUID | None,
    actor_id: uuid.UUID | None = None,
    module_id: str | None = None,
    reason: str | None = None,
    extra_metadata: dict | None = None,
) -> tuple[StateMachineTransition, StateMachineInstance]:
    """Request a transition on the given instance.

    Flow per ``STATE_MACHINE_PRIMITIVE.md`` §Transition Semantics:

    1. Load instance + definition.
    2. Verify ``(current_state → to_state)`` is in the definition's
       transition set. If not: append blocked row
       (``invalid_transition``), emit blocked audit, raise
       ``Phase1Blocked``.
    3. Verify caller holds every ``required_capability`` on the
       transition. If not: append blocked row (``capability_denied``)
       via ``check_or_block`` which writes the dual-audit rows, raise
       ``Phase1Blocked``.
    4. Run every gate declared on the transition. If any gate raises
       ``Phase1Blocked``: append blocked row (``gate_blocked``), emit
       blocked audit, re-raise.
    5. Append a completed row, update ``instance.current_state``, emit
       ``state_machine.transition.completed`` audit.

    Returns ``(transition_row, updated_instance)`` on success.

    On any unexpected exception, appends a ``failed`` row + emits
    ``state_machine.transition.failed`` audit + raises ``Phase1Failed``.

    Caller does not commit on the runtime's behalf — the caller commits.
    """
    if actor_id is None:
        actor_id = user_id

    extra_payload = {"reason": reason} if reason else {}
    instance = await session.scalar(
        select(StateMachineInstance).where(
            StateMachineInstance.id == instance_id
        )
    )
    if instance is None:
        raise InstanceNotFoundError(f"instance id={instance_id} not found")

    try:
        definition = await load_definition(
            session, definition_id=instance.definition_id
        )
    except DefinitionNotFoundError as exc:
        # The instance references a definition that no longer exists.
        # This is a system condition, not a block.
        transition_row = await _append_transition(
            session,
            instance=instance,
            to_state=to_state,
            actor_id=actor_id,
            module_id=module_id,
            capability_id=None,
            reason=reason,
            extra_metadata=extra_metadata,
            gate_state={
                "error": "definition_not_found",
                "detail": str(exc),
            },
            status=TRANSITION_STATUS_FAILED,
        )
        await _emit_outcome_audit(
            session,
            action="state_machine.transition.failed",
            instance=instance,
            transition_row=transition_row,
            actor_id=actor_id,
            module_id=module_id,
            capability_id=None,
            extra_payload={"error": "definition_not_found"},
        )
        raise Phase1Failed(str(exc), cause=exc)

    # 2. Validate transition exists.
    transition_def = find_transition(
        definition, from_state=instance.current_state, to_state=to_state
    )
    if transition_def is None:
        blocked = BlockedPayload(
            blocked_reason=BlockedReason.INVALID_TRANSITION,
            gate_state={
                "from_state": instance.current_state,
                "to_state": to_state,
                "definition_id": str(definition.id),
            },
        )
        transition_row = await _append_transition(
            session,
            instance=instance,
            to_state=to_state,
            actor_id=actor_id,
            module_id=module_id,
            capability_id=None,
            reason=reason,
            extra_metadata=extra_metadata,
            gate_state=blocked.to_dict(),
            status=TRANSITION_STATUS_BLOCKED,
        )
        await _emit_outcome_audit(
            session,
            action="state_machine.transition.blocked",
            instance=instance,
            transition_row=transition_row,
            actor_id=actor_id,
            module_id=module_id,
            capability_id=None,
            blocked=blocked,
            extra_payload=extra_payload,
        )
        raise Phase1Blocked(blocked)

    # 3. Capability checks. check_or_block writes the dual-audit on
    # denial and raises Phase1Blocked. We catch to ALSO append a
    # transition row with blocked status so the state-machine history
    # is consistent (every transition request appends a row).
    required_caps: list[str] = transition_def.get("required_capabilities", [])
    for capability in required_caps:
        if user_id is None:
            # No user context but the transition demands a capability.
            blocked = BlockedPayload(
                blocked_reason=BlockedReason.CAPABILITY_DENIED,
                denied_capability=capability,
            )
            transition_row = await _append_transition(
                session,
                instance=instance,
                to_state=to_state,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=capability,
                reason=reason,
                extra_metadata=extra_metadata,
                gate_state=blocked.to_dict(),
                status=TRANSITION_STATUS_BLOCKED,
            )
            await _emit_outcome_audit(
                session,
                action="state_machine.transition.blocked",
                instance=instance,
                transition_row=transition_row,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=capability,
                blocked=blocked,
                extra_payload=extra_payload,
            )
            raise Phase1Blocked(blocked)
        try:
            await check_or_block(
                session,
                user_id=user_id,
                capability=capability,
                primitive="state_machine",
                block_action="state_machine.transition.blocked",
                actor_id=actor_id,
                resource_type="state_machine_transition",
                resource_id=str(instance.id),
            )
        except Phase1Blocked as exc:
            # check_or_block has already written the dual audit rows
            # (legacy module.capability.denied + Phase 1 *.blocked).
            # Append the transition row so the state-machine history is
            # consistent. The append is in-session and survives the
            # caller's eventual commit.
            transition_row = await _append_transition(
                session,
                instance=instance,
                to_state=to_state,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=capability,
                reason=reason,
                extra_metadata=extra_metadata,
                gate_state=exc.payload.to_dict(),
                status=TRANSITION_STATUS_BLOCKED,
            )
            raise

    # 4. Run gates.
    gate_state_accumulated: dict[str, Any] = {}
    gate_ids: list[str] = transition_def.get("gates", [])
    for gate_id in gate_ids:
        handler = _GATE_HANDLERS.get(gate_id)
        if handler is None:
            # Unknown gate — fail closed.
            blocked = BlockedPayload(
                blocked_reason=BlockedReason.GATE_BLOCKED,
                gate_state={
                    "gate": gate_id,
                    "error": "gate_not_registered",
                },
            )
            transition_row = await _append_transition(
                session,
                instance=instance,
                to_state=to_state,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=None,
                reason=reason,
                extra_metadata=extra_metadata,
                gate_state=blocked.to_dict(),
                status=TRANSITION_STATUS_BLOCKED,
            )
            await _emit_outcome_audit(
                session,
                action="state_machine.transition.blocked",
                instance=instance,
                transition_row=transition_row,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=None,
                blocked=blocked,
                extra_payload=extra_payload,
            )
            raise Phase1Blocked(blocked)
        try:
            request_context = {
                "actor_id": actor_id,
                "user_id": user_id,
                "module_id": module_id,
                "reason": reason,
                "extra_metadata": extra_metadata or {},
            }
            gate_result = await handler(
                session, instance, transition_def, request_context
            )
            gate_state_accumulated[gate_id] = gate_result or {}
        except Phase1Blocked as exc:
            # Gate-level block. Append blocked row + emit audit.
            transition_row = await _append_transition(
                session,
                instance=instance,
                to_state=to_state,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=None,
                reason=reason,
                extra_metadata=extra_metadata,
                gate_state=exc.payload.to_dict(),
                status=TRANSITION_STATUS_BLOCKED,
            )
            await _emit_outcome_audit(
                session,
                action="state_machine.transition.blocked",
                instance=instance,
                transition_row=transition_row,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=None,
                blocked=exc.payload,
                extra_payload=extra_payload,
            )
            raise
        except Exception as exc:
            # Unexpected gate handler failure — system error.
            transition_row = await _append_transition(
                session,
                instance=instance,
                to_state=to_state,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=None,
                reason=reason,
                extra_metadata=extra_metadata,
                gate_state={
                    "error": "gate_handler_failed",
                    "gate": gate_id,
                    "detail": str(exc),
                },
                status=TRANSITION_STATUS_FAILED,
            )
            await _emit_outcome_audit(
                session,
                action="state_machine.transition.failed",
                instance=instance,
                transition_row=transition_row,
                actor_id=actor_id,
                module_id=module_id,
                capability_id=None,
                extra_payload={"error": "gate_handler_failed", "gate": gate_id},
            )
            raise Phase1Failed(
                f"gate {gate_id!r} handler raised: {exc}", cause=exc
            )

    # 5. Success — append completed row and update instance state.
    transition_row = await _append_transition(
        session,
        instance=instance,
        to_state=to_state,
        actor_id=actor_id,
        module_id=module_id,
        capability_id=None,
        reason=reason,
        extra_metadata=extra_metadata,
        gate_state=gate_state_accumulated,
        status=TRANSITION_STATUS_COMPLETED,
    )
    instance.current_state = to_state
    instance.updated_at = datetime.now(UTC)
    session.add(instance)
    await session.flush()

    await _emit_outcome_audit(
        session,
        action="state_machine.transition.completed",
        instance=instance,
        transition_row=transition_row,
        actor_id=actor_id,
        module_id=module_id,
        capability_id=None,
        extra_payload=extra_payload,
    )
    return transition_row, instance


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def read_instance(
    session: AsyncSession,
    *,
    instance_id: uuid.UUID,
) -> dict[str, Any]:
    """Return the instance, its definition, available next transitions
    from current state, and recent history.

    Shape:

        {
          "instance": StateMachineInstance,
          "definition": StateMachineDefinition,
          "available_transitions": [transition dict, ...],
          "history": [StateMachineTransition, ...],
        }
    """
    instance = await session.scalar(
        select(StateMachineInstance).where(
            StateMachineInstance.id == instance_id
        )
    )
    if instance is None:
        raise InstanceNotFoundError(f"instance id={instance_id} not found")

    definition = await load_definition(
        session, definition_id=instance.definition_id
    )
    history = await read_history(session, instance_id=instance_id)
    return {
        "instance": instance,
        "definition": definition,
        "available_transitions": available_transitions(
            definition, current_state=instance.current_state
        ),
        "history": history,
    }


async def read_history(
    session: AsyncSession,
    *,
    instance_id: uuid.UUID,
    limit: int = 100,
) -> list[StateMachineTransition]:
    """Return transition history for the instance, newest first."""
    rows = await session.scalars(
        select(StateMachineTransition)
        .where(StateMachineTransition.instance_id == instance_id)
        .order_by(StateMachineTransition.occurred_at.desc())
        .limit(limit)
    )
    return list(rows.all())
