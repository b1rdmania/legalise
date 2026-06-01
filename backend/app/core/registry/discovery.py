"""Module discovery — walks declared paths and surfaces manifests.

Sources discovered:

1. ``backend/app/modules/<name>/`` — first-party native modules.
   Discovery looks for an optional ``legalise.module.json`` (v2) at
   the root; if absent, the directory is treated as a v1 plugin-style
   collection and the existing ``schemas/module.json`` (v1) is used.
2. ``examples/modules/<category>/<name>/`` — reference + connector
   modules (e.g. ``examples/modules/reference/hello-matter/``).
3. The configured ``settings.plugins_root`` (typically
   ``/plugins`` inside the container) — the external
   claude-for-uk-legal checkout that ships SKILL.md files. The
   shim auto-derives v2 manifests for these.

Returns ``DiscoveredModule`` records with the source manifest kind so
callers can route to either the v2 validator directly or through the
v1 → v2 shim.

Per docs/handovers/PHASE_2_BUILD_PLAN.md §Step 3.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import frontmatter

from app.core.config import settings


class ManifestNotFoundError(LookupError):
    """Raised when ``load_manifest`` cannot locate a manifest for the
    requested module id."""


@dataclass(frozen=True)
class DiscoveredModule:
    """One discovered module + the manifest source.

    Attributes
    ----------
    module_id
        Stable id used to look this module up.
    manifest_path
        Absolute path to the file that yielded the manifest payload.
    source_kind
        ``"v2"`` (legalise.module.json), ``"v1_module_json"`` (legacy
        module.json), or ``"v1_skill"`` (SKILL.md only).
    payload
        For v2: the parsed JSON. For v1_module_json: parsed JSON. For
        v1_skill: a dict synthesised from the SKILL.md frontmatter
        with ``name``, ``description``, ``declared_capabilities`` keys.
    extra
        Source-specific metadata (e.g. ``plugin_id``, ``skill_id`` for
        v1_skill).
    """

    module_id: str
    manifest_path: Path
    source_kind: str  # "v2" | "v1_module_json" | "v1_skill"
    payload: dict[str, Any]
    extra: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Discovery paths
# ---------------------------------------------------------------------------


def _repo_root() -> Path:
    """Resolve the repo root (parent of ``backend/``)."""
    return Path(__file__).resolve().parents[4]


def _discovery_paths() -> list[Path]:
    """Ordered list of paths to scan. Earlier paths take priority on
    duplicate module ids."""
    root = _repo_root()
    paths = [
        root / "backend" / "app" / "modules",
        root / "examples" / "modules",
    ]
    plugins_root = Path(settings.plugins_root) if settings.plugins_root else None
    if plugins_root and plugins_root.exists():
        paths.append(plugins_root)
    return [p for p in paths if p.exists()]


# ---------------------------------------------------------------------------
# Per-path discovery helpers
# ---------------------------------------------------------------------------


def _scan_legalise_module_json(root: Path) -> list[DiscoveredModule]:
    """Look for ``legalise.module.json`` (v2) in subdirs of ``root``."""
    out: list[DiscoveredModule] = []
    for candidate in root.rglob("legalise.module.json"):
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        module_id = payload.get("id") or candidate.parent.name
        out.append(
            DiscoveredModule(
                module_id=module_id,
                manifest_path=candidate,
                source_kind="v2",
                payload=payload,
            )
        )
    return out


def _scan_v1_module_json(root: Path) -> list[DiscoveredModule]:
    """Look for v1 ``module.json`` files in subdirs of ``root``.

    Skips files that are actually v2 (those use ``legalise.module.json``
    so collision is rare, but a v1 ``module.json`` next to a v2 file
    would be redundant — the v2 wins in that case via the caller's
    de-duplication).
    """
    out: list[DiscoveredModule] = []
    for candidate in root.rglob("module.json"):
        # Skip JSON Schema files (e.g. /schemas/module.json).
        if candidate.parts and candidate.parts[-2] == "schemas":
            continue
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        # v1 module.json has ``name`` + ``routes``; if those are absent
        # this is not a v1 manifest.
        if "name" not in payload or "routes" not in payload:
            continue
        out.append(
            DiscoveredModule(
                module_id=payload.get("name", candidate.parent.name),
                manifest_path=candidate,
                source_kind="v1_module_json",
                payload=payload,
            )
        )
    return out


def _scan_skill_md(root: Path) -> list[DiscoveredModule]:
    """Look for SKILL.md files. Each SKILL.md is a single-skill module
    in the v1 plugin layout: ``<plugin>/skills/<slug>/SKILL.md``.

    Round-2 Reviewer P1 fix: this used to call
    ``_parse_skill_md(Path)`` and unpack the result as a tuple — both
    wrong (``_parse_skill_md`` expects file text, returns a
    ``SkillManifest`` dataclass), and the broad ``except Exception:
    continue`` silently dropped every SKILL.md from the v2 catalogue.

    Current behaviour: read the file text, parse the frontmatter with
    ``frontmatter.loads`` directly so we can access the full metadata
    dict (the SkillManifest dataclass doesn't expose
    ``capabilities``). Exception handling is narrowed: malformed
    YAML or unreadable file logs and skips; everything else bubbles.
    """
    out: list[DiscoveredModule] = []
    for candidate in root.rglob("SKILL.md"):
        try:
            parts = candidate.relative_to(root).parts
        except ValueError:
            continue
        # Expect <plugin>/skills/<slug>/SKILL.md.
        if len(parts) < 4 or parts[-3] != "skills" or parts[-1] != "SKILL.md":
            continue
        plugin_id = parts[-4]
        skill_id = parts[-2]
        try:
            text = candidate.read_text(encoding="utf-8")
        except OSError:
            continue
        if not text.startswith("---"):
            # SKILL.md must start with YAML frontmatter; if it doesn't,
            # treat as broken and skip silently (caller behaviour
            # before, but now narrowed to the actual structural check).
            continue
        try:
            post = frontmatter.loads(text)
        except Exception:
            # Malformed YAML — skip rather than crash the whole
            # discovery walk.
            continue
        metadata: dict[str, Any] = post.metadata or {}
        # Conservative declared-capabilities extraction. SKILL.md
        # frontmatter conventionally has ``capabilities`` or
        # ``declared_capabilities``.
        declared: list[str] = []
        raw_caps = metadata.get("capabilities")
        if isinstance(raw_caps, list):
            declared = [c for c in raw_caps if isinstance(c, str)]
        else:
            raw_declared = metadata.get("declared_capabilities")
            if isinstance(raw_declared, list):
                declared = [c for c in raw_declared if isinstance(c, str)]
        skill_payload = {
            "name": str(metadata.get("name", skill_id)),
            "description": str(metadata.get("description", "") or ""),
            "declared_capabilities": declared,
        }
        out.append(
            DiscoveredModule(
                module_id=f"{plugin_id}.{skill_id}",
                manifest_path=candidate,
                source_kind="v1_skill",
                payload=skill_payload,
                extra={"plugin_id": plugin_id, "skill_id": skill_id},
            )
        )
    return out


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------


def discover_modules() -> list[DiscoveredModule]:
    """Scan all declared paths and return every discovered module.

    De-duplicates by ``module_id``: if multiple sources surface the
    same id, the earliest-scanned path wins (so a hand-authored v2
    manifest in ``backend/app/modules/`` overrides a shim-derived
    version from the SKILL.md checkout).
    """
    seen: dict[str, DiscoveredModule] = {}
    for path in _discovery_paths():
        for finder in (_scan_legalise_module_json, _scan_v1_module_json, _scan_skill_md):
            for entry in finder(path):
                if entry.module_id in seen:
                    continue
                seen[entry.module_id] = entry
    return list(seen.values())


def load_manifest(module_id: str) -> DiscoveredModule:
    """Load a single module by id. Raises ``ManifestNotFoundError`` if
    no matching module is discovered."""
    for entry in discover_modules():
        if entry.module_id == module_id:
            return entry
    raise ManifestNotFoundError(f"module {module_id!r} not found")
