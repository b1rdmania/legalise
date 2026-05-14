"""Letter catalogue — maps user-facing letter types to plugin skills, with
matter-type routing.

The catalogue is the single source of truth for which skill drafts which
letter and which matter types are eligible. The frontend selector renders
from this catalogue; the draft endpoint resolves the skill from it. Adding
a new letter type means adding a row here — nothing else.

Critical pre-Day-7 finding: `cpr-letter-drafter` is a civil pre-action
regime drafter (PACC / sector protocols) and does NOT apply to Employment
Tribunal matters. Khan v Acme is ET; the right skill is
`uk-employment-legal/lba-drafter`. Routing happens by `matter.matter_type`.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# Civil matter types that route through cpr-letter-drafter.
CIVIL_MATTER_TYPES: frozenset[str] = frozenset(
    {
        "civil_litigation",
        "professional_negligence",
        "debt",
        "housing_disrepair",
        "personal_injury",
        "construction",
        "judicial_review",
        "defamation",
        "possession",
    }
)

# Employment Tribunal matter types that route through the employment skills.
EMPLOYMENT_MATTER_TYPES: frozenset[str] = frozenset(
    {
        "employment_tribunal",
        "unfair_dismissal",
        "discrimination",
        "wrongful_dismissal",
    }
)


@dataclass(frozen=True)
class LetterType:
    """One letter the user can draft."""

    id: str  # stable selector id, kebab-case
    label: str  # human-facing label
    plugin: str
    skill: str
    summary: str  # one-line description shown in the selector
    matter_types: frozenset[str] = field(default_factory=frozenset)  # eligible matter types
    is_default_for: frozenset[str] = field(default_factory=frozenset)  # types this is the default for


# Order matters: the first eligible entry is the default highlight.
LETTER_TYPES: tuple[LetterType, ...] = (
    LetterType(
        id="lba",
        label="Letter Before Action (ET)",
        plugin="uk-employment-legal",
        skill="lba-drafter",
        summary="Puts the employer on notice ahead of an Employment Tribunal claim. ACAS Code-aware; surfaces s.207B time limits.",
        matter_types=EMPLOYMENT_MATTER_TYPES,
        is_default_for=EMPLOYMENT_MATTER_TYPES,
    ),
    LetterType(
        id="acas-ec",
        label="ACAS Early Conciliation notification",
        plugin="uk-employment-legal",
        skill="acas-early-conciliation",
        summary="Drafts the ACAS EC notification covering Day A timing and s.207B stop-the-clock implications.",
        matter_types=EMPLOYMENT_MATTER_TYPES,
    ),
    LetterType(
        id="et1",
        label="ET1 claim form (narrative)",
        plugin="uk-employment-legal",
        skill="et1-claim-drafter",
        summary="Drafts the ET1 narrative — grounds of claim, remedy sought, statutory basis.",
        matter_types=EMPLOYMENT_MATTER_TYPES,
    ),
    LetterType(
        id="part-36",
        label="Part 36 / settlement offer (ET)",
        plugin="uk-employment-legal",
        skill="part-36-offer",
        summary="Calderbank-equivalent settlement offer with costs-protection framing for ET proceedings.",
        matter_types=EMPLOYMENT_MATTER_TYPES,
    ),
    LetterType(
        id="settlement-review",
        label="Settlement agreement review",
        plugin="uk-employment-legal",
        skill="settlement-agreement-review",
        summary="Reviews a draft settlement agreement against s.203 ERA 1996 validity requirements and substantive terms.",
        matter_types=EMPLOYMENT_MATTER_TYPES,
    ),
    LetterType(
        id="wp",
        label="Without Prejudice correspondence",
        plugin="uk-litigation-legal",
        skill="without-prejudice-drafter",
        summary="WP / WPSATC settlement correspondence — privilege-aware framing for either ET or civil disputes.",
        matter_types=EMPLOYMENT_MATTER_TYPES | CIVIL_MATTER_TYPES,
    ),
    LetterType(
        id="lbc",
        label="Letter Before Claim (civil)",
        plugin="uk-litigation-legal",
        skill="cpr-letter-drafter",
        summary="PACC / sector-protocol-compliant pre-action letter for civil claims (debt, prof neg, disrepair, PI, JR).",
        matter_types=CIVIL_MATTER_TYPES,
        is_default_for=CIVIL_MATTER_TYPES,
    ),
)


def catalogue_for_matter_type(matter_type: str) -> list[LetterType]:
    """Return letter types eligible for this matter type, default first."""
    eligible = [lt for lt in LETTER_TYPES if matter_type in lt.matter_types]
    eligible.sort(key=lambda lt: 0 if matter_type in lt.is_default_for else 1)
    return eligible


def resolve(letter_id: str, matter_type: str) -> LetterType:
    """Look up a letter type by id and confirm it is eligible for this matter.

    Raises ValueError if the id is unknown or not eligible for the matter type.
    """
    for lt in LETTER_TYPES:
        if lt.id == letter_id:
            if matter_type not in lt.matter_types:
                raise ValueError(
                    f"letter type {letter_id!r} is not available for matter type "
                    f"{matter_type!r}. Eligible matter types: {sorted(lt.matter_types)}."
                )
            return lt
    raise ValueError(f"unknown letter type: {letter_id!r}")


def default_for(matter_type: str) -> LetterType | None:
    """Return the default letter for a matter type, if one is defined."""
    for lt in LETTER_TYPES:
        if matter_type in lt.is_default_for:
            return lt
    return None
