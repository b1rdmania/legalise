"""Grant lifecycle — permission expansion detection.

Phase 4 implementation per docs/handovers/PHASE_4_BUILD_PLAN.md §Step 1.

When a module is updated to a new version, we diff the new manifest's
permission shape against the previously-installed permission shape.
Expansion (e.g. new write capability, higher advice tier, network
flipped on) requires re-prompting the user via the trust ceremony.
Non-expansion updates (e.g. version bump with identical permissions)
can update the installed_modules row directly without ceremony.

Pure-functional diff — no DB writes here. The caller (the update
endpoint in api/modules.py) consumes the ExpansionReport and decides
how to proceed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.advice_boundary.tiers import ADVICE_TIER_FACTUAL_EXTRACTION, tier_rank


# Ordering of model_access strictness — Phase 4 detects increases as
# expansion (none < optional < required < delegated).
_MODEL_ACCESS_ORDER = {
    "none": 0,
    "optional": 1,
    "delegated": 2,
    "required": 3,
}


@dataclass
class ExpansionReport:
    """Structured diff between an old permissions snapshot and a new
    one. Populated by ``detect_expansion``."""

    reads_added: list[str] = field(default_factory=list)
    writes_added: list[str] = field(default_factory=list)
    tier_raised: tuple[str, str] | None = None  # (old_tier, new_tier)
    external_network_added: bool = False
    new_destinations: list[str] = field(default_factory=list)
    new_gates_added: list[str] = field(default_factory=list)
    new_gates_removed: list[str] = field(default_factory=list)
    model_access_raised: tuple[str, str] | None = None

    @property
    def any_expansion(self) -> bool:
        """True if ANY of the expansion dimensions changed."""
        return any(
            [
                bool(self.reads_added),
                bool(self.writes_added),
                self.tier_raised is not None,
                self.external_network_added,
                bool(self.new_destinations),
                bool(self.new_gates_added),
                self.model_access_raised is not None,
            ]
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "reads_added": self.reads_added,
            "writes_added": self.writes_added,
            "tier_raised": (
                {"from": self.tier_raised[0], "to": self.tier_raised[1]}
                if self.tier_raised
                else None
            ),
            "external_network_added": self.external_network_added,
            "new_destinations": self.new_destinations,
            "new_gates_added": self.new_gates_added,
            "new_gates_removed": self.new_gates_removed,
            "model_access_raised": (
                {"from": self.model_access_raised[0], "to": self.model_access_raised[1]}
                if self.model_access_raised
                else None
            ),
            "any_expansion": self.any_expansion,
        }


def _flatten_capability_strings(snapshot: dict, key: str) -> set[str]:
    """Return the union of ``capability[key]`` strings across all
    capabilities in a permissions snapshot."""
    out: set[str] = set()
    for cap in snapshot.get("capabilities") or []:
        for value in cap.get(key) or []:
            if isinstance(value, str):
                out.add(value)
    return out


def _highest_tier(snapshot: dict) -> str:
    """Highest advice_tier_max across the snapshot's capabilities."""
    highest = snapshot.get("advice_tier_max") or ADVICE_TIER_FACTUAL_EXTRACTION
    return highest


def _max_model_access(snapshot: dict) -> str:
    """Most strict model_access across the snapshot."""
    levels = [
        cap.get("model_access", "none")
        for cap in snapshot.get("capabilities") or []
    ]
    if not levels:
        return "none"
    return max(levels, key=lambda v: _MODEL_ACCESS_ORDER.get(v, 0))


def _any_external_network(snapshot: dict) -> bool:
    """True if ANY capability has external_network=True."""
    for cap in snapshot.get("capabilities") or []:
        if cap.get("external_network") is True:
            return True
    return False


def _all_destinations(snapshot: dict) -> set[str]:
    """Union of all external_destinations from data_movement
    summaries + individual capability data_movement blocks."""
    out: set[str] = set()
    # Top-level summary (set by trust_ceremony.build_permission_card).
    summary = snapshot.get("data_movement") or {}
    for d in summary.get("external_destinations") or []:
        if isinstance(d, str):
            out.add(d)
    # Per-capability data_movement (raw manifest shape).
    for cap in snapshot.get("capabilities") or []:
        dm = cap.get("data_movement") or {}
        for d in dm.get("external_destinations") or []:
            if isinstance(d, str):
                out.add(d)
    return out


def _all_gates(snapshot: dict) -> set[str]:
    """Union of gates declared across capabilities OR the top-level
    snapshot gates list."""
    out: set[str] = set()
    for g in snapshot.get("gates") or []:
        if isinstance(g, str):
            out.add(g)
    for cap in snapshot.get("capabilities") or []:
        for g in cap.get("gates") or []:
            if isinstance(g, str):
                out.add(g)
    return out


def detect_expansion(
    old_snapshot: dict[str, Any],
    new_snapshot: dict[str, Any],
) -> ExpansionReport:
    """Diff two permission snapshots and return a structured report.

    Either snapshot can come from ``InstalledModule.permissions_snapshot``
    (the aggregated trust-ceremony output) or from a raw manifest's
    capabilities array. The diff helpers tolerate both shapes.
    """
    old_reads = _flatten_capability_strings(old_snapshot, "reads")
    new_reads = _flatten_capability_strings(new_snapshot, "reads")
    reads_added = sorted(new_reads - old_reads)

    old_writes = _flatten_capability_strings(old_snapshot, "writes")
    new_writes = _flatten_capability_strings(new_snapshot, "writes")
    writes_added = sorted(new_writes - old_writes)

    old_tier = _highest_tier(old_snapshot)
    new_tier = _highest_tier(new_snapshot)
    tier_raised: tuple[str, str] | None = None
    if tier_rank(new_tier) > tier_rank(old_tier):
        tier_raised = (old_tier, new_tier)

    old_network = _any_external_network(old_snapshot)
    new_network = _any_external_network(new_snapshot)
    network_added = new_network and not old_network

    old_dests = _all_destinations(old_snapshot)
    new_dests = _all_destinations(new_snapshot)
    new_destinations = sorted(new_dests - old_dests)

    old_gates = _all_gates(old_snapshot)
    new_gates = _all_gates(new_snapshot)
    new_gates_added = sorted(new_gates - old_gates)
    new_gates_removed = sorted(old_gates - new_gates)

    old_ma = _max_model_access(old_snapshot)
    new_ma = _max_model_access(new_snapshot)
    model_access_raised: tuple[str, str] | None = None
    if _MODEL_ACCESS_ORDER.get(new_ma, 0) > _MODEL_ACCESS_ORDER.get(old_ma, 0):
        model_access_raised = (old_ma, new_ma)

    return ExpansionReport(
        reads_added=reads_added,
        writes_added=writes_added,
        tier_raised=tier_raised,
        external_network_added=network_added,
        new_destinations=new_destinations,
        new_gates_added=new_gates_added,
        new_gates_removed=new_gates_removed,
        model_access_raised=model_access_raised,
    )


def requires_reprompt(report: ExpansionReport) -> bool:
    """True if the expansion is material enough to require a fresh
    trust ceremony.

    Phase 4 policy: any expansion at all triggers re-prompt. Phase 5+
    may relax this for low-risk dimensions (e.g. gate removal alone
    might be OK; new audit_events alone is fine).
    """
    return report.any_expansion


__all__ = [
    "ExpansionReport",
    "detect_expansion",
    "requires_reprompt",
]
