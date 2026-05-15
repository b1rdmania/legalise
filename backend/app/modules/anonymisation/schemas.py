"""Pydantic shapes for the document-anonymisation surface."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EngineChoice = Literal["presidio", "claude", "auto"]


class _TokenEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    original: str = ""
    entity_type: str = "PERSON"


class _SpanEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    start: int | str | None = None
    end: int | str | None = None
    original: str = ""
    entity_type: str = "PERSON"


class AnonymisationEnvelope(BaseModel):
    """Wire shape for the Claude anonymisation fallback response.

    `_spans_from_claude` re-validates each entry defensively, so this
    schema only confirms the top-level keys and lets extra fields ride
    through. Missing or null top-level keys default to empty lists,
    matching the previous tolerant parser.
    """

    model_config = ConfigDict(extra="allow")

    tokens: list[_TokenEntry] | None = Field(default_factory=list)
    spans: list[_SpanEntry] | None = Field(default_factory=list)


class AnonymiseRequest(BaseModel):
    engine: EngineChoice = "auto"
    # Optional allow-list of Presidio entity types. None => Presidio
    # defaults plus the custom UK recognisers registered in
    # presidio_engine.py.
    entity_types: list[str] | None = None
    # Presidio analyser score threshold (0.0–1.0). 0.4 is a sensible
    # mid-recall default for ET correspondence; raise to 0.6 for
    # higher-precision sweeps.
    threshold: float = Field(default=0.4, ge=0.0, le=1.0)


class TokenMapping(BaseModel):
    token: str
    entity_type: str
    original: str
    occurrences: int


class AnonymisationResult(BaseModel):
    document_id: uuid.UUID
    redacted_text: str
    engine: str
    anonymised_at: datetime
    char_count: int
    entity_count: int
    tokens: list[TokenMapping]


class MappingRead(BaseModel):
    """Matter-owner-only payload exposing the full token table.

    `spans` carries enough information to re-locate each replacement in
    the redacted text for downstream highlighting; we do not expose the
    original document text here — callers should fetch the extracted
    body separately when they have the ownership grant.
    """

    document_id: uuid.UUID
    tokens: list[TokenMapping]
    spans: list[dict]
