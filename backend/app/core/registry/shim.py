"""v1 → v2 manifest auto-derivation shim.

Existing first-party modules ship a ``module.json`` (v1 plugin-style
schema in ``schemas/module.json``). The registry keeps those modules running while exposing them in the
new v2 catalogue — the shim produces a v2 manifest in memory from
the v1
artefacts so the registry can return a uniform shape.

One derivation path: ``derive_from_module_json(v1_payload)`` produces
a ``kind: workflow`` manifest from the v1 plugin-style module.json
shape (name, version, nav, routes, requires).

It produces a syntactically-valid v2 manifest. It does NOT
guarantee semantic completeness (e.g. inferred ``data_movement`` is a
conservative default). Hand-authored v2 manifests in the reference
module ports replace these shims where the developer can choose the
exact capability declarations.
"""

from __future__ import annotations

from typing import Any



def _conservative_data_movement() -> dict[str, Any]:
    """Default data_movement block for shim-derived manifests.

    Conservative defaults: do not send anything externally. Reference
    modules that need broader posture override these via hand-authored
    v2 manifests.
    """
    return {
        "sends_document_body": False,
        "sends_document_binary": False,
        "sends_matter_metadata": True,
        "external_destinations": [],
        "local_only": True,
    }


def _split_v1_capabilities(declared: list[str]) -> tuple[list[str], list[str]]:
    """Split a v1 capability list into (reads, writes) using the legacy
    vocabulary's naming convention.

    Heuristic: any capability ending in ``.read`` goes to reads;
    ``.write`` to writes; ``model.invoke`` and others fall into writes
    as a conservative default (an unknown capability is more often a
    write than a read).
    """
    reads: list[str] = []
    writes: list[str] = []
    for cap in declared:
        if cap.endswith(".read"):
            reads.append(cap)
        elif cap.endswith(".write"):
            writes.append(cap)
        elif cap == "model.invoke":
            writes.append(cap)
        else:
            writes.append(cap)
    return reads, writes


def derive_from_module_json(payload: dict[str, Any]) -> dict[str, Any]:
    """Produce a v2 manifest from a v1 ``module.json`` payload.

    The v1 ``module.json`` (see ``schemas/module.json``) is plugin-shaped:
    name, version, description, nav, routes, optional requires +
    capabilities. The shim treats the whole plugin as a single
    workflow-kind capability that surfaces in ``matter.workflows``.

    The module-level ``requires`` propagates into the v2 ``requires``
    block.
    """
    name = payload.get("name", "legacy-module")
    declared = payload.get("capabilities") or []
    reads, writes = _split_v1_capabilities(declared)
    v1_requires = payload.get("requires") or {}
    v2_requires: list[dict[str, Any]] = []
    for plugin_ref in v1_requires.get("plugins", []) or []:
        v2_requires.append({"module_id": plugin_ref})

    out: dict[str, Any] = {
        "schema_version": "2.0.0",
        "id": name,
        "name": payload.get("nav", {}).get("label", name),
        "version": payload.get("version", "1.0.0-legacy"),
        "publisher": payload.get("author", "legacy"),
        "visibility": "first_party",
        "runtime": "native",
        "entrypoint": {
            "python_module": f"app.modules.{name.replace('-', '_')}",
            "entry": "router",
        },
        "capabilities": [
            {
                "id": "default",
                "kind": "workflow",
                "scope": "matter",
                "reads": reads,
                "writes": writes,
                # Shim policy: optional by default so the manifest
                # validates without a synthetic provider dependency.
                # Real ports specify required deliberately.
                "model_access": (
                    "optional" if "model.invoke" in declared else "none"
                ),
                "external_network": False,
                "data_movement": _conservative_data_movement(),
                "gates": ["privilege_posture"],
                "ui": {
                    "slot": "matter.workflows",
                    "label": payload.get("nav", {}).get("label", name),
                },
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": [
                    "plugin.invoked",
                    "model.call",
                ],
                "output_lifecycle_target": None,
            }
        ],
        "description": payload.get("description", ""),
        "jurisdictions": [],
        "requires": v2_requires,
    }
    # Only include optional fields when the v1 payload supplied them
    # as strings — v2 schema rejects `null` for these.
    if isinstance(payload.get("homepage"), str):
        out["source_url"] = payload["homepage"]
    if isinstance(payload.get("license"), str):
        out["license"] = payload["license"]
    return out


def auto_derive_v2_from_v1(
    *,
    source_kind: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Public entry point for the shim.

    Parameters
    ----------
    source_kind
        ``"v1_module_json"``.
    payload
        The parsed module.json dict.
    """
    if source_kind == "v1_module_json":
        if payload is None:
            raise ValueError("v1_module_json shim requires payload")
        return derive_from_module_json(payload)
    raise ValueError(f"unknown source_kind: {source_kind!r}")
