"""Advice boundary HTTP API.

One endpoint per ``ADVICE_BOUNDARY.md``:

    POST /api/advice-boundary/check

The gate is invokable directly; manifest ``advice_tier_max`` wiring
arrives once dispatcher integration lands.

**Role derivation policy:** the actor's workspace role is derived
server-side from the authenticated ``User`` row, not accepted from
the request body. Without this, any authenticated user could submit
``qualified_solicitor`` and approve supervised/final advice
transitions — which would defeat the entire supervision primitive.

The derivation:

- ``user.is_superuser`` → ``workspace_admin``
- otherwise            → ``any_authenticated``

There is no SRA roll verification yet (deferred to the intake
reference module). As a consequence, supervised-legal-advice and
approved-final-advice transitions are reachable via the HTTP API
*only* by workspace admins, and only for the
``supervised_legal_advice → approved_final_advice`` step (the
``draft_advice → supervised_legal_advice`` step requires
``qualified_solicitor``, which cannot yet be assigned). Internal
callers (workflows, reference modules) that have already verified
solicitor status can still invoke ``core.advice_boundary.check()``
directly with an explicit ``actor_role``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary import check
from app.core.auth import current_user
from app.core.db import get_session
from app.models import User


router = APIRouter()


# Role tokens — must match ROLE_REQUIREMENTS in
# ``app.core.advice_boundary.tiers``.
_ROLE_WORKSPACE_ADMIN = "workspace_admin"
_ROLE_ANY_AUTHENTICATED = "any_authenticated"


def _derive_actor_role(user: User) -> str:
    """Server-side role derivation. Never trust client input for this."""
    if user.is_superuser:
        return _ROLE_WORKSPACE_ADMIN
    return _ROLE_ANY_AUTHENTICATED


class CheckRequest(BaseModel):
    """Request body for the advice-boundary check.

    Note: ``actor_role`` is intentionally NOT a field. The HTTP layer
    derives role from the authenticated user (see module docstring).
    Internal callers that need to specify role explicitly should use
    the programmatic ``core.advice_boundary.check()`` API.
    """

    output_id: str
    requested_tier: str
    from_tier: str | None = None
    declared_tier_max: str | None = None
    module_id: str | None = None
    capability_id: str | None = None


class CheckResponse(BaseModel):
    allowed: bool
    decision_id: str
    gate_state: dict[str, Any]


@router.post("/check", response_model=CheckResponse)
async def check_endpoint(
    body: CheckRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> CheckResponse:
    """Invoke the advice-boundary gate.

    The gate always writes a decision row and an audit row. Callers
    receive ``allowed=True`` on success or ``allowed=False`` with the
    ``gate_state`` carrying the canonical BlockedPayload on rejection.
    No HTTP 4xx on blocked/denied because the call itself succeeded —
    the gate's *decision* is the return value, not an exception.
    """
    actor_role = _derive_actor_role(user)
    result = await check(
        session,
        output_id=body.output_id,
        requested_tier=body.requested_tier,
        from_tier=body.from_tier,
        declared_tier_max=body.declared_tier_max,
        actor_user_id=user.id,
        actor_role=actor_role,
        module_id=body.module_id,
        capability_id=body.capability_id,
    )
    await session.commit()
    return CheckResponse(**result)
