"""Case-law module schemas — search request/response + citation CRUD shapes.

See PHASE_C_DELTA.md §"W1 — Case-law lookup surface (§4e)" for the contract.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CaseLawSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    # Court filter — matches Find Case Law's set: ewca / ewhc / uksc / eat / ukut.
    court: str | None = Field(default=None, max_length=32)
    year: int | None = Field(default=None, ge=1900, le=2100)


class CaseLawResult(BaseModel):
    case_name: str
    citation_ref: str
    court: str | None = None
    judgment_date: str | None = None
    parties: str | None = None
    summary: str | None = None
    source_url: str | None = None
    relevance_score: float | None = None


class CaseLawSearchResponse(BaseModel):
    query: str
    results: list[CaseLawResult]
    truncated: bool
    raw_response_excerpt: str | None = None
    model_used: str
    latency_ms: int


class CitationCreateRequest(BaseModel):
    case_name: str = Field(max_length=512)
    citation_ref: str = Field(max_length=255)
    citation_text: str = Field(min_length=1, max_length=8000)
    # `source_url` lands once W2's 0006_phase_c migration adds the column to
    # `matter_citations`. Schema-side we accept it now; service is defensive
    # if the SQLAlchemy attribute is not yet present.
    source_url: str | None = Field(default=None, max_length=2048)


class MatterCitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    matter_id: uuid.UUID
    case_name: str | None
    citation_ref: str | None
    citation_text: str
    source_url: str | None = None
    added_by_id: uuid.UUID
    added_at: datetime
