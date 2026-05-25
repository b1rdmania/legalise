"""Phase 1 runtime — shared substrate-primitive infrastructure.

Used by the three Phase 1 primitives (`core.state_machine`,
`core.matter_context`, `core.advice_boundary`) so the canonical
BlockedPayload shape, audit emission convention, and capability
enforcement path are identical across all three.

Doctrine, locked at HANDOVER_PHASE_1_START.md (commit `186005a`):

- denied capability is represented as ``*.blocked`` with
  ``blocked_reason: "capability_denied"`` in payload
- every transition / context write / advice-boundary decision is
  audited regardless of outcome
- substrate primitives reuse existing ``require_capability`` via
  the ``plugin="core"`` convention (architectural decision #1 in
  PHASE_1_BUILD_PLAN.md)
- Phase 1 emits its own ``<primitive>.<verb>.blocked`` audit row
  *in addition* to the existing ``module.capability.denied`` row
  written by ``require_capability`` (architectural decision #2 in
  PHASE_1_BUILD_PLAN.md)

Public surface (stable for Phase 1 callers):

    from app.core.phase1_runtime import (
        BlockedReason,
        BlockedPayload,
        Phase1Blocked,
        Phase1Failed,
        audit_phase1,
        check_or_block,
    )
"""

from app.core.phase1_runtime.blocked import BlockedPayload, BlockedReason
from app.core.phase1_runtime.audit_emit import audit_phase1
from app.core.phase1_runtime.capability_check import check_or_block
from app.core.phase1_runtime.exceptions import Phase1Blocked, Phase1Failed

__all__ = [
    "BlockedReason",
    "BlockedPayload",
    "Phase1Blocked",
    "Phase1Failed",
    "audit_phase1",
    "check_or_block",
]
