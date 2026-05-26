"""Phase 13b C — system bootstrap-state endpoint.

  GET /api/system/bootstrap-state  →  {user_count, has_superuser}

Closes Gap #5 from ``BACKEND_GAP_AUDIT.md``. The SPA's first-run
detection (Journey 00 Step 1) needs to distinguish "fresh fork,
no users yet" from "not logged in". This endpoint is the gate.

Phase 13b Decision #3: NO authentication required. The endpoint
must be callable before the first auth flow; gating it would mean
no SPA can ever detect first-run state. The response carries only
two integers/booleans — the same information visible from any
failed login attempt; not a leak worth gating.

Read-only; no audit emission.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models import User


router = APIRouter()


class BootstrapState(BaseModel):
    user_count: int
    has_superuser: bool


@router.get(
    "/bootstrap-state",
    response_model=BootstrapState,
)
async def bootstrap_state_endpoint(
    session: AsyncSession = Depends(get_session),
) -> BootstrapState:
    """Return whether the workspace has any users + a superuser yet.

    Open endpoint — no authentication. Used by the SPA's first-run
    detection to decide between "show register-first-account" and
    "show login form".
    """
    user_count = await session.scalar(select(func.count()).select_from(User))
    has_superuser = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(User.is_superuser == True)  # noqa: E712
    )
    return BootstrapState(
        user_count=int(user_count or 0),
        has_superuser=bool(has_superuser or 0),
    )
