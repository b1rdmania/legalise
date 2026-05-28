"""Phase 8 — posture-aware gate.

Matter ``privilege_posture`` is recorded by the substrate today (it
lives on the ``Matter`` row, and Phase 6 captures it in
reconstruction provenance) but does NOT actively gate anything.
Phase 8 makes it policy.

The policy table is the entire decision. It lives here as a
constant dict so a change is a reviewable diff, not runtime config
drift:

    A_cleared          → any_authenticated      (cleared for non-solicitor handling)
    B_mixed (default)  → qualified_solicitor    (privileged content present)
    C_paused           → nobody                 (matter is paused; no capability runs)

The gate fires BEFORE ``require_capability`` so a non-solicitor on
a B_mixed matter gets a posture-shaped denial, not a grant-shaped
one. Order in Contract Review:

    check_posture
        → require_capability(read)
        → advice_boundary.check
        → provider call
        → require_capability(write)
        → write_artifact

Audit shape (per Phase 8 v2 Decision #4):

- action:          ``posture_gate.check.blocked`` (new Phase 8
                   action, named per the
                   ``<primitive>.<operation>.blocked`` convention)
- blocked_reason:  ``BlockedReason.GATE_BLOCKED`` (canonical enum)
- gate_state:      {gate, posture, required_role, actor_role, reason}

A passing check emits nothing — ``module.capability.invoked`` from
the capability covers it.

The gate uses ``audit_failure`` (independent committed transaction)
on block so the audit row survives the HTTP-shaped rollback when
the capability raises ``PostureBlocked``. Same pattern Phase 1
``check_or_block`` uses for capability-denied audits.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary.tiers import role_satisfies
from app.core.phase1_runtime.blocked import BlockedPayload, BlockedReason
from app.models.matter import (
    Matter,
    PRIVILEGE_CLEARED,
    PRIVILEGE_MIXED,
    PRIVILEGE_PAUSED,
)


# The whole policy. Six lines. If this needs to change, it needs a
# code review + a migration of the audit shape; do not move it to
# config.
#
# Three postures exist in the canonical Matter vocabulary
# (``backend/app/models/matter.py``):
#
#   - ``A_cleared``  — cleared for non-solicitor handling
#   - ``B_mixed``    — privileged content present (default for new matters)
#   - ``C_paused``   — model calls already paused at the gateway layer
#
# ``C_paused`` blocks unconditionally. The model_gateway already
# rejects model calls on paused matters; the posture gate adds the
# second layer: even non-model capabilities cannot run on a paused
# matter.
POSTURE_POLICY: dict[str, str] = {
    PRIVILEGE_CLEARED: "any_authenticated",
    PRIVILEGE_MIXED: "qualified_solicitor",
}
# Sentinel value used in audit + result for paused matters. Not a
# role the actor can hold — "nobody" satisfies it.
_PAUSED_REQUIREMENT = "matter_paused"


@dataclass
class PostureGateResult:
    """Outcome of a posture check.

    ``allowed`` is the bit the caller branches on. The rest is
    provenance — ``required_role`` and ``actor_role`` go into the
    audit row + the HTTP error body so the user knows exactly what
    they're missing.
    """

    allowed: bool
    posture: str
    required_role: str
    actor_role: str | None
    reason: str | None = None  # canonical denial label; None on allow


class PostureBlocked(Exception):
    """Raised by the capability when ``check_posture`` returns
    ``allowed=False``. The endpoint translates this to HTTP 403.
    """

    def __init__(self, result: PostureGateResult) -> None:
        self.result = result
        super().__init__(
            f"posture gate blocked: matter posture={result.posture!r} "
            f"requires role={result.required_role!r}, "
            f"actor has role={result.actor_role!r}"
        )


def _build_gate_state(
    result: PostureGateResult, *, firm_role_gates_enabled: bool
) -> dict[str, Any]:
    """Canonical gate_state shape — readers key off ``gate``.

    Phase 17.5: every emitted gate decision records whether the firm
    role hierarchy was enforced or dormant, so the audit stays truthful
    about *why* a check resolved the way it did. The actor role is never
    faked.
    """
    return {
        "gate": "privilege_posture",
        "posture": result.posture,
        "required_role": result.required_role,
        "actor_role": result.actor_role,
        "reason": result.reason or "",
        "firm_role_gates_enabled": firm_role_gates_enabled,
        "policy_mode": (
            "firm_role_gates_enforced"
            if firm_role_gates_enabled
            else "firm_role_gates_dormant"
        ),
    }


def _evaluate_posture(
    *,
    posture: str,
    actor_role: str | None,
    firm_role_gates_enabled: bool = True,
) -> PostureGateResult:
    """Pure-functional core: no IO, no audit. Caller emits.

    Phase 17.5: when ``firm_role_gates_enabled`` is False the firm role
    hierarchy is dormant — any authenticated actor satisfies a
    non-paused posture, so B_mixed no longer demands qualified_solicitor.
    ``C_paused`` is a hard stop regardless of the flag (it means the
    matter is paused, not a junior/senior tier).
    """
    if posture == PRIVILEGE_PAUSED:
        return PostureGateResult(
            allowed=False,
            posture=posture,
            required_role=_PAUSED_REQUIREMENT,
            actor_role=actor_role,
            reason="posture_paused",
        )
    requirement = POSTURE_POLICY.get(posture)
    if requirement is None:
        # Defensive: an unknown posture string never satisfies. In
        # practice the Matter check constraint pins the vocabulary,
        # but a future migration that adds a posture without
        # extending POSTURE_POLICY would default to deny — fail
        # closed.
        return PostureGateResult(
            allowed=False,
            posture=posture,
            required_role="unknown_posture",
            actor_role=actor_role,
            reason="unknown_posture",
        )
    # Dormant mode: the firm role hierarchy is not enforced. Any
    # authenticated actor satisfies the (non-paused) posture. We record
    # required_role as "any_authenticated" so the audit reflects the
    # effective requirement, not a faked qualified_solicitor.
    if not firm_role_gates_enabled:
        requirement = "any_authenticated"
    if role_satisfies(
        actor_role=actor_role, requirement_set=frozenset({requirement})
    ):
        return PostureGateResult(
            allowed=True,
            posture=posture,
            required_role=requirement,
            actor_role=actor_role,
        )
    return PostureGateResult(
        allowed=False,
        posture=posture,
        required_role=requirement,
        actor_role=actor_role,
        reason="posture_gate_failed",
    )


async def check_posture(
    session: AsyncSession,
    *,
    matter: Matter,
    actor_user_id: uuid.UUID,
    actor_role: str | None,
    module_id: str,
    capability_id: str,
) -> PostureGateResult:
    """Evaluate the posture policy against the actor's role.

    On block, emits ``posture_gate.check.blocked`` via
    ``audit_failure`` (so the row survives the rollback when the
    capability raises ``PostureBlocked``). On allow, emits nothing.

    Returns the result; caller raises ``PostureBlocked(result)`` if
    ``not result.allowed``.
    """
    from app.core.config import settings

    firm_role_gates_enabled = settings.firm_role_gates_enabled
    result = _evaluate_posture(
        posture=matter.privilege_posture,
        actor_role=actor_role,
        firm_role_gates_enabled=firm_role_gates_enabled,
    )
    if result.allowed:
        return result

    blocked = BlockedPayload(
        blocked_reason=BlockedReason.GATE_BLOCKED,
        gate_state=_build_gate_state(
            result, firm_role_gates_enabled=firm_role_gates_enabled
        ),
    )

    # Independent committed transaction — the request session will
    # roll back when PostureBlocked propagates to the HTTP handler,
    # so the audit row needs its own commit to survive.
    from app.core.api import audit_failure

    await audit_failure(
        session,
        "posture_gate.check.blocked",
        actor_id=actor_user_id,
        matter_id=matter.id,
        module="core.posture_gate",
        resource_type="matter",
        resource_id=str(matter.id),
        payload={
            "module_id": module_id,
            "capability_id": capability_id,
            **blocked.to_dict(),
        },
    )
    return result


__all__ = [
    "POSTURE_POLICY",
    "PostureBlocked",
    "PostureGateResult",
    "check_posture",
]
