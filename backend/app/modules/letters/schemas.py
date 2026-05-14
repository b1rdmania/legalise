"""Letters module schemas — request/response shapes for the draft endpoint
and the matter-type-aware catalogue endpoint.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class LetterTypeRead(BaseModel):
    """A letter type as exposed to the frontend selector."""

    id: str
    label: str
    plugin: str
    skill: str
    summary: str
    is_default: bool = False


class LetterCatalogueResponse(BaseModel):
    matter_slug: str
    matter_type: str
    letter_types: list[LetterTypeRead]


class LetterDraftRequest(BaseModel):
    """Draft request. `letter_type` is the catalogue id (e.g. "lba"). Free-form
    `inputs` ride into the skill prompt verbatim — the skill body decides what
    it wants. Matter context (parties, facts, dates, posture, case theory) is
    injected by the plugin bridge regardless.
    """

    letter_type: str
    inputs: dict[str, str] = Field(default_factory=dict)


class LetterDraftResponse(BaseModel):
    matter_slug: str
    letter_type: str  # the catalogue id
    plugin: str
    skill: str
    draft_markdown: str
    model_used: str
    token_count: int
    latency_ms: int
