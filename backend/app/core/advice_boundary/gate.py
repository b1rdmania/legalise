"""Advice boundary gate — the callable Phase 1 invokes per output.

Per docs/architecture/ADVICE_BOUNDARY.md §Gate API Surface.

Phase 1 scope: callable gate API + REST endpoint. Manifest-driven
enforcement (reading ``advice_tier_max`` from the manifest and
auto-injecting the check at the capability boundary) lands in Phase 2.

The gate writes one ``AdviceBoundaryDecision`` row per call regardless
of outcome (completed, blocked, denied, failed). Audit row emitted in
the same transaction.

Distinction between ``blocked`` and ``denied`` (load-bearing for SRA
framing per ADVICE_BOUNDARY.md):
- ``blocked`` — transition rule violated (e.g. trying to skip
  supervised; trying to transition out of approved_final_advice).
- ``denied`` — caller authority insufficient (wrong role; or tier
  exceeds the declared max).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary.tiers import (
    INITIAL_TIER_ROLE_REQUIREMENTS,
    ROLE_REQUIREMENTS,
    InvalidTierError,
    assert_tier,
    is_allowed_transition,
    is_terminal_tier,
    role_satisfies,
    tier_rank,
)
from app.core.phase1_runtime import (
    BlockedPayload,
    BlockedReason,
    audit_phase1,
)
from app.models import (
    AdviceBoundaryDecision,
    DECISION_STATUS_BLOCKED,
    DECISION_STATUS_COMPLETED,
    DECISION_STATUS_DENIED,
    DECISION_STATUS_FAILED,
)


async def _append_decision(
    session: AsyncSession,
    *,
    output_id: str,
    from_tier: str | None,
    to_tier: str,
    actor_user_id: uuid.UUID | None,
    actor_role: str | None,
    module_id: str | None,
    capability_id: str | None,
    declared_tier_max: str | None,
    gate_state: dict,
    status: str,
) -> AdviceBoundaryDecision:
    row = AdviceBoundaryDecision(
        id=uuid.uuid4(),
        output_id=output_id,
        from_tier=from_tier,
        to_tier=to_tier,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        module_id=module_id,
        capability_id=capability_id,
        declared_tier_max=declared_tier_max,
        gate_state=gate_state,
        status=status,
    )
    session.add(row)
    await session.flush()
    return row


async def _emit(
    session: AsyncSession,
    *,
    action: str,
    decision: AdviceBoundaryDecision,
    blocked: BlockedPayload | None = None,
) -> None:
    await audit_phase1(
        session,
        action=action,
        primitive="advice_boundary",
        actor_id=decision.actor_user_id,
        module_id=decision.module_id,
        capability_id=decision.capability_id,
        resource_type="advice_boundary_decision",
        resource_id=str(decision.id),
        payload={
            "output_id": decision.output_id,
            "from_tier": decision.from_tier,
            "to_tier": decision.to_tier,
            "actor_role": decision.actor_role,
            "declared_tier_max": decision.declared_tier_max,
        },
        blocked=blocked,
    )


async def check(
    session: AsyncSession,
    *,
    output_id: str,
    requested_tier: str,
    from_tier: str | None = None,
    declared_tier_max: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    actor_role: str | None = None,
    module_id: str | None = None,
    capability_id: str | None = None,
) -> dict[str, Any]:
    """Invoke the advice-boundary gate.

    Returns a dict shaped::

        {
            "allowed": bool,
            "decision_id": "<uuid str>",
            "gate_state": { ... },
        }

    Behaviour per ADVICE_BOUNDARY.md:

    1. ``requested_tier`` must be a canonical tier value (else
       ``failed``).
    2. ``from_tier`` is None for new outputs (initial-tier path) or a
       tier value for transitions. If ``from_tier`` is the terminal
       ``approved_final_advice``, the decision is ``blocked`` (no
       transition out of terminal).
    3. If ``from_tier`` is non-None, the ``(from_tier, requested_tier)``
       transition must be in the allowed set; else ``blocked`` with
       ``invalid_transition``.
    4. The actor's role must satisfy the role requirement for the
       transition (or initial-tier requirement); else ``denied`` with
       ``role_denied``.
    5. If ``declared_tier_max`` is supplied, ``requested_tier`` must
       not exceed it; else ``denied`` with ``tier_exceeded``.
    6. Otherwise ``completed`` — decision recorded, audit emitted.

    The gate does not commit. Caller commits.
    """
    # Validate tier vocabulary first.
    try:
        assert_tier(requested_tier)
        if from_tier is not None:
            assert_tier(from_tier)
        if declared_tier_max is not None:
            assert_tier(declared_tier_max)
    except InvalidTierError as exc:
        decision = await _append_decision(
            session,
            output_id=output_id,
            from_tier=from_tier,
            to_tier=requested_tier,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            module_id=module_id,
            capability_id=capability_id,
            declared_tier_max=declared_tier_max,
            gate_state={"error": "invalid_tier", "detail": str(exc)},
            status=DECISION_STATUS_FAILED,
        )
        await _emit(
            session,
            action="advice_boundary.check.failed",
            decision=decision,
        )
        return {
            "allowed": False,
            "decision_id": str(decision.id),
            "gate_state": decision.gate_state,
        }

    # Terminal source — no transition out of approved_final_advice.
    if from_tier is not None and is_terminal_tier(from_tier):
        blocked = BlockedPayload(
            blocked_reason=BlockedReason.TIER_DISALLOWED,
            gate_state={
                "from_tier": from_tier,
                "to_tier": requested_tier,
                "reason": "from_tier_is_terminal",
            },
        )
        decision = await _append_decision(
            session,
            output_id=output_id,
            from_tier=from_tier,
            to_tier=requested_tier,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            module_id=module_id,
            capability_id=capability_id,
            declared_tier_max=declared_tier_max,
            gate_state=blocked.to_dict(),
            status=DECISION_STATUS_BLOCKED,
        )
        await _emit(
            session,
            action="advice_boundary.check.blocked",
            decision=decision,
            blocked=blocked,
        )
        return {
            "allowed": False,
            "decision_id": str(decision.id),
            "gate_state": decision.gate_state,
        }

    # Transition rule check (skip for initial-tier setting where
    # from_tier is None).
    role_requirement: frozenset[str]
    if from_tier is not None:
        if not is_allowed_transition(from_tier, requested_tier):
            blocked = BlockedPayload(
                blocked_reason=BlockedReason.INVALID_TRANSITION,
                gate_state={
                    "from_tier": from_tier,
                    "to_tier": requested_tier,
                    "reason": "transition_not_allowed",
                },
            )
            decision = await _append_decision(
                session,
                output_id=output_id,
                from_tier=from_tier,
                to_tier=requested_tier,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                module_id=module_id,
                capability_id=capability_id,
                declared_tier_max=declared_tier_max,
                gate_state=blocked.to_dict(),
                status=DECISION_STATUS_BLOCKED,
            )
            await _emit(
                session,
                action="advice_boundary.check.blocked",
                decision=decision,
                blocked=blocked,
            )
            return {
                "allowed": False,
                "decision_id": str(decision.id),
                "gate_state": decision.gate_state,
            }
        role_requirement = ROLE_REQUIREMENTS[(from_tier, requested_tier)]
    else:
        # Initial-tier case.
        role_requirement = INITIAL_TIER_ROLE_REQUIREMENTS[requested_tier]

    # Role check.
    if not role_satisfies(actor_role=actor_role, requirement_set=role_requirement):
        blocked = BlockedPayload(
            blocked_reason=BlockedReason.ROLE_DENIED,
            gate_state={
                "actor_role": actor_role,
                "required": sorted(role_requirement),
                "from_tier": from_tier,
                "to_tier": requested_tier,
            },
        )
        decision = await _append_decision(
            session,
            output_id=output_id,
            from_tier=from_tier,
            to_tier=requested_tier,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            module_id=module_id,
            capability_id=capability_id,
            declared_tier_max=declared_tier_max,
            gate_state=blocked.to_dict(),
            status=DECISION_STATUS_DENIED,
        )
        await _emit(
            session,
            action="advice_boundary.check.denied",
            decision=decision,
            blocked=blocked,
        )
        return {
            "allowed": False,
            "decision_id": str(decision.id),
            "gate_state": decision.gate_state,
        }

    # declared_tier_max enforcement (Phase 2 manifest-driven, but
    # honoured when supplied directly in Phase 1).
    if declared_tier_max is not None:
        if tier_rank(requested_tier) > tier_rank(declared_tier_max):
            blocked = BlockedPayload(
                blocked_reason=BlockedReason.TIER_EXCEEDED,
                gate_state={
                    "requested_tier": requested_tier,
                    "declared_tier_max": declared_tier_max,
                    "reason": "requested_tier_exceeds_declared_max",
                },
            )
            decision = await _append_decision(
                session,
                output_id=output_id,
                from_tier=from_tier,
                to_tier=requested_tier,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                module_id=module_id,
                capability_id=capability_id,
                declared_tier_max=declared_tier_max,
                gate_state=blocked.to_dict(),
                status=DECISION_STATUS_DENIED,
            )
            await _emit(
                session,
                action="advice_boundary.check.denied",
                decision=decision,
                blocked=blocked,
            )
            return {
                "allowed": False,
                "decision_id": str(decision.id),
                "gate_state": decision.gate_state,
            }
    else:
        # Null declared_tier_max — Phase 1 mode. Allowed but logged.
        pass

    # All checks passed.
    decision = await _append_decision(
        session,
        output_id=output_id,
        from_tier=from_tier,
        to_tier=requested_tier,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        module_id=module_id,
        capability_id=capability_id,
        declared_tier_max=declared_tier_max,
        gate_state={"allowed": True, "declared_tier_max_supplied": declared_tier_max is not None},
        status=DECISION_STATUS_COMPLETED,
    )
    await _emit(
        session,
        action="advice_boundary.check.completed",
        decision=decision,
    )
    return {
        "allowed": True,
        "decision_id": str(decision.id),
        "gate_state": decision.gate_state,
    }
