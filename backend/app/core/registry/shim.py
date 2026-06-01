"""v1 → v2 manifest auto-derivation shim.

Existing first-party modules ship either a ``module.json`` (v1
plugin-style schema in ``schemas/module.json``) or a SKILL.md
(prompt-only plugin in ``backend/app/modules/<name>/skills/<slug>/SKILL.md``).
The registry keeps those modules running while exposing them in the
new v2 catalogue — the shim produces a v2 manifest in memory from
the v1
artefacts so the registry can return a uniform shape.

Two derivation paths:

1. ``derive_from_skill_md(skill_md_payload, plugin_id, skill_id)``
   produces a single-capability ``kind: skill`` manifest from a parsed
   SKILL.md frontmatter + body bundle.

2. ``derive_from_module_json(v1_payload)`` produces a
   ``kind: workflow`` manifest from the v1 plugin-style module.json
   shape (name, version, nav, routes, requires).

Both paths produce a syntactically-valid v2 manifest. They do NOT
guarantee semantic completeness (e.g. inferred ``data_movement`` is a
conservative default). Hand-authored v2 manifests in the reference
module ports replace these shims where the developer can choose the
exact capability declarations.
"""

from __future__ import annotations

from typing import Any

from app.core.capabilities import CAPABILITY_VOCABULARY


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


def derive_from_skill_md(
    *,
    plugin_id: str,
    skill_id: str,
    name: str,
    description: str,
    declared_capabilities: list[str],
    publisher: str = "legacy",
) -> dict[str, Any]:
    """Produce a v2 manifest from a parsed SKILL.md.

    Heuristics:
    - ``kind`` is always ``skill``.
    - ``scope`` is always ``matter`` (legacy skills always operate
      on a matter).
    - ``runtime`` is ``native``; entrypoint targets the existing
      plugin bridge by python_module path so the runtime can locate
      it without code changes.
    - ``advice_tier_max`` defaults to ``draft_advice`` — the most
      conservative tier that still lets the skill be useful. Reference
      module ports may raise this to ``supervised_legal_advice`` after
      review.
    - ``data_movement`` defaults to local-only.
    """
    reads, writes = _split_v1_capabilities(declared_capabilities)
    return {
        "schema_version": "2.0.0",
        "id": f"{plugin_id}.{skill_id}",
        "name": name,
        "version": "1.0.0-legacy",
        "publisher": publisher,
        "visibility": "first_party",
        "runtime": "native",
        "entrypoint": {
            "python_module": "app.adapters.plugin_bridge",
            "entry": "PluginBridge",
        },
        "capabilities": [
            {
                "id": skill_id,
                "kind": "skill",
                "scope": "matter",
                "reads": reads,
                "writes": writes,
                # Shim default: `optional` even when the legacy
                # capability list includes `model.invoke`. Real
                # ports specify `required` explicitly together with the
                # provider dependency in `requires`. Optional here lets
                # the manifest validate without inventing a synthetic
                # provider dependency for the legacy module.
                "model_access": (
                    "optional" if "model.invoke" in declared_capabilities else "none"
                ),
                "external_network": False,
                "data_movement": _conservative_data_movement(),
                "gates": ["privilege_posture"],
                "ui": {
                    "slot": "matter.workflows",
                    "label": name,
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
        "description": description or f"Legacy SKILL.md: {plugin_id}/{skill_id}",
        "jurisdictions": [],
        "requires": [],
    }


def derive_from_module_json(payload: dict[str, Any]) -> dict[str, Any]:
    """Produce a v2 manifest from a v1 ``module.json`` payload.

    The v1 ``module.json`` (see ``schemas/module.json``) is plugin-shaped:
    name, version, description, nav, routes, optional requires +
    capabilities. The shim treats the whole plugin as a single
    workflow-kind capability that surfaces in ``matter.workflows``.

    Heuristics mirror ``derive_from_skill_md`` but with ``kind:
    workflow`` and the module-level ``requires`` propagated into the
    v2 ``requires`` block.
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
                # Same shim policy as derive_from_skill_md: optional
                # by default so the manifest validates without a
                # synthetic provider dependency. Real ports specify
                # required deliberately.
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
    skill_md: dict[str, Any] | None = None,
    plugin_id: str | None = None,
    skill_id: str | None = None,
) -> dict[str, Any]:
    """Public entry point for the shim.

    Parameters
    ----------
    source_kind
        ``"v1_module_json"`` or ``"v1_skill"``.
    payload
        For ``v1_module_json``: the parsed module.json dict.
    skill_md
        For ``v1_skill``: a dict with at least ``name``, ``description``,
        and ``declared_capabilities`` keys (typically the frontmatter
        from ``_parse_skill_md``).
    plugin_id, skill_id
        For ``v1_skill``: the plugin namespace + skill slug.
    """
    if source_kind == "v1_module_json":
        if payload is None:
            raise ValueError("v1_module_json shim requires payload")
        return derive_from_module_json(payload)
    if source_kind == "v1_skill":
        if not (skill_md and plugin_id and skill_id):
            raise ValueError(
                "v1_skill shim requires skill_md, plugin_id, skill_id"
            )
        declared = skill_md.get("declared_capabilities") or []
        # Filter to legacy v1 vocabulary or it'll fail v2 validation.
        declared = [c for c in declared if c in CAPABILITY_VOCABULARY]
        return derive_from_skill_md(
            plugin_id=plugin_id,
            skill_id=skill_id,
            name=skill_md.get("name", skill_id),
            description=skill_md.get("description", ""),
            declared_capabilities=declared,
        )
    raise ValueError(f"unknown source_kind: {source_kind!r}")
