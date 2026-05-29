"""Lawve Skill Importer v1 — external-source endpoints.

`/api/modules/external/lawve/...` — browse + inspect Lawve skills and
convert one into a Legalise module DRAFT. Authed. Read-only: no DB
writes, no audit rows, no install. The draft must still be signed +
installed through the existing trust ceremony.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import current_user
from app.core.lawve_import import (
    LawveSourceError,
    build_draft,
    get_skill,
    list_skills,
)
from app.models import User

router = APIRouter()


class DraftCapabilities(BaseModel):
    reads: list[str] | None = None
    writes: list[str] | None = None
    gates: list[str] | None = None
    advice_tier_max: str | None = None


class DraftRequest(BaseModel):
    module_id: str | None = None
    capability_id: str | None = None
    capabilities: DraftCapabilities | None = None
    audit_events: list[str] | None = None


@router.get("/external/lawve/skills")
async def list_lawve_skills(user: User = Depends(current_user)) -> dict:
    try:
        return await list_skills()
    except LawveSourceError as exc:
        raise HTTPException(
            502,
            detail={"error": "lawve_source_unavailable", "message": str(exc)},
        )


@router.get("/external/lawve/skills/{slug}")
async def get_lawve_skill(slug: str, user: User = Depends(current_user)) -> dict:
    try:
        detail = await get_skill(slug)
    except LawveSourceError as exc:
        raise HTTPException(
            502,
            detail={"error": "lawve_source_unavailable", "message": str(exc)},
        )
    if detail is None:
        raise HTTPException(404, f"lawve skill not found: {slug}")
    return detail


@router.post("/external/lawve/skills/{slug}/draft")
async def draft_lawve_module(
    slug: str,
    body: DraftRequest,
    user: User = Depends(current_user),
) -> dict:
    overrides = body.model_dump(exclude_none=True)
    if "capabilities" in overrides and overrides["capabilities"] is not None:
        # Pydantic gave a nested dict already via model_dump.
        pass
    try:
        result = await build_draft(slug, overrides)
    except LawveSourceError as exc:
        raise HTTPException(
            502,
            detail={"error": "lawve_source_unavailable", "message": str(exc)},
        )
    if result is None:
        raise HTTPException(404, f"lawve skill not found: {slug}")
    return result
