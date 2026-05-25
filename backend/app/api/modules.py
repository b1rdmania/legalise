"""Installed skill catalogue.

This is the v0.1 Discovery layer: a read-only view over the SKILL.md files
present at PLUGINS_ROOT. Install and approval remain a Git workflow.

Phase 2 adds three new endpoints exposing the v2 manifest surface
(`/v2`, `/v2/{module_id}`, `/v2/capabilities`). Existing v1 endpoints
are unchanged so existing clients continue to function.
"""

from __future__ import annotations

import json
import uuid as _uuid
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import PlainTextResponse
from jsonschema import Draft202012Validator
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.plugin_bridge import _parse_skill_md
from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.admin_check import require_admin
from app.core.registry import (
    ManifestNotFoundError,
    UISlotRegistry,
    auto_derive_v2_from_v1,
    discover_modules,
    list_capabilities,
    load_manifest,
    validate_manifest_v2,
)
from app.core.signing import verify_manifest_signature
from app.core.trust_ceremony import (
    Ceremony,
    CeremonyState,
    advance_ceremony,
    build_permission_card,
    get_ceremony,
    start_ceremony,
)
from app.models import (
    InstalledModule,
    User,
    WorkspaceDisabledSkill,
    WorkspaceSkillCapabilityGrant,
)


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
    manifest_valid: bool = True


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
# ---------------------------------------------------------------------------
# Phase 3 — trust ceremony / install endpoints
# ---------------------------------------------------------------------------
#
# POST /api/modules/install          start a new ceremony
# POST /api/modules/install/{id}/advance  drive the state machine
# GET  /api/modules/install/{id}     read current ceremony state
#
# All admin-gated via require_admin (same pattern as schema +
# definition registration — Phase 2 Reviewer P1#3 + P1#2 round 2).


class StartInstallRequest(BaseModel):
    """Body for ``POST /api/modules/install``.

    Phase 3 ships two source modes:
    - ``"registry"`` — install a module already discoverable via
      ``core.registry.discover_modules`` (by id)
    - ``"manifest"`` — install from an inline v2 manifest payload
      (used by tests + admin tooling)
    """

    source: str  # "registry" | "manifest"
    module_id: str | None = None
    manifest: dict[str, Any] | None = None
    signature: str | None = None


class CeremonyResponse(BaseModel):
    """Snapshot of an in-flight ceremony."""

    ceremony_id: str
    module_id: str
    state: str
    fast_path: bool
    is_terminal: bool
    permission_card: dict[str, Any]
    history: list[dict[str, Any]]


class AdvanceCeremonyRequest(BaseModel):
    # Round-2 residual P2: trust-ceremony transitions must be explicit
    # and machine-checkable. A free-form string previously fell through
    # to the default `trust` branch in `advance_ceremony()`, meaning
    # `{"action":"banana"}` would advance the ceremony. Pydantic now
    # rejects anything outside the canonical set with HTTP 422.
    action: Literal["trust", "reject", "grant"]


def _ceremony_to_response(ceremony: Ceremony) -> CeremonyResponse:
    terminal_states = {
        CeremonyState.ENABLED,
        CeremonyState.REJECTED_BY_USER,
        CeremonyState.SIGNATURE_FAILED,
        CeremonyState.PUBLISHER_BLOCKED,
        CeremonyState.PERMISSION_DENIED,
        CeremonyState.SANDBOX_PROFILE_MISSING,
    }
    return CeremonyResponse(
        ceremony_id=str(ceremony.id),
        module_id=ceremony.module_id,
        state=ceremony.state.value,
        fast_path=ceremony.fast_path,
        is_terminal=ceremony.state in terminal_states,
        permission_card={
            "module_id": ceremony.permission_card.module_id,
            "module_name": ceremony.permission_card.module_name,
            "publisher": ceremony.permission_card.publisher,
            "publisher_verified": ceremony.permission_card.publisher_verified,
            "signature_status": ceremony.permission_card.signature_status,
            "visibility": ceremony.permission_card.visibility,
            "version": ceremony.permission_card.version,
            "capabilities": ceremony.permission_card.capabilities,
            "data_movement_summary": ceremony.permission_card.data_movement_summary,
            "gates": ceremony.permission_card.gates,
            "advice_tier_max": ceremony.permission_card.advice_tier_max,
            "audit_events": ceremony.permission_card.audit_events,
            "dependencies": ceremony.permission_card.dependencies,
        },
        history=list(ceremony.history),
    )


async def _persist_install(
    session: AsyncSession,
    *,
    ceremony: Ceremony,
    user: User,
) -> InstalledModule:
    """Write the installed_modules row at the end of a ceremony.

    Called when the ceremony reaches ``enabled``. The manifest +
    permissions snapshots are captured here for Phase 4 lifecycle.
    """
    from datetime import datetime, timezone

    manifest = ceremony.manifest
    card = ceremony.permission_card
    # Aggregated permissions for Phase 4 fast-diff.
    permissions_snapshot = {
        "data_movement": card.data_movement_summary,
        "gates": card.gates,
        "advice_tier_max": card.advice_tier_max,
        "audit_events": card.audit_events,
        "capabilities": card.capabilities,
    }
    row = InstalledModule(
        id=_uuid.uuid4(),
        module_id=manifest.get("id", ceremony.module_id),
        version=manifest.get("version", "0.0.0"),
        publisher=manifest.get("publisher", "unknown"),
        visibility=manifest.get("visibility", "community"),
        signature_status=card.signature_status,
        signed_by=manifest.get("signed_by"),
        verified_at=(
            datetime.now(timezone.utc) if ceremony.fast_path else None
        ),
        install_path=manifest.get("source_url") or "<inline>",
        manifest_snapshot=manifest,
        permissions_snapshot=permissions_snapshot,
        installed_by_user_id=user.id,
        enabled=True,
    )
    session.add(row)
    await session.flush()
    return row


@router.post(
    "/install",
    response_model=CeremonyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_install_endpoint(
    body: StartInstallRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> CeremonyResponse:
    """Begin a trust ceremony for installing a module.

    Admin-gated. Two source modes:
    - ``source="registry"``: install a discoverable module by id
    - ``source="manifest"``: install from an inline v2 manifest

    Returns the initial ceremony state + permission card. The
    frontend (Phase 12) drives the ceremony to completion via
    ``POST /install/{id}/advance``.
    """
    require_admin(user, action_label="module install")

    if body.source == "registry":
        if not body.module_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "missing_module_id",
                    "message": "source='registry' requires module_id",
                },
            )
        try:
            entry = load_manifest(body.module_id)
        except ManifestNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "module_not_found", "message": str(exc)},
            )
        manifest = _entry_to_v2_manifest(entry)
    elif body.source == "manifest":
        if not body.manifest:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "missing_manifest",
                    "message": "source='manifest' requires manifest payload",
                },
            )
        manifest = body.manifest
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "invalid_source",
                "message": (
                    f"source={body.source!r} not in 'registry' | 'manifest'"
                ),
            },
        )

    is_valid, errors = validate_manifest_v2(manifest)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "invalid_manifest",
                "validation_errors": errors,
            },
        )

    # Round-2 Reviewer P1#3: enforce dependency resolution BEFORE
    # the ceremony starts. Phase 5 carry-over tidy removed the
    # CeremonyState.DEPENDENCY_MISSING terminal — the 422 here is the
    # canonical signal; the state machine carries no dead transition.
    from app.core.dependency_resolver import resolve_dependencies

    resolution = await resolve_dependencies(manifest, session=session)
    if not resolution.is_satisfied:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "dependencies_unsatisfied",
                "resolution": resolution.to_dict(),
            },
        )

    ceremony = await start_ceremony(
        session,
        manifest=manifest,
        actor_user_id=user.id,
        signature=body.signature,
    )
    await session.commit()
    return _ceremony_to_response(ceremony)


@router.post(
    "/install/{ceremony_id}/advance",
    response_model=CeremonyResponse,
)
async def advance_install_endpoint(
    ceremony_id: UUID,
    body: AdvanceCeremonyRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> CeremonyResponse:
    """Drive the trust ceremony state machine.

    Actions:
    - ``"trust"`` — accept and continue
    - ``"reject"`` — terminal: rejected_by_user
    - ``"grant"`` — final commit; persists InstalledModule + emits
      module.enabled
    """
    require_admin(user, action_label="module install")

    # Round-2 Reviewer P1#1: InvalidCeremonyTransition → 409 Conflict.
    # Prevents an admin from skipping straight to enabled via
    # ``action="grant"`` on a freshly-started ceremony.
    from app.core.trust_ceremony import InvalidCeremonyTransition

    try:
        ceremony = await advance_ceremony(
            session,
            ceremony_id=ceremony_id,
            action=body.action,
            actor_user_id=user.id,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "ceremony_not_found",
                "message": str(exc),
            },
        )
    except InvalidCeremonyTransition as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "invalid_ceremony_transition",
                "message": str(exc),
            },
        )

    # Round-2 Reviewer P2: persist only on the transition INTO enabled,
    # not on every poll of an already-enabled ceremony. Without this
    # guard a double-click on the final grant would attempt a second
    # insert and fail the UNIQUE (module_id, version) constraint.
    if ceremony.state == CeremonyState.ENABLED and not ceremony.persisted:
        await _persist_install(session, ceremony=ceremony, user=user)
        ceremony.persisted = True
    await session.commit()
    return _ceremony_to_response(ceremony)


@router.get(
    "/install/{ceremony_id}",
    response_model=CeremonyResponse,
)
async def get_install_endpoint(
    ceremony_id: UUID,
    user: User = Depends(current_user),
) -> CeremonyResponse:
    """Read the current state of an in-flight ceremony.

    Auth-gated (any authenticated user) so the install UI can poll
    without admin privileges. The advance endpoint remains admin-only.
    """
    ceremony = get_ceremony(ceremony_id)
    if ceremony is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "ceremony_not_found",
                "message": f"ceremony {ceremony_id} not found",
            },
        )
    return _ceremony_to_response(ceremony)


# ---------------------------------------------------------------------------
# Phase 4 — revoke / update endpoints
# ---------------------------------------------------------------------------
#
# POST /api/modules/{module_id}/revoke   admin-only; disables the
#                                        installed module + revokes
#                                        all per-user grants.
#
# POST /api/modules/{module_id}/update   admin-only; runs the grants
#                                        lifecycle diff. On expansion,
#                                        starts a new trust ceremony
#                                        (re-prompt). On non-expansion,
#                                        updates the row in place.


class UpdateModuleRequest(BaseModel):
    new_manifest: dict[str, Any]
    signature: str | None = None


class UpdateModuleResponse(BaseModel):
    """Outcome of an update attempt.

    Two shapes:
    - ``expansion_detected=True`` → ``ceremony_id`` is populated; the
      caller drives the new trust ceremony via the existing
      /install/{id}/advance endpoint.
    - ``expansion_detected=False`` → row updated directly; no ceremony
      required.
    """

    module_id: str
    new_version: str
    expansion_detected: bool
    expansion_report: dict[str, Any]
    ceremony_id: str | None = None


@router.post(
    "/{module_id}/revoke",
    status_code=status.HTTP_200_OK,
)
async def revoke_module_endpoint(
    module_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Disable an installed module and revoke all per-user grants
    associated with it. Admin-only.

    Disable is per the InstalledModule row's enabled flag (soft).
    Grants for the module's (plugin, *) are deleted hard so future
    require_capability calls fall through to denial.
    """
    require_admin(user, action_label="module revoke")

    installed_rows = (
        await session.scalars(
            select(InstalledModule).where(
                InstalledModule.module_id == module_id,
            )
        )
    ).all()
    if not installed_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "module_not_installed",
                "message": f"module {module_id!r} is not installed",
            },
        )

    revoked_grants = 0
    for row in installed_rows:
        row.enabled = False
        session.add(row)
        # Revoke grants for this module's plugin namespace.
        # The plugin column on grants is the module identity from the
        # caller's perspective; for Phase 2+ installs that should be
        # module_id directly.
        grants = (
            await session.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.plugin == module_id,
                )
            )
        ).all()
        for grant_row in grants:
            await session.delete(grant_row)
            revoked_grants += 1

    from app.core.api import audit

    await audit.log(
        session,
        "module.disabled",
        actor_id=user.id,
        module=module_id,
        resource_type="installed_module",
        resource_id=module_id,
        payload={"revoked_grants": revoked_grants},
    )
    if revoked_grants:
        await audit.log(
            session,
            "module.grant.revoked",
            actor_id=user.id,
            module=module_id,
            resource_type="capability_grant",
            resource_id=module_id,
            payload={"count": revoked_grants},
        )

    await session.commit()
    return {
        "module_id": module_id,
        "disabled_rows": len(installed_rows),
        "revoked_grants": revoked_grants,
    }


@router.post(
    "/{module_id}/update",
    response_model=UpdateModuleResponse,
)
async def update_module_endpoint(
    module_id: str,
    body: UpdateModuleRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> UpdateModuleResponse:
    """Update an installed module to a new manifest version.

    Runs detect_expansion against the previous installed_modules
    permissions_snapshot. If expansion is detected, starts a fresh
    trust ceremony so the user can re-grant. If no expansion, updates
    the row in place without ceremony.

    Admin-only.
    """
    require_admin(user, action_label="module update")

    # Find the most recent installed version.
    from sqlalchemy import desc as _desc

    existing = await session.scalar(
        select(InstalledModule)
        .where(InstalledModule.module_id == module_id)
        .order_by(_desc(InstalledModule.installed_at))
        .limit(1)
    )
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "module_not_installed",
                "message": f"module {module_id!r} is not installed",
            },
        )

    new_manifest = body.new_manifest
    if new_manifest.get("id") != module_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "module_id_mismatch",
                "message": (
                    f"new_manifest.id={new_manifest.get('id')!r} "
                    f"does not match path module_id={module_id!r}"
                ),
            },
        )

    # Validate new manifest.
    is_valid, errors = validate_manifest_v2(new_manifest)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": "invalid_manifest", "validation_errors": errors},
        )

    # Round-2 Reviewer P1#3: enforce dependency resolution on update
    # too. An update can introduce new dependencies (or change
    # version ranges); we resolve them up-front the same way as
    # install does.
    from app.core.dependency_resolver import resolve_dependencies

    resolution = await resolve_dependencies(new_manifest, session=session)
    if not resolution.is_satisfied:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "dependencies_unsatisfied",
                "resolution": resolution.to_dict(),
            },
        )

    from app.core.grants_lifecycle import detect_expansion, requires_reprompt

    report = detect_expansion(
        existing.permissions_snapshot, new_manifest
    )
    if requires_reprompt(report):
        # Start a fresh trust ceremony for the re-grant flow.
        ceremony = await start_ceremony(
            session,
            manifest=new_manifest,
            actor_user_id=user.id,
            signature=body.signature,
        )
        await session.commit()
        return UpdateModuleResponse(
            module_id=module_id,
            new_version=new_manifest.get("version", ""),
            expansion_detected=True,
            expansion_report=report.to_dict(),
            ceremony_id=str(ceremony.id),
        )

    # No expansion — update the row directly.
    card = build_permission_card(new_manifest)
    existing.version = new_manifest.get("version", existing.version)
    existing.manifest_snapshot = new_manifest
    existing.permissions_snapshot = {
        "data_movement": card.data_movement_summary,
        "gates": card.gates,
        "advice_tier_max": card.advice_tier_max,
        "audit_events": card.audit_events,
        "capabilities": card.capabilities,
    }
    session.add(existing)

    from app.core.api import audit

    await audit.log(
        session,
        "module.updated",
        actor_id=user.id,
        module=module_id,
        resource_type="installed_module",
        resource_id=module_id,
        payload={
            "new_version": new_manifest.get("version"),
            "expansion_detected": False,
        },
    )
    await session.commit()
    return UpdateModuleResponse(
        module_id=module_id,
        new_version=new_manifest.get("version", ""),
        expansion_detected=False,
        expansion_report=report.to_dict(),
        ceremony_id=None,
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


