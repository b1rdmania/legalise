"""Contract Review — vertical-slice reference module.

Single capability ``review`` that reads a matter document, hits the
privilege-posture gate, calls a provider with a structured prompt,
parses findings, and writes a findings artifact.

This module is a **reference**, not a built-in. External authors are
expected to read this directory standalone and use it as a template
for their own modules. See `README.md` for the architectural notes.
"""

from examples.modules.contract_review.capability import (
    ContractReviewModule,
    review_contract,
)


__all__ = ["ContractReviewModule", "review_contract"]
