"""Phase 2 — registry tests.

Covers discovery, v1 → v2 shim, validator integration, UI slot
registry, and capability catalogue per
``backend/app/core/registry/``.

Most tests are pure-unit (no DB). The discovery test exercises the
real filesystem walk against the live plugin checkout if available.
"""

from __future__ import annotations

import pytest

from app.core.registry import (
    UISlotRegistry,
    UnknownUISlotError,
    auto_derive_v2_from_v1,
    discover_modules,
    list_capabilities,
    validate_manifest_v2,
)


# ---------------------------------------------------------------------------
# UI slot registry
# ---------------------------------------------------------------------------


def test_ui_slot_registry_contains_canonical_slots() -> None:
    expected = {
        "matter.workflows",
        "matter.documents.actions",
        "matter.chronology.augment",
        "matter.memory.augment",
        "matter.parties.actions",
        "assistant.tools",
        "gate.interruption",
        "intake.module",
        "output.lifecycle.action",
    }
    assert UISlotRegistry.SLOTS == frozenset(expected)


def test_ui_slot_registry_is_known() -> None:
    assert UISlotRegistry.is_known("matter.workflows")
    assert not UISlotRegistry.is_known("matter.invented_slot")


def test_ui_slot_registry_assert_raises() -> None:
    with pytest.raises(UnknownUISlotError):
        UISlotRegistry.assert_known("matter.invented_slot")
    # No raise.
    UISlotRegistry.assert_known("matter.workflows")


# ---------------------------------------------------------------------------
# v1 → v2 shim
# ---------------------------------------------------------------------------


def test_shim_from_module_json_produces_valid_v2() -> None:
    v2 = auto_derive_v2_from_v1(
        source_kind="v1_module_json",
        payload={
            "name": "legacy-foo",
            "version": "0.1.0",
            "description": "A legacy plugin",
            "nav": {"label": "Foo", "order": 50},
            "routes": {
                "backend_prefix": "/api/modules/foo",
                "frontend_route": "/foo",
            },
            "capabilities": ["matter.read", "document.body.read"],
        },
    )
    is_valid, errors = validate_manifest_v2(v2)
    assert is_valid, errors
    assert v2["capabilities"][0]["kind"] == "workflow"


def test_shim_only_includes_optional_strings_when_present() -> None:
    """source_url and license must only appear when v1 supplied a
    string value. v2 schema rejects null for these fields."""
    v2 = auto_derive_v2_from_v1(
        source_kind="v1_module_json",
        payload={
            "name": "foo",
            "version": "0.1.0",
            "description": "...",
            "nav": {"label": "Foo", "order": 50},
            "routes": {
                "backend_prefix": "/api/modules/foo",
                "frontend_route": "/foo",
            },
            "capabilities": [],
            # homepage + license intentionally absent
        },
    )
    assert "source_url" not in v2
    assert "license" not in v2


def test_shim_invalid_source_kind_raises() -> None:
    with pytest.raises(ValueError, match="unknown source_kind"):
        auto_derive_v2_from_v1(source_kind="not_a_kind")


# ---------------------------------------------------------------------------
# Validator integration
# ---------------------------------------------------------------------------


def test_validator_rejects_unknown_ui_slot() -> None:
    """Verify the code-level UI slot check fires.

    Starts from a shim-derived v2 manifest, then
    mutates ``ui.slot`` to an unknown value. Schema validation
    passes (no enum on ui.slot at JSON Schema level), so the
    code-level check in ``_code_level_errors`` runs and rejects."""
    m = auto_derive_v2_from_v1(
        source_kind="v1_module_json",
        payload={
            "name": "test-plugin",
            "version": "0.1.0",
            "description": "...",
            "nav": {"label": "Test", "order": 50},
            "routes": {
                "backend_prefix": "/api/modules/test-plugin",
                "frontend_route": "/test-plugin",
            },
            "capabilities": [],
        },
    )
    m["capabilities"][0]["ui"]["slot"] = "matter.invented_slot"
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid, f"expected rejection; got {errors}"
    assert any("ui/slot" in e["path"] for e in errors), errors


# ---------------------------------------------------------------------------
# Discovery + capability catalogue
# ---------------------------------------------------------------------------


def test_discovery_returns_some_modules() -> None:
    """Discovery walks backend/app/modules + examples/modules. The
    list may be empty in a stripped checkout — just verify the
    return type."""
    entries = discover_modules()
    assert isinstance(entries, list)


def test_list_capabilities_returns_list_of_dicts() -> None:
    caps = list_capabilities()
    assert isinstance(caps, list)
    for cap in caps:
        assert "module_id" in cap
        assert "capability_id" in cap
        assert "kind" in cap
        assert "scope" in cap
        assert "reads" in cap
        assert "writes" in cap
