from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/{plugin}/{skill}", response_class=PlainTextResponse)
async def get_skill_body(
    plugin: str,
    skill: str,
    user: User = Depends(current_user),
) -> PlainTextResponse:
    """Return the reviewable prompt body for one installed skill.

    Auth-gated to match the catalogue view. Disabled skills remain
    inspectable so users can review before re-enabling.
    """
    if not (_safe_part(plugin) and _safe_part(skill)):
        raise HTTPException(400, "invalid plugin or skill identifier")
    path = _plugins_root() / plugin / "skills" / skill / "SKILL.md"
    if not path.exists():
        raise HTTPException(404, f"skill not found: {plugin}/{skill}")
    manifest = _parse_skill_md(path.read_text(encoding="utf-8"))
    return PlainTextResponse(manifest.body.strip())
