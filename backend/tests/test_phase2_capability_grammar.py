"""Phase 2 — capability grammar extension tests.

Covers ``is_valid_capability_string``, ``assert_capability_string``,
and ``capability_scope`` per backend/app/core/capabilities.py.

Pure-unit tests — no DB.
"""

from __future__ import annotations

import pytest

from app.core.capabilities import (
    CAPABILITY_VOCABULARY,
    assert_capability_string,
    capability_scope,
    is_valid_capability_string,
)


def test_legacy_v1_strings_are_valid() -> None:
    for cap in CAPABILITY_VOCABULARY:
        assert is_valid_capability_string(cap), cap


def test_v2_grammar_strings_are_valid() -> None:
    valid = [
        "matter.documents.body.read",
        "matter.context.legalise_memory.facts.write",
        "matter.context.companies_house.write",
        "matter.state.intake.transition",
        "matter.events.read",
        "workspace.providers.invoke",
        "workspace.intake.prospects.write",
        "global.registry.read",
        # Single deepest segment (3 parts).
        "matter.notes.write",
    ]
    for cap in valid:
        assert is_valid_capability_string(cap), cap


def test_invalid_capability_strings_rejected() -> None:
    invalid = [
        "",  # empty
        "just_one_part",  # one segment
        "two.parts",  # missing required action segment
        "foo.bar.baz",  # scope not in matter|workspace|global
        "matter.",  # trailing dot
        ".matter.read",  # leading dot
        "MATTER.documents.read",  # uppercase scope
        "matter..read",  # empty middle segment
        "matter.documents-with-hyphen.read",  # hyphens not allowed in segment
    ]
    for cap in invalid:
        assert not is_valid_capability_string(cap), cap


def test_non_string_inputs_rejected() -> None:
    assert not is_valid_capability_string(None)  # type: ignore[arg-type]
    assert not is_valid_capability_string(123)  # type: ignore[arg-type]
    assert not is_valid_capability_string([])  # type: ignore[arg-type]


def test_assert_capability_string_raises_on_invalid() -> None:
    with pytest.raises(ValueError, match="invalid capability"):
        assert_capability_string("foo.bar.baz")


def test_assert_capability_string_passes_for_valid() -> None:
    # Should not raise.
    assert_capability_string("matter.read")
    assert_capability_string("matter.documents.body.read")


def test_capability_scope_for_v2_grammar() -> None:
    assert capability_scope("matter.documents.body.read") == "matter"
    assert capability_scope("workspace.providers.invoke") == "workspace"
    assert capability_scope("global.registry.read") == "global"


def test_capability_scope_for_legacy_v1_returns_none() -> None:
    """Legacy v1 strings have no canonical scope — `matter.read` looks
    like it has a scope but the dot count is just 2 (not v2 grammar
    shape), so it falls into the legacy bucket and returns None."""
    assert capability_scope("matter.read") is None
    assert capability_scope("model.invoke") is None
    assert capability_scope("document.body.read") is None
