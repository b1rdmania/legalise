"""Phase 2 module registry.

Discovers Legalise modules across declared paths, validates manifests
(v1 legacy or v2 capability declaration), runs the v1 → v2
auto-derivation shim where needed, and exposes the capability
catalogue.

Per docs/handovers/PHASE_2_BUILD_PLAN.md.

Public surface (stable for Phase 2 callers):

    from app.core.registry import (
        DiscoveredModule,
        InvalidManifestError,
        ManifestNotFoundError,
        UnknownUISlotError,
        UISlotRegistry,
        auto_derive_v2_from_v1,
        discover_modules,
        list_capabilities,
        load_manifest,
        validate_manifest_v2,
    )

Phase 2 does NOT itself enforce v2 manifest invariants on the legacy
v1 modules currently in ``backend/app/modules/`` — Phase 7-9 ports
them deliberately. The shim produces a v2 manifest in memory so v1
modules surface in the v2 catalogue without code changes.
"""

from app.core.registry.discovery import (
    DiscoveredModule,
    ManifestNotFoundError,
    discover_modules,
    load_manifest,
)
from app.core.registry.validator import (
    InvalidManifestError,
    validate_manifest_v2,
)
from app.core.registry.shim import auto_derive_v2_from_v1
from app.core.registry.slots import UISlotRegistry, UnknownUISlotError
from app.core.registry.capability_catalogue import list_capabilities

__all__ = [
    "DiscoveredModule",
    "InvalidManifestError",
    "ManifestNotFoundError",
    "UnknownUISlotError",
    "UISlotRegistry",
    "auto_derive_v2_from_v1",
    "discover_modules",
    "list_capabilities",
    "load_manifest",
    "validate_manifest_v2",
]
