"""Guided Demo Loop v1 — ensure endpoint.

One authenticated endpoint that idempotently provisions the keyless guided
demo (stub-echo matter + seeded document + installed prompt module +
matter-scoped grants) for the current user and returns the handles the
frontend needs to drive the loop. No new substrate — it composes the
existing seed/grant primitives. The actual run, review, and audit go
through the normal endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.demo_loop import ensure_guided_demo
from app.models import User

router = APIRouter(prefix="/api/demo", tags=["demo"])


class GuidedDemoHandles(BaseModel):
    matter_slug: str
    matter_title: str
    module_id: str
    capability_id: str
    document_id: str
    document_filename: str
    model_id: str


@router.post("/guided-loop", response_model=GuidedDemoHandles)
async def ensure_guided_loop(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> GuidedDemoHandles:
    """Provision (idempotently) the guided demo for the current user."""
    handles = await ensure_guided_demo(session, user)
    return GuidedDemoHandles(**handles)
