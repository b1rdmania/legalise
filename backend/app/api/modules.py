"""Installed skill catalogue.

This is the v0.1 Discovery layer: a read-only view over the SKILL.md files
present at PLUGINS_ROOT. Install and approval remain a Git workflow.

Phase 2 adds three new endpoints exposing the v2 manifest surface
(`/v2`, `/v2/{module_id}`, `/v2/capabilities`). Existing v1 endpoints
are unchanged so existing clients continue to function.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from jsonschema import Draft202012Validator
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.plugin_bridge import _parse_skill_md
from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.registry import (
    ManifestNotFoundError,
    UISlotRegistry,
    auto_derive_v2_from_v1,
    discover_modules,
    list_capabilities,
    load_manifest,
    validate_manifest_v2,
)
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


@dataclass
class _DiscoveredSkill:
    """One SKILL.md + module.json resolved into the shape both endpoints
    share. Per-user fields (`granted_capabilities`, `enabled`) are layered
    on by the authed endpoint after discovery."""

    plugin: str
    skill: str
    name: str
    description: str
    source_url: str | None
    argument_hint: str | None
    declared_capabilities: list[str]
    trust_posture: str | None


def _discover_skills() -> tuple[list[_DiscoveredSkill], list[BrokenManifest]]:
    """Walk PLUGINS_ROOT, parse every SKILL.md, validate its sibling
    module.json. Single source of truth for the manifest resolver used by
    both `GET /api/modules` (authed) and `GET /api/modules/public`.
    """
    from app.core.capabilities import declared_capabilities_for_skill

    skills: list[_DiscoveredSkill] = []
    broken: list[BrokenManifest] = []
    root = _plugins_root()

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

        skills.append(
            _DiscoveredSkill(
                plugin=plugin,
                skill=skill,
                name=manifest.name,
                description=manifest.description,
                source_url=_source_url(path),
                argument_hint=manifest.argument_hint,
                declared_capabilities=capabilities,
                trust_posture=trust_posture,
            )
        )

    return skills, broken


class PublicModuleSkill(BaseModel):
    """Public catalogue view of a skill. No workspace state -
    `granted_capabilities` and `enabled` are deliberately absent so the
    public surface cannot leak which capabilities any workspace holds."""

    plugin: str
    skill: str
    name: str
    description: str
    declared_capabilities: list[str] = []
    trust_posture: str | None = None
    source_url: str | None = None


class PublicModulesResponse(BaseModel):
    source: ModuleSource
    skills: list[PublicModuleSkill]
    broken: list[BrokenManifest] = []


@router.get("/public", response_model=PublicModulesResponse)
async def list_modules_public(response: Response) -> PublicModulesResponse:
    """Read-only catalogue for unauth visitors. Uses the same manifest
    resolver as `GET /api/modules` so the listings cannot drift.

    No workspace state is exposed: only declared capabilities, the
    trust posture from the manifest, and the source URL. Cached for
    five minutes; the catalogue mutates on a git push to the upstream
    plugins repo, not on user action.
    """
    discovered, broken = _discover_skills()
    response.headers["Cache-Control"] = "public, max-age=300"
    return PublicModulesResponse(
        source=ModuleSource(repo=settings.plugins_repo, ref=settings.plugins_repo_ref),
        skills=[
            PublicModuleSkill(
                plugin=s.plugin,
                skill=s.skill,
                name=s.name,
                description=s.description,
                declared_capabilities=s.declared_capabilities,
                trust_posture=s.trust_posture,
                source_url=s.source_url,
            )
            for s in discovered
        ],
        broken=broken,
    )


@router.get("", response_model=ModulesResponse)
async def list_modules(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ModulesResponse:
    """Return every installed SKILL.md discovered under PLUGINS_ROOT.

    Each discovered skill is paired with the plugin's `module.json`,
    validated against `schemas/module.json` via `Draft202012Validator`.
    Manifests that fail validation are returned in the `broken` list so
    the UI can flag them - they are not silently dropped.

    Shares `_discover_skills()` with the public endpoint; layers per-user
    grants and the per-user disabled set on top.
    """
    discovered, broken = _discover_skills()
    root = _plugins_root()

    disabled_rows = await session.scalars(
        select(WorkspaceDisabledSkill).where(WorkspaceDisabledSkill.user_id == user.id)
    )
    disabled: set[tuple[str, str]] = {(r.plugin, r.skill) for r in disabled_rows.all()}

    grant_rows = await session.scalars(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id
        )
    )
    granted_by_skill: dict[tuple[str, str], list[str]] = {}
    for row in grant_rows.all():
        granted_by_skill.setdefault((row.plugin, row.skill), []).append(row.capability)

    skills = [
        ModuleSkill(
            plugin=d.plugin,
            skill=d.skill,
            name=d.name,
            description=d.description,
            source_url=d.source_url,
            argument_hint=d.argument_hint,
            capabilities=d.declared_capabilities,
            declared_capabilities=d.declared_capabilities,
            granted_capabilities=sorted(granted_by_skill.get((d.plugin, d.skill), [])),
            trust_posture=d.trust_posture,
            enabled=(d.plugin, d.skill) not in disabled,
        )
        for d in discovered
    ]

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


# ---------------------------------------------------------------------------
# Phase 2 — v2 manifest surface
# ---------------------------------------------------------------------------
#
# Three new endpoints that expose discovered modules in their v2
# manifest shape. v1 endpoints above are untouched. Phase 12 frontend
# work will read these endpoints; existing v1 clients keep working.


class V2ManifestEntry(BaseModel):
    """One discovered module in its v2 shape, with provenance info."""

    module_id: str
    source_kind: str  # "v2" | "v1_module_json" | "v1_skill"
    manifest: dict[str, Any]
    is_valid: bool
    validation_errors: list[dict[str, Any]] = []


class V2CapabilityEntry(BaseModel):
    """One capability declared by a discovered module."""

    module_id: str
    module_version: str | None
    publisher: str | None
    visibility: str | None
    capability_id: str | None
    kind: str | None
    scope: str | None
    reads: list[str]
    writes: list[str]
    model_access: str | None
    external_network: bool | None
    advice_tier_max: str | None
    ui_slot: str | None


class V2RegistryResponse(BaseModel):
    """Workspace-level view of the v2 registry."""

    modules: list[V2ManifestEntry]
    ui_slots: list[str]


def _entry_to_v2_manifest(entry) -> dict[str, Any]:
    """Coerce a DiscoveredModule into its v2 manifest payload, running
    the v1 → v2 shim where needed."""
    if entry.source_kind == "v2":
        return entry.payload
    if entry.source_kind == "v1_module_json":
        return auto_derive_v2_from_v1(
            source_kind="v1_module_json",
            payload=entry.payload,
        )
    if entry.source_kind == "v1_skill":
        return auto_derive_v2_from_v1(
            source_kind="v1_skill",
            skill_md=entry.payload,
            plugin_id=entry.extra.get("plugin_id"),
            skill_id=entry.extra.get("skill_id"),
        )
    return {}


@router.get("/v2", response_model=V2RegistryResponse)
async def list_v2_modules(
    user: User = Depends(current_user),
) -> V2RegistryResponse:
    """List all discovered modules in their v2 manifest shape.

    Includes both natively-v2 manifests (``legalise.module.json``) and
    v1 manifests auto-derived via the shim. Each entry reports
    ``is_valid`` and any structural validation errors so the frontend
    can surface "broken" modules.
    """
    entries: list[V2ManifestEntry] = []
    for entry in discover_modules():
        try:
            manifest = _entry_to_v2_manifest(entry)
        except ValueError:
            entries.append(
                V2ManifestEntry(
                    module_id=entry.module_id,
                    source_kind=entry.source_kind,
                    manifest={},
                    is_valid=False,
                    validation_errors=[
                        {
                            "path": "/",
                            "message": "shim could not derive v2 manifest",
                        }
                    ],
                )
            )
            continue
        is_valid, errors = validate_manifest_v2(manifest)
        entries.append(
            V2ManifestEntry(
                module_id=entry.module_id,
                source_kind=entry.source_kind,
                manifest=manifest,
                is_valid=is_valid,
                validation_errors=errors,
            )
        )
    return V2RegistryResponse(
        modules=entries,
        ui_slots=UISlotRegistry.all_slots(),
    )


@router.get("/v2/capabilities", response_model=list[V2CapabilityEntry])
async def list_v2_capabilities(
    user: User = Depends(current_user),
) -> list[V2CapabilityEntry]:
    """Flat catalogue of capabilities declared across all discovered
    modules.

    Used by Phase 4 grant lifecycle (snapshot storage) and Phase 12
    frontend (grant UI / module catalogue).
    """
    catalogue = list_capabilities()
    return [V2CapabilityEntry(**cap) for cap in catalogue]


@router.get("/v2/{module_id}", response_model=V2ManifestEntry)
async def get_v2_module(
    module_id: str,
    user: User = Depends(current_user),
) -> V2ManifestEntry:
    """Detail view for one module by id, in v2 manifest shape."""
    try:
        entry = load_manifest(module_id)
    except ManifestNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "module_not_found", "message": str(exc)},
        )
    try:
        manifest = _entry_to_v2_manifest(entry)
    except ValueError:
        return V2ManifestEntry(
            module_id=entry.module_id,
            source_kind=entry.source_kind,
            manifest={},
            is_valid=False,
            validation_errors=[
                {
                    "path": "/",
                    "message": "shim could not derive v2 manifest",
                }
            ],
        )
    is_valid, errors = validate_manifest_v2(manifest)
    return V2ManifestEntry(
        module_id=entry.module_id,
        source_kind=entry.source_kind,
        manifest=manifest,
        is_valid=is_valid,
        validation_errors=errors,
    )
