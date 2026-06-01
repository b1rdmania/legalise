"""Module dependency resolver — semver constraints + cycle detection.

When a module is installed, its ``requires`` array lists other
modules it depends on with optional semver version constraints. The
resolver:

1. Walks the `requires` array
2. For each dependency, looks for a satisfying version in:
   - already-installed modules (``installed_modules`` table)
   - discoverable modules (``discover_modules()``)
3. Reports any unresolvable dependencies + any cycles in the
   transitive dependency graph

This resolver does NOT auto-install transitive dependencies — the
admin installs each module deliberately. The resolver just reports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from packaging.specifiers import SpecifierSet
from packaging.version import InvalidVersion, Version
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.registry import discover_modules
from app.core.registry.shim import auto_derive_v2_from_v1
from app.models import InstalledModule


@dataclass
class MissingDependency:
    """One required module that cannot be satisfied."""

    module_id: str
    required_version_spec: str
    available_versions: list[str] = field(default_factory=list)
    reason: str = "not_found"  # not_found | version_unsatisfied | invalid_spec


@dataclass
class ResolutionResult:
    """Outcome of resolving a manifest's requires array."""

    is_satisfied: bool
    missing: list[MissingDependency] = field(default_factory=list)
    cycles: list[list[str]] = field(default_factory=list)
    satisfied: list[tuple[str, str]] = field(default_factory=list)  # (module_id, version)

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_satisfied": self.is_satisfied,
            "missing": [
                {
                    "module_id": m.module_id,
                    "required_version_spec": m.required_version_spec,
                    "available_versions": m.available_versions,
                    "reason": m.reason,
                }
                for m in self.missing
            ],
            "cycles": self.cycles,
            "satisfied": [
                {"module_id": mid, "version": v} for mid, v in self.satisfied
            ],
        }


def _matches_spec(version_str: str, spec: str) -> bool:
    """True if version_str satisfies the SpecifierSet spec."""
    if not spec:
        return True  # No constraint → any version satisfies.
    try:
        version = Version(version_str)
        spec_set = SpecifierSet(spec)
    except (InvalidVersion, ValueError):
        return False
    return version in spec_set


async def _installed_versions(
    session: AsyncSession, module_id: str
) -> list[str]:
    """Return all installed versions for module_id."""
    rows = (
        await session.scalars(
            select(InstalledModule.version).where(
                InstalledModule.module_id == module_id,
            )
        )
    ).all()
    return list(rows)


def _discoverable_versions(module_id: str) -> list[str]:
    """Return all discoverable versions for module_id (v2 registry
    plus v1 shim)."""
    versions: list[str] = []
    for entry in discover_modules():
        if entry.module_id != module_id:
            continue
        try:
            if entry.source_kind == "v2":
                manifest = entry.payload
            else:
                manifest = auto_derive_v2_from_v1(
                    source_kind=entry.source_kind,
                    payload=(
                        entry.payload
                        if entry.source_kind == "v1_module_json"
                        else None
                    ),
                    skill_md=(
                        entry.payload
                        if entry.source_kind == "v1_skill"
                        else None
                    ),
                    plugin_id=entry.extra.get("plugin_id"),
                    skill_id=entry.extra.get("skill_id"),
                )
        except ValueError:
            continue
        v = manifest.get("version")
        if isinstance(v, str):
            versions.append(v)
    return versions


def _build_graph_for_cycle_check(
    manifest: dict[str, Any],
) -> dict[str, list[str]]:
    """Build a simple adjacency map from the manifest plus any
    transitively-discoverable manifests' requires arrays.

    We build a shallow graph: the under-test manifest's requires +
    each direct dependency's own requires (from discover_modules).
    May walk deeper later.
    """
    root_id = manifest.get("id", "<root>")
    graph: dict[str, list[str]] = {root_id: []}
    direct_deps = [
        r.get("module_id")
        for r in (manifest.get("requires") or [])
        if isinstance(r, dict) and isinstance(r.get("module_id"), str)
    ]
    graph[root_id] = direct_deps

    # Build edges for each direct dep from the discovered module.
    for entry in discover_modules():
        if entry.module_id not in direct_deps and entry.module_id != root_id:
            continue
        try:
            if entry.source_kind == "v2":
                dep_manifest = entry.payload
            else:
                dep_manifest = auto_derive_v2_from_v1(
                    source_kind=entry.source_kind,
                    payload=(
                        entry.payload
                        if entry.source_kind == "v1_module_json"
                        else None
                    ),
                    skill_md=(
                        entry.payload
                        if entry.source_kind == "v1_skill"
                        else None
                    ),
                    plugin_id=entry.extra.get("plugin_id"),
                    skill_id=entry.extra.get("skill_id"),
                )
        except ValueError:
            continue
        dep_deps = [
            r.get("module_id")
            for r in (dep_manifest.get("requires") or [])
            if isinstance(r, dict) and isinstance(r.get("module_id"), str)
        ]
        graph[entry.module_id] = dep_deps

    return graph


def _detect_cycles(graph: dict[str, list[str]]) -> list[list[str]]:
    """DFS-based cycle detection. Returns each cycle as a list of
    module ids (in cycle order)."""
    cycles: list[list[str]] = []
    visiting: set[str] = set()
    visited: set[str] = set()
    stack: list[str] = []

    def dfs(node: str) -> None:
        if node in visited:
            return
        if node in visiting:
            # Cycle: extract the slice of stack from node onward.
            try:
                idx = stack.index(node)
                cycles.append(stack[idx:] + [node])
            except ValueError:
                cycles.append([node])
            return
        visiting.add(node)
        stack.append(node)
        for neighbour in graph.get(node, []):
            dfs(neighbour)
        stack.pop()
        visiting.discard(node)
        visited.add(node)

    for node in list(graph.keys()):
        dfs(node)
    # De-duplicate identical cycles (DFS may discover the same cycle
    # multiple times from different entry points).
    seen: set[tuple[str, ...]] = set()
    deduped: list[list[str]] = []
    for c in cycles:
        key = tuple(sorted(c))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    return deduped


async def resolve_dependencies(
    manifest: dict[str, Any],
    *,
    session: AsyncSession,
) -> ResolutionResult:
    """Resolve a manifest's ``requires`` array against installed +
    discoverable modules.

    Returns a ResolutionResult. ``is_satisfied`` is True iff every
    dependency was satisfied AND no cycles were detected.
    """
    missing: list[MissingDependency] = []
    satisfied: list[tuple[str, str]] = []

    for req in manifest.get("requires") or []:
        if not isinstance(req, dict):
            continue
        module_id = req.get("module_id")
        if not isinstance(module_id, str):
            continue
        spec = req.get("version", "") or ""

        # Installed first.
        installed = await _installed_versions(session, module_id)
        discoverable = _discoverable_versions(module_id)
        all_versions = sorted(set(installed) | set(discoverable))

        if not all_versions:
            missing.append(
                MissingDependency(
                    module_id=module_id,
                    required_version_spec=spec,
                    available_versions=[],
                    reason="not_found",
                )
            )
            continue

        matching = [v for v in all_versions if _matches_spec(v, spec)]
        if not matching:
            missing.append(
                MissingDependency(
                    module_id=module_id,
                    required_version_spec=spec,
                    available_versions=all_versions,
                    reason="version_unsatisfied",
                )
            )
            continue

        # Resolved — pick the highest matching version.
        try:
            best = max(matching, key=lambda v: Version(v))
        except InvalidVersion:
            best = matching[-1]
        satisfied.append((module_id, best))

    graph = _build_graph_for_cycle_check(manifest)
    cycles = _detect_cycles(graph)

    is_satisfied = (not missing) and (not cycles)
    return ResolutionResult(
        is_satisfied=is_satisfied,
        missing=missing,
        cycles=cycles,
        satisfied=satisfied,
    )


__all__ = [
    "MissingDependency",
    "ResolutionResult",
    "resolve_dependencies",
]
