"""Module catalogue + install + lifecycle endpoints.

Two manifest surfaces coexist:

- v1 SKILL.md discovery at PLUGINS_ROOT (read-only view used by older
  clients);
- v2 manifest surface (`/v2`, `/v2/{module_id}`, `/v2/capabilities`)
  read by the current frontend catalogue.

Install + revoke + update + the trust ceremony are admin-gated and emit
the canonical `module.*` audit chain.
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

# Shared DTOs and helper functions for module route groups.

# Schema lookup. The repo-root `schemas/module.json` is the canonical
# location; fall back to the legacy `backend/schemas/module.json` if it
# is ever added there. Loaded once per process.
_REPO_ROOT = Path(__file__).resolve().parents[4]
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


class ValidateManifestRequest(BaseModel):
    manifest: dict


class ManifestValidationError(BaseModel):
    path: str
    message: str


class ValidateManifestResponse(BaseModel):
    valid: bool
    errors: list[ManifestValidationError]


class InstalledModuleOut(BaseModel):
    module_id: str
    version: str
    publisher: str
    visibility: str
    signature_status: str
    capabilities: list[dict[str, Any]] = []
    enabled: bool
    installed_at: str  # ISO-8601
    installed_by_user_id: str | None


class StartInstallRequest(BaseModel):
    """Body for ``POST /api/modules/install``.

    Two source modes:
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
    permissions snapshots are captured here for the grant lifecycle.
    """
    from datetime import datetime, timezone

    manifest = ceremony.manifest
    card = ceremony.permission_card
    # Aggregated permissions for grant-diff comparisons.
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


__all__ = [name for name in globals() if not name.startswith("__")]
