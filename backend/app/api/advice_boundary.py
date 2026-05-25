"""Advice boundary HTTP API.

One endpoint per ``HANDOVER_PHASE_1_START.md`` and
``ADVICE_BOUNDARY.md``:

    POST /api/advice-boundary/check

Phase 1: the gate is invokable directly. Phase 2 will wire it from
manifest ``advice_tier_max``.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary import check
from app.core.auth import current_user
from app.core.db import get_session
from app.models import User


router = APIRouter()


class CheckRequest(BaseModel):
    output_id: str
    requested_tier: str
    from_tier: str | None = None
    declared_tier_max: str | None = None
    actor_role: str | None = None
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
    result = await check(
        session,
        output_id=body.output_id,
        requested_tier=body.requested_tier,
        from_tier=body.from_tier,
        declared_tier_max=body.declared_tier_max,
        actor_user_id=user.id,
        actor_role=body.actor_role,
        module_id=body.module_id,
        capability_id=body.capability_id,
    )
    await session.commit()
    return CheckResponse(**result)
