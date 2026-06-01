"""Advice boundary primitive.

Generic gate enforcing the legal-advice tier of every output that flows
through the runtime. Required for SRA / PI / regulatory framing.

Per docs/architecture/ADVICE_BOUNDARY.md.

Public surface:

    from app.core.advice_boundary import (
        AdviceTier,
        ALLOWED_TRANSITIONS,
        ROLE_REQUIREMENTS,
        check,
        is_terminal_tier,
        InvalidTierError,
    )
"""

from app.core.advice_boundary.tiers import (
    ADVICE_TIER_FACTUAL_EXTRACTION,
    ADVICE_TIER_LEGAL_INFORMATION,
    ADVICE_TIER_DRAFT_ADVICE,
    ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
    ADVICE_TIER_APPROVED_FINAL_ADVICE,
    ALLOWED_TRANSITIONS,
    ROLE_REQUIREMENTS,
    AdviceTier,
    InvalidTierError,
    is_terminal_tier,
)
from app.core.advice_boundary.exceptions import AdviceBoundaryDenied
from app.core.advice_boundary.gate import check

__all__ = [
    "AdviceBoundaryDenied",
    "AdviceTier",
    "ADVICE_TIER_FACTUAL_EXTRACTION",
    "ADVICE_TIER_LEGAL_INFORMATION",
    "ADVICE_TIER_DRAFT_ADVICE",
    "ADVICE_TIER_SUPERVISED_LEGAL_ADVICE",
    "ADVICE_TIER_APPROVED_FINAL_ADVICE",
    "ALLOWED_TRANSITIONS",
    "ROLE_REQUIREMENTS",
    "is_terminal_tier",
    "InvalidTierError",
    "check",
]
