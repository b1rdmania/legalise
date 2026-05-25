"""UI slot registry — the canonical vocabulary modules can declare in
their manifest ``ui.slot`` field.

Modules cannot invent new slots. If a module declares a slot not in
this registry, the validator rejects the manifest. The slot vocabulary
ships with Phase 2 and is intentionally narrow; Phase 12 frontend
work may expand it.

Per docs/handovers/PHASE_2_BUILD_PLAN.md §Step 3.
"""

from __future__ import annotations


class UnknownUISlotError(ValueError):
    """Raised when a manifest declares a ``ui.slot`` that is not in
    the known registry."""


class UISlotRegistry:
    """The frozen set of valid UI slot names a module manifest may
    declare. Hard-coded for Phase 2; future phases may move this to
    a configuration file when the frontend slot system is built.
    """

    # Where each slot renders in the workspace. Stable strings —
    # frontend code (Phase 12) reads them by name.
    SLOTS: frozenset[str] = frozenset(
        {
            # Matter workspace surfaces.
            "matter.workflows",
            "matter.documents.actions",
            "matter.chronology.augment",
            "matter.memory.augment",
            "matter.parties.actions",
            # Assistant surface.
            "assistant.tools",
            # Cross-cutting gate interruption modal.
            "gate.interruption",
            # Pre-matter intake surface.
            "intake.module",
            # Output-lifecycle action surface.
            "output.lifecycle.action",
        }
    )

    @classmethod
    def is_known(cls, slot: str) -> bool:
        """True if ``slot`` is a known UI slot name."""
        return slot in cls.SLOTS

    @classmethod
    def assert_known(cls, slot: str) -> None:
        """Raise ``UnknownUISlotError`` if ``slot`` is not known."""
        if not cls.is_known(slot):
            raise UnknownUISlotError(
                f"unknown UI slot {slot!r}; valid slots: "
                f"{sorted(cls.SLOTS)}"
            )

    @classmethod
    def all_slots(cls) -> list[str]:
        """Sorted list of known slot names. Used by the frontend
        catalogue endpoint."""
        return sorted(cls.SLOTS)
