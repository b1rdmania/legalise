"""Document anonymisation — Presidio default, Claude fallback.

Public entry points:
    from app.modules.anonymisation.pipeline import anonymise_document
    from app.modules.anonymisation.schemas import (
        AnonymiseRequest, AnonymisationResult, MappingRead,
    )
"""

from app.modules.anonymisation.schemas import (
    AnonymisationResult,
    AnonymiseRequest,
    MappingRead,
    TokenMapping,
)

__all__ = [
    "AnonymiseRequest",
    "AnonymisationResult",
    "MappingRead",
    "TokenMapping",
]
