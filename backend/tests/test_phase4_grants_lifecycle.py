"""Phase 4 — grants lifecycle (permission expansion detection) tests."""

from __future__ import annotations

import pytest

from app.core.grants_lifecycle import (
    ExpansionReport,
    detect_expansion,
    requires_reprompt,
)


def _snapshot(
    *,
    reads=None,
    writes=None,
    advice_tier_max="draft_advice",
    external_network=False,
    destinations=None,
    gates=None,
    model_access="none",
) -> dict:
    return {
        "advice_tier_max": advice_tier_max,
        "data_movement": {
            "external_destinations": destinations or [],
        },
        "gates": gates or [],
        "capabilities": [
            {
                "id": "default",
                "kind": "skill",
                "scope": "matter",
                "reads": reads or [],
                "writes": writes or [],
                "model_access": model_access,
                "external_network": external_network,
                "data_movement": {
                    "external_destinations": destinations or [],
                },
                "gates": gates or [],
                "advice_tier_max": advice_tier_max,
            }
        ],
    }


def test_identical_snapshots_no_expansion() -> None:
    a = _snapshot(reads=["matter.read"], writes=["citation.write"])
    b = _snapshot(reads=["matter.read"], writes=["citation.write"])
    report = detect_expansion(a, b)
    assert report.any_expansion is False
    assert requires_reprompt(report) is False


def test_new_read_capability_is_expansion() -> None:
    old = _snapshot(reads=["matter.read"])
    new = _snapshot(reads=["matter.read", "document.body.read"])
    report = detect_expansion(old, new)
    assert "document.body.read" in report.reads_added
    assert requires_reprompt(report)


def test_new_write_capability_is_expansion() -> None:
    old = _snapshot(writes=[])
    new = _snapshot(writes=["citation.write"])
    report = detect_expansion(old, new)
    assert "citation.write" in report.writes_added
    assert requires_reprompt(report)


def test_tier_raise_is_expansion() -> None:
    old = _snapshot(advice_tier_max="draft_advice")
    new = _snapshot(advice_tier_max="supervised_legal_advice")
    report = detect_expansion(old, new)
    assert report.tier_raised == ("draft_advice", "supervised_legal_advice")
    assert requires_reprompt(report)


def test_tier_lower_is_not_expansion() -> None:
    old = _snapshot(advice_tier_max="supervised_legal_advice")
    new = _snapshot(advice_tier_max="draft_advice")
    report = detect_expansion(old, new)
    assert report.tier_raised is None
    assert not requires_reprompt(report)


def test_external_network_flip_is_expansion() -> None:
    old = _snapshot(external_network=False)
    new = _snapshot(external_network=True, destinations=["api.example.com"])
    report = detect_expansion(old, new)
    assert report.external_network_added is True
    assert "api.example.com" in report.new_destinations
    assert requires_reprompt(report)


def test_new_external_destination_is_expansion() -> None:
    old = _snapshot(external_network=True, destinations=["api.a.com"])
    new = _snapshot(
        external_network=True, destinations=["api.a.com", "api.b.com"]
    )
    report = detect_expansion(old, new)
    assert report.external_network_added is False  # already on
    assert "api.b.com" in report.new_destinations
    assert "api.a.com" not in report.new_destinations
    assert requires_reprompt(report)


def test_new_gate_is_expansion() -> None:
    old = _snapshot(gates=["privilege_posture"])
    new = _snapshot(gates=["privilege_posture", "advice_boundary"])
    report = detect_expansion(old, new)
    assert "advice_boundary" in report.new_gates_added
    assert requires_reprompt(report)


def test_gate_removed_alone_not_expansion() -> None:
    """Gate removal is recorded but doesn't trigger re-prompt by
    Phase 4 policy (only additions expand permissions)."""
    old = _snapshot(gates=["privilege_posture", "advice_boundary"])
    new = _snapshot(gates=["privilege_posture"])
    report = detect_expansion(old, new)
    assert "advice_boundary" in report.new_gates_removed
    # Phase 4 policy: any_expansion picks up added but not removed
    # alone. requires_reprompt returns False here.
    assert report.any_expansion is False


def test_model_access_raise_is_expansion() -> None:
    old = _snapshot(model_access="none")
    new = _snapshot(model_access="required")
    report = detect_expansion(old, new)
    assert report.model_access_raised == ("none", "required")
    assert requires_reprompt(report)


def test_to_dict_serialisable() -> None:
    """ExpansionReport.to_dict produces JSON-serialisable output for
    the API response."""
    import json

    old = _snapshot()
    new = _snapshot(advice_tier_max="supervised_legal_advice")
    report = detect_expansion(old, new)
    d = report.to_dict()
    json.dumps(d)  # must not raise
    assert d["tier_raised"] == {
        "from": "draft_advice",
        "to": "supervised_legal_advice",
    }
