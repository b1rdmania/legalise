"""Installed skill catalogue.

This is the v0.1 Discovery layer: a read-only view over the SKILL.md files
present at PLUGINS_ROOT. Install and approval remain a Git workflow.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from jsonschema import Draft202012Validator
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.plugin_bridge import _parse_skill_md
from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.models import User, WorkspaceDisabledSkill, WorkspaceSkillCapabilityGrant


router = APIRouter()


# Schema lookup. The repo-root `schemas/module.json` is the canonical
# location; fall back to the legacy `backend/schemas/module.json` if it
# is ever added there. Loaded once per process.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCHEMA_CANDIDATES = (
    _REPO_ROOT / "schemas" / "module.json",
    _REPO_ROOT / "backend" / "schemas" / "module.json",
)


@lru_cache(maxsize=1)
def _module_schema() -> dict | None:
    for candidate in _SCHEMA_CANDIDATES:
        if candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    return None


def _validation_errors(payload: dict) -> list[dict]:
    schema = _module_schema()
    if schema is None:
        return []
    validator = Draft202012Validator(schema)
    errors: list[dict] = []
    for err in validator.iter_errors(payload):
        path = "/" + "/".join(str(p) for p in err.absolute_path)
        errors.append({"path": path, "message": err.message})
    return errors


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
    # `capabilities` is retained as an alias for `declared_capabilities`
    # so existing UI clients keep working through v0.1. New clients
    # should read the explicit declared / granted pair so the runtime
    # gap is visible. Both fields carry the same shape: a list of slugs.
    capabilities: list[str] = []
    declared_capabilities: list[str] = []
    granted_capabilities: list[str] = []
    trust_posture: str | None = None
    enabled: bool = True


class BrokenManifest(BaseModel):
    plugin: str
    skill: str
    errors: list[dict]


class ModulesResponse(BaseModel):
    plugins_root: str
    source: ModuleSource
    skills: list[ModuleSkill]
    broken: list[BrokenManifest] = []


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


def _module_json_for(skill_md_path: Path) -> Path:
    """Return the module.json sibling at the plugin root for a SKILL.md.

    Layout: `<plugins_root>/<plugin>/skills/<skill>/SKILL.md`. The manifest
    sits at `<plugins_root>/<plugin>/module.json`.
    """
    return skill_md_path.parent.parent.parent / "module.json"


@router.get("", response_model=ModulesResponse)
async def list_modules(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ModulesResponse:
    """Return every installed SKILL.md discovered under PLUGINS_ROOT.

    Each discovered skill is paired with the plugin's `module.json`,
    validated against `schemas/module.json` via `Draft202012Validator`.
    Manifests that fail validation are returned in the `broken` list so
    the UI can flag them — they are not silently dropped.
    """
    skills: list[ModuleSkill] = []
    broken: list[BrokenManifest] = []
    root = _plugins_root()

    # Per-user disabled set (absence = enabled, presence = disabled).
    disabled_rows = await session.scalars(
        select(WorkspaceDisabledSkill).where(WorkspaceDisabledSkill.user_id == user.id)
    )
    disabled: set[tuple[str, str]] = {(r.plugin, r.skill) for r in disabled_rows.all()}

    # Per-user granted capabilities, indexed by `(plugin, skill)`. Empty
    # for users on a fresh workspace where the auto-grant hasn't run
    # (legacy users, manifest read failures); shown as such in the UI so
    # the gap is visible rather than hidden.
    grant_rows = await session.scalars(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id
        )
    )
    granted_by_skill: dict[tuple[str, str], list[str]] = {}
    for row in grant_rows.all():
        granted_by_skill.setdefault((row.plugin, row.skill), []).append(row.capability)

    # Cache per-plugin manifest validation across multiple skills in the
    # same plugin so we only read + validate the manifest once per request.
    manifest_cache: dict[str, tuple[dict | None, list[dict]]] = {}

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

        if plugin not in manifest_cache:
            mj_path = _module_json_for(path)
            if mj_path.exists():
                try:
                    payload = json.loads(mj_path.read_text(encoding="utf-8"))
                except json.JSONDecodeError as exc:
                    manifest_cache[plugin] = (
                        None,
                        [{"path": "/", "message": f"invalid JSON: {exc.msg}"}],
                    )
                else:
                    manifest_cache[plugin] = (payload, _validation_errors(payload))
            else:
                manifest_cache[plugin] = (
                    None,
                    [{"path": "/", "message": "module.json manifest missing"}],
                )

        module_payload, errors = manifest_cache[plugin]
        if errors:
            broken.append(BrokenManifest(plugin=plugin, skill=skill, errors=errors))
            continue

        # Declared capabilities resolve per-skill via the shared helper
        # in `app.core.capabilities`. Auto-grant on signup reads the same
        # function so what the user sees here matches what the runtime
        # actually grants. Per-skill overrides take precedence over the
        # plugin-level list; skills absent from the `skills` map inherit
        # plugin-level. Trust posture follows the same precedence.
        from app.core.capabilities import declared_capabilities_for_skill

        capabilities = declared_capabilities_for_skill(module_payload, skill)

        plugin_trust = (
            module_payload.get("trust_posture")
            if isinstance(module_payload, dict)
            else None
        )
        skill_override = {}
        if isinstance(module_payload, dict):
            skills_map = module_payload.get("skills", {})
            if isinstance(skills_map, dict):
                candidate = skills_map.get(skill, {})
                if isinstance(candidate, dict):
                    skill_override = candidate
        trust_posture = skill_override.get("trust_posture", plugin_trust)

        granted = sorted(granted_by_skill.get((plugin, skill), []))

        skills.append(
            ModuleSkill(
                plugin=plugin,
                skill=skill,
                name=manifest.name,
                description=manifest.description,
                source_url=_source_url(path),
                argument_hint=manifest.argument_hint,
                capabilities=capabilities,
                declared_capabilities=capabilities,
                granted_capabilities=granted,
                trust_posture=trust_posture,
                enabled=(plugin, skill) not in disabled,
            )
        )

    return ModulesResponse(
        plugins_root=str(root),
        source=ModuleSource(repo=settings.plugins_repo, ref=settings.plugins_repo_ref),
        skills=skills,
        broken=broken,
    )


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
