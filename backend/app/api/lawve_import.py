"""External skill importer endpoints (Lawve + GitHub).

`/api/modules/external/lawve/...` — browse + inspect Lawve skills and
convert one into a Legalise module DRAFT.
`/api/modules/external/github/...` — inspect + convert a SKILL.md from
any public GitHub repository (the generic drop-in path).

Authed. Read-only: no DB writes, no audit rows, no install. The draft
must still be signed + installed through the existing trust ceremony.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import current_user
from app.core.github_import import build_github_draft, get_remote_skill
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


class GitHubSkillRequest(BaseModel):
    url: str


class GitHubDraftRequest(DraftRequest):
    url: str


@router.get("/external/github/skill")
async def get_github_skill(url: str, user: User = Depends(current_user)) -> dict:
    try:
        detail = await get_remote_skill(url)
    except LawveSourceError as exc:
        raise HTTPException(
            502,
            detail={"error": "github_source_unavailable", "message": str(exc)},
        )
    if detail is None:
        raise HTTPException(404, f"no SKILL.md found at: {url}")
    return detail


@router.post("/external/github/draft")
async def draft_github_module(
    body: GitHubDraftRequest,
    user: User = Depends(current_user),
) -> dict:
    overrides = body.model_dump(exclude_none=True)
    url = overrides.pop("url")
    try:
        result = await build_github_draft(url, overrides)
    except LawveSourceError as exc:
        raise HTTPException(
            502,
            detail={"error": "github_source_unavailable", "message": str(exc)},
        )
    if result is None:
        raise HTTPException(404, f"no SKILL.md found at: {url}")
    return result
