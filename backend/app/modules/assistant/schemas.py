"""Pydantic schemas for the matter-scoped Assistant."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


SuggestedActionType = Literal[
    "run_pre_motion",
    "draft_letter",
    "review_contract",
    "view_document",
    "view_audit",
    "view_chronology",
    "anonymise_document",
]


class SuggestedAction(BaseModel):
    type: SuggestedActionType
    label: str
    params: dict[str, str] = Field(default_factory=dict)


class AssistantMessage(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
    created_at: datetime


class AssistantPostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    selected_document_ids: list[UUID] = Field(default_factory=list)


class AssistantPostResponse(BaseModel):
    user: AssistantMessage
    assistant: AssistantMessage


class AssistantResponseEnvelope(BaseModel):
    """Shape the model is asked to return — `parse_model_json` validates it."""

    content: str
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
