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


class LetterDraftDocxRequest(BaseModel):
    """`draft_markdown` is the already-rendered draft from `/letters/draft`.
    Re-using it (rather than re-invoking the plugin) avoids double-billing
    the user for one document. `title` is the bold heading inside the
    generated .docx (the matter-aware filename is derived elsewhere)."""

    letter_type: str
    title: str = Field(..., max_length=500)
    draft_markdown: str = Field(..., max_length=500_000)


class LetterDraftDocxResponse(BaseModel):
    file_uuid: str
    storage_uri: str
    byte_count: int
    download_url: str
