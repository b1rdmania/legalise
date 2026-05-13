"""Pre-Motion router — `POST /api/matters/{slug}/pre-motion/run`.

The Day 5 generic `/invoke` endpoint stays in place for any other plugin
skill; this dedicated route exists because Pre-Motion is the hero module
and runs a four-stage in-process pipeline rather than a single skill
invocation.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.model_gateway import PrivilegePaused
from app.models import Matter, User

from .pipeline import run_pre_motion
from .schemas import PreMotionRunInputs, PreMotionRunResult


router = APIRouter()


@router.post("/{slug}/pre-motion/run", response_model=PreMotionRunResult)
async def run_pre_motion_endpoint(
    slug: str,
    inputs: PreMotionRunInputs | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> PreMotionRunResult:
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    body = inputs or PreMotionRunInputs()

    try:
        return await run_pre_motion(
            session=session,
            matter=matter,
            actor_id=user.id,
            inputs=body,
        )
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
