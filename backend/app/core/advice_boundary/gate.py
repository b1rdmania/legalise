"""Advice boundary gate — the callable invoked per output to decide
whether the requested advice tier is allowed for this actor, transition,
and declared-tier ceiling.

Per docs/architecture/ADVICE_BOUNDARY.md §Gate API Surface.

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
    initial_tier_is_permitted,
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


def _blocked_to_decision_gate_state(blocked: BlockedPayload) -> dict[str, Any]:
    """Flatten a ``BlockedPayload`` into the shape the decision row's
    ``gate_state`` JSONB column expects.

    The audit row uses the canonical nested ``BlockedPayload.to_dict()``
    shape (so audit reconstruction can detect blocked rows by
    the top-level ``status`` key). The decision row's ``gate_state``
    column is the gate's *execution* state, not a wrapped audit
    payload, so the BlockedPayload's inner ``gate_state`` dict is
    flattened into the top level here.

    Result shape::

        {
            "status": "blocked",
            "blocked_reason": "<reason>",
            "denied_capability": "<cap>",      # if applicable
            # ... merged from BlockedPayload.gate_state ...
            "actor_role": ...,
            "required": [...],
            ...
        }
    """
    out: dict[str, Any] = {
        "status": "blocked",
        "blocked_reason": blocked.blocked_reason.value,
    }
    if blocked.denied_capability is not None:
        out["denied_capability"] = blocked.denied_capability
    if blocked.gate_state:
        out.update(blocked.gate_state)
    return out


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
    matter_id: uuid.UUID | None = None,
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
            gate_state=_blocked_to_decision_gate_state(blocked),
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
                gate_state=_blocked_to_decision_gate_state(blocked),
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
        # Initial-tier case — Reviewer P1#1 round 2: cap at draft_advice.
        # supervised_legal_advice and approved_final_advice cannot be
        # set as initial tier; they require a transition path through
        # prior tiers. This closes the supervision-bypass path where a
        # caller with workspace_admin role could direct-create an
        # approved final advice with no supervised history.
        if not initial_tier_is_permitted(requested_tier):
            blocked = BlockedPayload(
                blocked_reason=BlockedReason.INVALID_TRANSITION,
                gate_state={
                    "to_tier": requested_tier,
                    "reason": "tier_not_permitted_as_initial",
                    "max_initial_tier": "draft_advice",
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
                gate_state=_blocked_to_decision_gate_state(blocked),
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
        role_requirement = INITIAL_TIER_ROLE_REQUIREMENTS[requested_tier]

    # Role check. When firm role gates are dormant
    # (LEGALISE_FIRM_ROLE_GATES_ENABLED=false, the default for
    # local/hosted/eval), the firm role hierarchy is not enforced —
    # any authenticated actor satisfies the tier role requirement.
    # The substrate/tier vocabulary is unchanged; only enforcement
    # toggles. (Note: the default demo flow doesn't escalate into the
    # qualified_solicitor tiers, so this rarely fires either way — but
    # the flag must govern ALL firm-role enforcement, not just posture.)
    from app.core.config import settings

    role_ok = (not settings.firm_role_gates_enabled) or role_satisfies(
        actor_role=actor_role, requirement_set=role_requirement
    )
    if not role_ok:
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
            gate_state=_blocked_to_decision_gate_state(blocked),
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

    # declared_tier_max enforcement (manifest-driven, but honoured
    # when supplied directly via the API).
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
                gate_state=_blocked_to_decision_gate_state(blocked),
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
        # Null declared_tier_max — allowed but logged.
        pass

    # All checks passed.
    # Reconstruction filters advice_boundary_decisions by
    # ``gate_state->>'matter_id'`` — so when a caller supplies
    # matter_id, inject it into the gate_state JSONB so the row
    # shows up in the matter's timeline.
    success_gate_state: dict[str, Any] = {
        "allowed": True,
        "declared_tier_max_supplied": declared_tier_max is not None,
    }
    if matter_id is not None:
        success_gate_state["matter_id"] = str(matter_id)
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
        gate_state=success_gate_state,
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
