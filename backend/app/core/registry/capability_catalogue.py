"""Capability catalogue — flat list of capabilities declared across
all installed modules.

Used by:
- Phase 4 grant-lifecycle: enumerates known capabilities for snapshot
  storage.
- Phase 12 frontend: renders the workspace-admin grant UI.
- Tests + admin tooling that need a single source of truth for what's
  declared.

The catalogue runs every discovered module through the v1 → v2 shim
where needed so the output is uniform across v1 and v2 sources.

Per docs/handovers/PHASE_2_BUILD_PLAN.md §Step 3.
"""

from __future__ import annotations

from typing import Any

from app.core.registry.discovery import DiscoveredModule, discover_modules
from app.core.registry.shim import auto_derive_v2_from_v1
from app.core.registry.validator import validate_manifest_v2


def _to_v2(entry: DiscoveredModule) -> dict[str, Any]:
    """Return the v2 manifest payload for a discovered module — via
    the shim for v1 sources."""
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
    raise ValueError(f"unknown source_kind: {entry.source_kind!r}")


def list_capabilities(*, include_invalid: bool = False) -> list[dict[str, Any]]:
    """Return one entry per declared capability across all discovered
    modules, with module attribution.

    Shape::

        [
            {
                "module_id": "legalise-intake",
                "module_version": "1.0.0",
                "publisher": "legalise",
                "visibility": "first_party",
                "capability_id": "default",
                "kind": "workflow",
                "scope": "matter",
                "reads": [...],
                "writes": [...],
                "model_access": "required",
                "external_network": false,
                "advice_tier_max": "draft_advice",
                "ui_slot": "matter.workflows",
            },
            ...
        ]
    """
    out: list[dict[str, Any]] = []
    for entry in discover_modules():
        try:
            manifest = _to_v2(entry)
        except ValueError:
            continue
        # Round-2 Reviewer P2 fix: skip manifests that fail v2
        # validation so the catalogue cannot expose ungrantable
        # capabilities. Phase 4 grant lifecycle relies on every
        # entry being a real grant target; Phase 12 frontend renders
        # the grant UI from this list. Invalid manifests must not
        # leak into either.
        #
        # ``include_invalid=True`` is a debug/admin escape hatch.
        is_valid, _errors = validate_manifest_v2(manifest)
        if not is_valid and not include_invalid:
            continue
        module_id = manifest.get("id") or entry.module_id
        module_version = manifest.get("version")
        publisher = manifest.get("publisher")
        visibility = manifest.get("visibility")
        for cap in manifest.get("capabilities") or []:
            out.append(
                {
                    "module_id": module_id,
                    "module_version": module_version,
                    "publisher": publisher,
                    "visibility": visibility,
                    "capability_id": cap.get("id"),
                    "kind": cap.get("kind"),
                    "scope": cap.get("scope"),
                    "reads": list(cap.get("reads") or []),
                    "writes": list(cap.get("writes") or []),
                    "model_access": cap.get("model_access"),
                    "external_network": cap.get("external_network"),
                    "advice_tier_max": cap.get("advice_tier_max"),
                    "ui_slot": (cap.get("ui") or {}).get("slot"),
                    "manifest_valid": is_valid,
                }
            )
    return out
