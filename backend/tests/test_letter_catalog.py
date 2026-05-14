"""Unit tests for the Letters catalogue — pure logic, no backend needed.

The catalogue is the single source of truth for letter-type → plugin/skill
routing by matter_type. The reviewer flagged the policy strings as
unenforced elsewhere in the codebase (R5 §5a, accepted as-is for v0.1);
these tests pin the routing logic so a future drift caught by anyone
re-running the evals would be visible.
"""

from __future__ import annotations

import pytest

from app.modules.letters.catalog import (
    CIVIL_MATTER_TYPES,
    EMPLOYMENT_MATTER_TYPES,
    LETTER_TYPES,
    catalogue_for_matter_type,
    default_for,
    resolve,
)


class TestCatalogue:
    def test_employment_tribunal_returns_six_types_default_lba(self) -> None:
        eligible = catalogue_for_matter_type("employment_tribunal")
        ids = [lt.id for lt in eligible]
        assert ids[0] == "lba", "lba must be first (default)"
        assert "acas-ec" in ids
        assert "et1" in ids
        assert "part-36" in ids
        assert "settlement-review" in ids
        assert "wp" in ids
        assert "lbc" not in ids, "civil-only lbc must not surface for ET"

    def test_civil_matter_returns_two_types_default_lbc(self) -> None:
        eligible = catalogue_for_matter_type("professional_negligence")
        ids = [lt.id for lt in eligible]
        assert ids[0] == "lbc", "lbc must be first (default) for civil"
        assert "wp" in ids
        assert "lba" not in ids, "ET-only lba must not surface for civil"

    def test_unknown_matter_type_returns_empty_list(self) -> None:
        # R6 P1a fall-through: unknown matter type returns 200 with empty
        # list, not a 500. The frontend renders an empty-state message.
        assert catalogue_for_matter_type("something_weird") == []

    def test_default_for_employment_is_lba(self) -> None:
        d = default_for("employment_tribunal")
        assert d is not None
        assert d.id == "lba"

    def test_default_for_civil_is_lbc(self) -> None:
        d = default_for("professional_negligence")
        assert d is not None
        assert d.id == "lbc"

    def test_default_for_unknown_is_none(self) -> None:
        assert default_for("nonsense") is None


class TestResolve:
    def test_resolve_lba_for_et(self) -> None:
        lt = resolve("lba", "employment_tribunal")
        assert lt.plugin == "uk-employment-legal"
        assert lt.skill == "lba-drafter"

    def test_resolve_lbc_for_civil(self) -> None:
        lt = resolve("lbc", "professional_negligence")
        assert lt.plugin == "uk-litigation-legal"
        assert lt.skill == "cpr-letter-drafter"

    def test_resolve_lbc_against_et_rejects(self) -> None:
        # R5 §5a — matter-type routing means civil drafters reject ET
        # matters even if the caller picks a civil letter id.
        with pytest.raises(ValueError, match="not available for matter type"):
            resolve("lbc", "employment_tribunal")

    def test_resolve_lba_against_civil_rejects(self) -> None:
        with pytest.raises(ValueError, match="not available for matter type"):
            resolve("lba", "professional_negligence")

    def test_resolve_unknown_id_rejects(self) -> None:
        with pytest.raises(ValueError, match="unknown letter type"):
            resolve("not-a-letter", "employment_tribunal")


class TestCatalogueIntegrity:
    """Invariants the catalogue must hold for the frontend selector to
    behave coherently."""

    def test_all_letter_types_have_required_fields(self) -> None:
        for lt in LETTER_TYPES:
            assert lt.id, f"missing id: {lt}"
            assert lt.label, f"missing label: {lt}"
            assert lt.plugin, f"missing plugin: {lt}"
            assert lt.skill, f"missing skill: {lt}"
            assert lt.summary, f"missing summary: {lt}"
            assert lt.matter_types, f"empty matter_types: {lt.id}"

    def test_ids_are_unique(self) -> None:
        ids = [lt.id for lt in LETTER_TYPES]
        assert len(ids) == len(set(ids)), f"duplicate ids: {ids}"

    def test_every_default_is_in_its_own_eligible_set(self) -> None:
        # If a letter type is the default for some matter_type, that
        # matter_type must also be in its eligible set. Otherwise
        # default_for() returns a letter the user can't actually use.
        for lt in LETTER_TYPES:
            for mt in lt.is_default_for:
                assert mt in lt.matter_types, (
                    f"letter {lt.id} defaults for {mt} but {mt} is not in "
                    f"its eligible matter_types"
                )

    def test_employment_and_civil_dont_overlap(self) -> None:
        # The policy lists are deliberately disjoint — a matter is either
        # ET or civil. If they ever overlap, routing becomes ambiguous.
        assert EMPLOYMENT_MATTER_TYPES.isdisjoint(CIVIL_MATTER_TYPES)
