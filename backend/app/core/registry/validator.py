"""v2 manifest validator.

Two layers:
1. JSON Schema validation against ``schemas/module.v2.json`` (Draft 2020-12).
2. Code-level checks that JSON Schema cannot express cleanly:
   - every capability ``reads`` / ``writes`` entry is a valid
     capability string (legacy v1 or v2 grammar)
   - every ``ui.slot`` value is in the UISlotRegistry
   - ``kind: gate`` capabilities cannot themselves declare gates
   - ``external_network: true`` requires ``data_movement.external_destinations``
   - ``model_access: required`` requires the manifest's capabilities
     to include at least one capability of ``kind: provider`` OR a
     dependency-declared provider via ``requires``

Per docs/handovers/PHASE_2_BUILD_PLAN.md §Step 3 and
docs/architecture/MANIFEST_V2_SCHEMA.md §Validation Rules.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from app.core.capabilities import is_valid_capability_string
from app.core.registry.slots import UISlotRegistry


class InvalidManifestError(ValueError):
    """Raised when a v2 manifest fails validation. ``errors`` lists the
    specific violations so callers can render a structured response."""

    def __init__(self, errors: list[dict[str, Any]]) -> None:
        self.errors = errors
        message = "; ".join(
            f"{e.get('path', '/')}: {e.get('message', 'invalid')}"
            for e in errors
        )
        super().__init__(message or "manifest invalid")


# Locate ``schemas/module.v2.json`` — single source of truth. Local
# development runs from the repo root, while the Fly image is built from
# ``backend/`` and only packages ``backend/schemas``.
_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCHEMA_CANDIDATES = (
    _REPO_ROOT / "schemas" / "module.v2.json",
    _BACKEND_ROOT / "schemas" / "module.v2.json",
)


@lru_cache(maxsize=1)
def _v2_schema() -> dict:
    """Load the v2 schema once per process."""
    for candidate in _SCHEMA_CANDIDATES:
        if candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    candidates = ", ".join(str(path) for path in _SCHEMA_CANDIDATES)
    raise FileNotFoundError(
        f"schemas/module.v2.json not found in any of: {candidates}; "
        "Phase 2 cannot validate manifests without it"
    )


def _schema_errors(payload: dict) -> list[dict[str, Any]]:
    """JSON Schema validation pass. Returns a list of {path, message}
    error dicts (empty on success)."""
    validator = Draft202012Validator(_v2_schema())
    errors: list[dict[str, Any]] = []
    for err in validator.iter_errors(payload):
        path = "/" + "/".join(str(p) for p in err.absolute_path)
        errors.append({"path": path, "message": err.message})
    return errors


def _code_level_errors(payload: dict) -> list[dict[str, Any]]:
    """Code-level checks the JSON Schema cannot express cleanly."""
    errors: list[dict[str, Any]] = []
    capabilities = payload.get("capabilities") or []
    has_provider_capability = any(
        c.get("kind") == "provider" for c in capabilities
    )

    for idx, cap in enumerate(capabilities):
        cap_path = f"/capabilities/{idx}"
        cap_id = cap.get("id", "<unknown>")

        # reads + writes must all be valid capability strings.
        for action_key in ("reads", "writes"):
            values = cap.get(action_key) or []
            for jdx, value in enumerate(values):
                if not is_valid_capability_string(value):
                    errors.append(
                        {
                            "path": f"{cap_path}/{action_key}/{jdx}",
                            "message": (
                                f"capability {cap_id!r} declares an invalid "
                                f"{action_key}-string: {value!r}"
                            ),
                        }
                    )

        # ui.slot must be a known slot.
        ui = cap.get("ui") or {}
        slot = ui.get("slot")
        if slot is not None and not UISlotRegistry.is_known(slot):
            errors.append(
                {
                    "path": f"{cap_path}/ui/slot",
                    "message": (
                        f"capability {cap_id!r} declares unknown ui.slot "
                        f"{slot!r}; valid slots: {UISlotRegistry.all_slots()}"
                    ),
                }
            )

        # kind: gate cannot itself declare gates.
        if cap.get("kind") == "gate" and (cap.get("gates") or []):
            errors.append(
                {
                    "path": f"{cap_path}/gates",
                    "message": (
                        f"capability {cap_id!r} is kind=gate and cannot itself "
                        "declare gates (a gate cannot be gated)"
                    ),
                }
            )

        # external_network: true requires data_movement.external_destinations.
        if cap.get("external_network") is True:
            data_movement = cap.get("data_movement") or {}
            destinations = data_movement.get("external_destinations") or []
            if not destinations:
                errors.append(
                    {
                        "path": f"{cap_path}/data_movement/external_destinations",
                        "message": (
                            f"capability {cap_id!r} declares external_network=true "
                            "but data_movement.external_destinations is empty"
                        ),
                    }
                )

        # model_access: required needs a provider capability OR a
        # provider dependency declared in module-level requires.
        if cap.get("model_access") == "required":
            requires = payload.get("requires") or []
            has_provider_dep = any(
                r.get("capability") == "provider"
                or "provider" in (r.get("module_id") or "").lower()
                for r in requires
            )
            if not has_provider_capability and not has_provider_dep:
                errors.append(
                    {
                        "path": f"{cap_path}/model_access",
                        "message": (
                            f"capability {cap_id!r} declares model_access=required "
                            "but the manifest declares no provider capability "
                            "and no provider dependency in requires"
                        ),
                    }
                )

    return errors


def validate_manifest_v2(payload: dict) -> tuple[bool, list[dict[str, Any]]]:
    """Validate a manifest payload against the v2 schema + code-level
    rules.

    Returns ``(is_valid, errors)``. ``errors`` is a list of
    ``{"path": "/...", "message": "..."}`` dicts.
    """
    errors = _schema_errors(payload)
    # Only run code-level checks if the schema validates — otherwise
    # the structural assumptions of the code checks may not hold.
    if not errors:
        errors.extend(_code_level_errors(payload))
    return (not errors, errors)


def assert_manifest_v2(payload: dict) -> None:
    """Raise ``InvalidManifestError`` if the payload fails v2
    validation."""
    is_valid, errors = validate_manifest_v2(payload)
    if not is_valid:
        raise InvalidManifestError(errors)
