"""Advice boundary tier vocabulary + transition rules.

The five canonical tiers, the allowed transitions between them, and the
role required to drive each transition. Locked at
docs/architecture/ADVICE_BOUNDARY.md.

Tier semantics:

1. ``factual_extraction`` — extracting facts; no legal opinion
2. ``legal_information`` — general legal statements; no application
3. ``draft_advice`` — provisional advice applied to the matter
4. ``supervised_legal_advice`` — solicitor-reviewed and billable
5. ``approved_final_advice`` — signed off for client delivery; terminal
   and immutable

Workspace role tokens used in ``ROLE_REQUIREMENTS``:

- ``"any_authenticated"`` — any logged-in user with matter access
- ``"qualified_solicitor"`` — workspace role indicating SRA-roll
  membership (currently a generic role string; SRA verification
  lands later)
- ``"workspace_admin"`` — workspace administrator (override path for
  the final approval transition)
"""

from __future__ import annotations

from enum import Enum


# Tier string constants — re-exported from models to keep the canonical
# names in one place but make them importable from this module too.
ADVICE_TIER_FACTUAL_EXTRACTION = "factual_extraction"
ADVICE_TIER_LEGAL_INFORMATION = "legal_information"
ADVICE_TIER_DRAFT_ADVICE = "draft_advice"
ADVICE_TIER_SUPERVISED_LEGAL_ADVICE = "supervised_legal_advice"
ADVICE_TIER_APPROVED_FINAL_ADVICE = "approved_final_advice"


class AdviceTier(str, Enum):
    FACTUAL_EXTRACTION = ADVICE_TIER_FACTUAL_EXTRACTION
    LEGAL_INFORMATION = ADVICE_TIER_LEGAL_INFORMATION
    DRAFT_ADVICE = ADVICE_TIER_DRAFT_ADVICE
    SUPERVISED_LEGAL_ADVICE = ADVICE_TIER_SUPERVISED_LEGAL_ADVICE
    APPROVED_FINAL_ADVICE = ADVICE_TIER_APPROVED_FINAL_ADVICE


# Ordered ranking — used for ``tier_exceeded`` checks against
# ``declared_tier_max``.
_TIER_RANK: dict[str, int] = {
    ADVICE_TIER_FACTUAL_EXTRACTION: 1,
    ADVICE_TIER_LEGAL_INFORMATION: 2,
    ADVICE_TIER_DRAFT_ADVICE: 3,
    ADVICE_TIER_SUPERVISED_LEGAL_ADVICE: 4,
    ADVICE_TIER_APPROVED_FINAL_ADVICE: 5,
}


# Allowed transitions per ADVICE_BOUNDARY.md §Transition Rules.
ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        (ADVICE_TIER_FACTUAL_EXTRACTION, ADVICE_TIER_LEGAL_INFORMATION),
        (ADVICE_TIER_FACTUAL_EXTRACTION, ADVICE_TIER_DRAFT_ADVICE),
        (ADVICE_TIER_LEGAL_INFORMATION, ADVICE_TIER_DRAFT_ADVICE),
        (ADVICE_TIER_DRAFT_ADVICE, ADVICE_TIER_SUPERVISED_LEGAL_ADVICE),
        (
            ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            ADVICE_TIER_APPROVED_FINAL_ADVICE,
        ),
    }
)


# Tiers that are terminal — no transition out of them.
TERMINAL_TIERS: frozenset[str] = frozenset({ADVICE_TIER_APPROVED_FINAL_ADVICE})


# Role required per transition per ADVICE_BOUNDARY.md §Transition Rules.
#
# Doctrine alignment (Reviewer P2):
# - draft_advice -> supervised_legal_advice: qualified_solicitor only.
#   The architecture doc is explicit that admin override does NOT apply
#   to the supervised-promotion step; admins cannot self-promote draft
#   advice to supervised state. Only a qualified solicitor's clinical
#   review can promote.
# - supervised_legal_advice -> approved_final_advice: qualified_solicitor
#   OR workspace_admin. The architecture doc permits admin override
#   here for the final-approval step.
ROLE_REQUIREMENTS: dict[tuple[str, str], frozenset[str]] = {
    (ADVICE_TIER_FACTUAL_EXTRACTION, ADVICE_TIER_LEGAL_INFORMATION): frozenset(
        {"any_authenticated"}
    ),
    (ADVICE_TIER_FACTUAL_EXTRACTION, ADVICE_TIER_DRAFT_ADVICE): frozenset(
        {"any_authenticated"}
    ),
    (ADVICE_TIER_LEGAL_INFORMATION, ADVICE_TIER_DRAFT_ADVICE): frozenset(
        {"any_authenticated"}
    ),
    (ADVICE_TIER_DRAFT_ADVICE, ADVICE_TIER_SUPERVISED_LEGAL_ADVICE): frozenset(
        {"qualified_solicitor"}
    ),
    (
        ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        ADVICE_TIER_APPROVED_FINAL_ADVICE,
    ): frozenset({"qualified_solicitor", "workspace_admin"}),
}


# Initial-creation case: setting a tier on a brand-new output (no
# ``from_tier``).
#
# Reviewer P1#1 round 2: capped at draft_advice.
# ``supervised_legal_advice`` and ``approved_final_advice`` are
# intentionally absent from this table — they cannot be set as initial
# tier. They require a transition path through prior tiers.
#
# Without this cap, a workspace admin could direct-create an output at
# ``approved_final_advice`` with no supervised history, bypassing the
# entire supervision primitive. The architecture doc is explicit that
# approved advice must not skip supervised. Initial-tier setting is a
# distinct code path that needs the same guarantee.
#
# When the output-lifecycle reference module ships and can prove
# prior state, this table may be revisited so a solicitor can
# directly create an output at supervised tier if there's a documented
# prior-tier history elsewhere. Until then the safe default is no
# initial-tier creation above draft_advice.
INITIAL_TIER_ROLE_REQUIREMENTS: dict[str, frozenset[str]] = {
    ADVICE_TIER_FACTUAL_EXTRACTION: frozenset({"any_authenticated"}),
    ADVICE_TIER_LEGAL_INFORMATION: frozenset({"any_authenticated"}),
    ADVICE_TIER_DRAFT_ADVICE: frozenset({"any_authenticated"}),
    # supervised_legal_advice / approved_final_advice intentionally
    # absent — see module-level comment above.
}


def initial_tier_is_permitted(tier: str) -> bool:
    """True if ``tier`` may be set as the initial tier of a new output
    (i.e. with ``from_tier=None``).

    Per Reviewer P1#1 round 2 this caps initial-tier creation at
    ``draft_advice``; supervised and final tiers cannot be direct-created.
    """
    return tier in INITIAL_TIER_ROLE_REQUIREMENTS


class InvalidTierError(ValueError):
    """Raised when a tier string is not in the canonical vocabulary."""


def assert_tier(value: str) -> None:
    """Raise ``InvalidTierError`` if ``value`` is not a canonical
    tier."""
    if value not in _TIER_RANK:
        raise InvalidTierError(
            f"unknown advice tier {value!r}; "
            f"valid: {sorted(_TIER_RANK)}"
        )


def tier_rank(tier: str) -> int:
    """Numeric rank for ordering tiers. Higher = more sensitive."""
    assert_tier(tier)
    return _TIER_RANK[tier]


def is_terminal_tier(tier: str) -> bool:
    """True if the tier is terminal (no transition out)."""
    return tier in TERMINAL_TIERS


def is_allowed_transition(from_tier: str, to_tier: str) -> bool:
    """True if ``(from_tier, to_tier)`` is in the allowed transition
    set per ADVICE_BOUNDARY.md."""
    return (from_tier, to_tier) in ALLOWED_TRANSITIONS


def role_satisfies(
    *,
    actor_role: str | None,
    requirement_set: frozenset[str],
) -> bool:
    """True if the actor's role meets the requirement set.

    ``"any_authenticated"`` in the requirement set passes for any
    non-None role token (actor must be logged in). Otherwise the actor's
    role must be a literal member of the requirement set.
    """
    if actor_role is None:
        return False
    if "any_authenticated" in requirement_set:
        return True
    return actor_role in requirement_set
