"""Documents API — shared DTOs and contract constants for document route groups."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

IMAGE_ASSET_MIMES = {
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_DOCUMENT_ASSET_BYTES = 5 * 1024 * 1024
DOCUMENT_ASSET_URL_RE = re.compile(
    r"^/api/documents/"
    r"(?P<document_id>[0-9a-fA-F-]{36})/assets/"
    r"(?P<asset_id>[0-9a-fA-F-]{36})/"
    r"(?P<filename>[^/]+)$"
)

EditMode = Literal["tighten", "rewrite", "summarise", "free-text", "uk-jurisdiction-sweep"]


@dataclass(frozen=True)
class DocumentAssetContext:
    user_id: uuid.UUID
    matter_id: uuid.UUID
    document_id: uuid.UUID


class DocumentAssetUploadRead(BaseModel):
    id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    url: str


class DocumentBodyRead(BaseModel):
    document_id: uuid.UUID
    kind: str
    extracted_text: str
    extraction_method: str
    extracted_at: datetime
    char_count: int
    page_count: int | None
    error_reason: str | None = None

    model_config = {"from_attributes": True}


class EditInstructionRequest(BaseModel):
    instruction: str = Field(min_length=4, max_length=2000)
    mode: EditMode = "free-text"


class DocumentVersionRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    version_number: int
    kind: str
    created_by_id: uuid.UUID
    created_at: datetime
    storage_uri: str | None
    filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    notes: str | None
    resolved_text: str | None = None
    resolved_json: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


class DocumentEditRead(BaseModel):
    id: uuid.UUID
    document_version_id: uuid.UUID
    change_id: str
    correlation_id: str | None
    deleted_text: str
    inserted_text: str
    context_before: str
    context_after: str
    rationale: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentEditSessionStart(BaseModel):
    client_id: str = Field(min_length=8, max_length=96)


class DocumentEditSessionRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    client_id: str
    user_label: str
    started_at: datetime
    last_seen_at: datetime
    ended_at: datetime | None


class DocumentEditSessionResponse(BaseModel):
    current: DocumentEditSessionRead
    active: list[DocumentEditSessionRead]


class DocumentWorkingDraftRead(BaseModel):
    document_id: uuid.UUID
    updated_by_id: uuid.UUID | None
    updated_at: datetime | None
    plain_text: str
    editor_json: dict[str, Any] | None = None
    base_version_id: uuid.UUID | None = None
    version_counter: int
    client_id: str | None = None

    model_config = {"from_attributes": True}


class DocumentWorkingDraftUpsert(BaseModel):
    plain_text: str = Field(max_length=500_000)
    editor_json: dict[str, Any] | None = None
    base_version_id: uuid.UUID | None = None
    client_id: str | None = Field(default=None, max_length=96)
    expected_version_counter: int | None = Field(default=None, ge=0)


class DocumentWorkingDraftCommitRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=500)
    clear_draft: bool = True
    expected_version_counter: int | None = Field(default=None, ge=0)


class EditInstructionResponse(BaseModel):
    version: DocumentVersionRead
    pending_edits: list[DocumentEditRead]
    model_used: str
    model_notes: str
    instruction_hash: str
    parse_ok: bool


class EditResolutionResponse(BaseModel):
    edit: DocumentEditRead
    new_version: DocumentVersionRead | None = None
    resolved_text: str | None = None


class BulkResolutionResponse(BaseModel):
    affected_count: int
    new_version: DocumentVersionRead
    resolved_text: str


class DocumentVersionSummary(BaseModel):
    version: DocumentVersionRead
    pending_count: int
    accepted_count: int
    rejected_count: int


class ManualDocumentVersionRequest(BaseModel):
    resolved_text: str = Field(min_length=1, max_length=500_000)
    resolved_json: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=500)


class RestoreDocumentVersionRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=500)


class DocumentCommentRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    author_id: uuid.UUID
    quote_text: str | None
    body_sha256: str | None
    anchor_start: int | None
    anchor_end: int | None
    body: str
    status: str
    created_at: datetime
    resolved_at: datetime | None
    resolved_by_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class DocumentCommentCreate(BaseModel):
    body: str = Field(min_length=2, max_length=4000)
    quote_text: str | None = Field(default=None, max_length=2000)
    body_sha256: str | None = Field(default=None, max_length=64)
    anchor_start: int | None = Field(default=None, ge=0)
    anchor_end: int | None = Field(default=None, ge=0)


class DocumentCommentUpdate(BaseModel):
    body: str = Field(min_length=2, max_length=4000)


__all__ = [name for name in globals() if not name.startswith("_")]
