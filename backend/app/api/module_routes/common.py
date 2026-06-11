"""Module catalogue + install + lifecycle endpoints.

One manifest surface: the v2 registry (`/v2`, `/v2/{module_id}`,
`/v2/capabilities`) read by the frontend catalogue. Imported skills
(Lawve, GitHub) install as `installed_modules` rows with prompt-runtime
manifests.

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


class V2ManifestEntry(BaseModel):
    """One discovered module in its v2 shape, with provenance info."""

    module_id: str
    source_kind: str  # "v2" | "v1_module_json"
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
    name: str | None = None
    version: str
    publisher: str
    visibility: str
    signature_status: str
    capabilities: list[dict[str, Any]] = []
    enabled: bool
    installed_at: str  # ISO-8601
    installed_by_user_id: str | None
    # Manifest source_url captured at install (pinned-SHA provenance);
    # "<inline>" for manifests installed without a source.
    install_path: str | None = None


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
