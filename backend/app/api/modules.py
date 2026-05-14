"""Installed skill catalogue.

This is the v0.1 Discovery layer: a read-only view over the SKILL.md files
present at PLUGINS_ROOT. Install and approval remain a Git workflow.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.adapters.plugin_bridge import _parse_skill_md
from app.core.config import settings


router = APIRouter()


class ModuleSource(BaseModel):
    repo: str | None
    ref: str | None


class ModuleSkill(BaseModel):
    plugin: str
    skill: str
    name: str
    description: str
    source_url: str | None
    argument_hint: str | None


class ModulesResponse(BaseModel):
    plugins_root: str
    source: ModuleSource
    skills: list[ModuleSkill]


def _plugins_root() -> Path:
    return Path(settings.plugins_root)


def _safe_part(part: str) -> bool:
    return bool(part) and "/" not in part and not part.startswith(".") and part not in {".", ".."}


def _source_url(path: Path) -> str | None:
    if not settings.plugins_repo or not settings.plugins_repo_ref:
        return None
    try:
        rel = path.relative_to(_plugins_root())
    except ValueError:
        return None
    encoded = "/".join(quote(p) for p in rel.parts)
    return f"{settings.plugins_repo.rstrip('/')}/blob/{settings.plugins_repo_ref}/{encoded}"


def _skill_paths() -> list[Path]:
    root = _plugins_root()
    if not root.exists():
        return []
    return sorted(root.glob("*/skills/*/SKILL.md"))


@router.get("", response_model=ModulesResponse)
async def list_modules() -> ModulesResponse:
    """Return every installed SKILL.md discovered under PLUGINS_ROOT."""
    skills: list[ModuleSkill] = []
    root = _plugins_root()
    for path in _skill_paths():
        try:
            plugin, _, skill, filename = path.relative_to(root).parts
        except ValueError:
            continue
        if filename != "SKILL.md" or not (_safe_part(plugin) and _safe_part(skill)):
            continue
        try:
            manifest = _parse_skill_md(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        skills.append(
            ModuleSkill(
                plugin=plugin,
                skill=skill,
                name=manifest.name,
                description=manifest.description,
                source_url=_source_url(path),
                argument_hint=manifest.argument_hint,
            )
        )

    return ModulesResponse(
        plugins_root=str(root),
        source=ModuleSource(repo=settings.plugins_repo, ref=settings.plugins_repo_ref),
        skills=skills,
    )


@router.get("/{plugin}/{skill}", response_class=PlainTextResponse)
async def get_skill_body(plugin: str, skill: str) -> PlainTextResponse:
    """Return the reviewable prompt body for one installed skill."""
    if not (_safe_part(plugin) and _safe_part(skill)):
        raise HTTPException(400, "invalid plugin or skill identifier")
    path = _plugins_root() / plugin / "skills" / skill / "SKILL.md"
    if not path.exists():
        raise HTTPException(404, f"skill not found: {plugin}/{skill}")
    manifest = _parse_skill_md(path.read_text(encoding="utf-8"))
    return PlainTextResponse(manifest.body.strip())
