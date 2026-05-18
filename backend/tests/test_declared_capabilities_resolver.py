"""Regression tests for the shared per-skill capability resolver.

`declared_capabilities_for_skill` is the single source of truth used by
both `/api/modules` and `auto_grant_declared_for_user`. If these two
drift, auto-grant over-grants (or under-grants) relative to what the
user sees on the Modules page. The whole "install with trust
boundaries" story relies on the two answers being identical.

Three regression cases, named per the reviewer brief:

- `pre-motion` is not granted `chronology.write`
- `unfair-dismissal-screener` is not granted `document.generated.write`
- plugin-level fallback still works when `skills` is absent
"""

from __future__ import annotations

from app.core.capabilities import declared_capabilities_for_skill


# uk-litigation-legal manifest shape, simplified. pre-motion intentionally
# drops `chronology.write` and `document.generated.write` even though the
# plugin-level union includes both.
LITIGATION_MANIFEST = {
    "name": "uk-litigation-legal",
    "capabilities": [
        "matter.read",
        "document.body.read",
        "document.generated.write",
        "chronology.read",
        "chronology.write",
        "model.invoke",
    ],
    "skills": {
        "pre-motion": {
            "capabilities": [
                "matter.read",
                "document.body.read",
                "chronology.read",
                "model.invoke",
            ]
        },
        "chronology": {
            "capabilities": [
                "matter.read",
                "document.body.read",
                "chronology.read",
                "chronology.write",
                "model.invoke",
            ]
        },
    },
}


# uk-employment-legal manifest shape, simplified. unfair-dismissal-screener
# returns a verdict, not a generated document, so the per-skill override
# strips `document.generated.write` from the plugin-level union.
EMPLOYMENT_MANIFEST = {
    "name": "uk-employment-legal",
    "capabilities": [
        "matter.read",
        "document.body.read",
        "document.generated.write",
        "model.invoke",
    ],
    "skills": {
        "unfair-dismissal-screener": {
            "capabilities": [
                "matter.read",
                "document.body.read",
                "model.invoke",
            ]
        },
        "lba-drafter": {
            "capabilities": [
                "matter.read",
                "document.body.read",
                "document.generated.write",
                "model.invoke",
            ]
        },
    },
}


# A manifest without `skills`. Every skill under it should inherit the
# plugin-level set.
THIN_MANIFEST = {
    "name": "thin-plugin",
    "capabilities": ["matter.read", "model.invoke"],
}


class TestPreMotionDoesNotInheritChronologyWrite:
    """The exact bug the reviewer flagged at P1.

    Before the shared resolver landed, `auto_grant_declared_for_user`
    read plugin-level `capabilities` and granted those to every skill.
    `pre-motion` would have been granted `chronology.write` even though
    the per-skill manifest intentionally removes it.
    """

    def test_pre_motion_skill_overrides_remove_chronology_write(self) -> None:
        caps = declared_capabilities_for_skill(LITIGATION_MANIFEST, "pre-motion")
        assert "chronology.write" not in caps

    def test_pre_motion_skill_overrides_remove_document_generated_write(self) -> None:
        caps = declared_capabilities_for_skill(LITIGATION_MANIFEST, "pre-motion")
        assert "document.generated.write" not in caps

    def test_pre_motion_keeps_chronology_read(self) -> None:
        caps = declared_capabilities_for_skill(LITIGATION_MANIFEST, "pre-motion")
        assert "chronology.read" in caps


class TestUnfairDismissalScreenerDoesNotInheritDocGeneratedWrite:
    """The other concrete case from the reviewer brief.

    `unfair-dismissal-screener` returns a verdict, not a generated doc,
    so it must not be granted `document.generated.write`.
    """

    def test_screener_excludes_document_generated_write(self) -> None:
        caps = declared_capabilities_for_skill(
            EMPLOYMENT_MANIFEST, "unfair-dismissal-screener"
        )
        assert "document.generated.write" not in caps

    def test_screener_keeps_model_invoke(self) -> None:
        caps = declared_capabilities_for_skill(
            EMPLOYMENT_MANIFEST, "unfair-dismissal-screener"
        )
        assert "model.invoke" in caps


class TestPluginLevelFallback:
    """Skills not present in the `skills` map inherit plugin-level."""

    def test_thin_manifest_skill_inherits_plugin_level(self) -> None:
        caps = declared_capabilities_for_skill(THIN_MANIFEST, "any-skill-name")
        assert sorted(caps) == ["matter.read", "model.invoke"]

    def test_skill_absent_from_skills_map_inherits_plugin_level(self) -> None:
        # `chronology` is present in the litigation manifest's `skills`
        # map; a skill not listed there should fall back to plugin-level.
        caps = declared_capabilities_for_skill(LITIGATION_MANIFEST, "some-new-skill")
        # Plugin-level union for litigation
        assert set(caps) == {
            "matter.read",
            "document.body.read",
            "document.generated.write",
            "chronology.read",
            "chronology.write",
            "model.invoke",
        }

    def test_employment_lba_drafter_matches_per_skill_set(self) -> None:
        # lba-drafter explicitly lists its caps in `skills`; should match
        # exactly, not the plugin-level union (which is the same set here
        # but in principle could diverge).
        caps = declared_capabilities_for_skill(EMPLOYMENT_MANIFEST, "lba-drafter")
        assert set(caps) == {
            "matter.read",
            "document.body.read",
            "document.generated.write",
            "model.invoke",
        }


class TestNullAndMalformedInputs:
    """The resolver must be safe against missing keys and wrong types."""

    def test_none_payload_returns_empty(self) -> None:
        assert declared_capabilities_for_skill(None, "any-skill") == []

    def test_non_dict_payload_returns_empty(self) -> None:
        assert declared_capabilities_for_skill("not a dict", "any-skill") == []  # type: ignore[arg-type]

    def test_skills_value_not_a_dict_falls_through_to_plugin_level(self) -> None:
        payload = {"capabilities": ["matter.read"], "skills": "not-a-dict"}
        assert declared_capabilities_for_skill(payload, "any") == ["matter.read"]

    def test_skill_override_without_capabilities_falls_through(self) -> None:
        payload = {
            "capabilities": ["matter.read"],
            "skills": {"foo": {"trust_posture": "trusted"}},
        }
        # No `capabilities` in the skill override; plugin-level applies.
        assert declared_capabilities_for_skill(payload, "foo") == ["matter.read"]

    def test_audit_emit_is_not_in_resolved_capabilities_for_any_skill(self) -> None:
        """audit.emit is no longer a grantable capability. Doctrine: audit
        is mandatory provenance, not a permission a module can lose. The
        resolver doesn't filter, but the schema does, and the staged
        manifests do not declare it. This test pins the absence."""
        for manifest in (LITIGATION_MANIFEST, EMPLOYMENT_MANIFEST):
            for skill_name in (manifest.get("skills") or {}):
                caps = declared_capabilities_for_skill(manifest, skill_name)
                assert "audit.emit" not in caps
