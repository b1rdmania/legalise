"""Pydantic input/output models for the gateway tools.

JSON Schema is derived on-demand via `Model.model_json_schema()` — we don't
keep a parallel hand-written schema dict. No `jsonschema` library dependency.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# generate_docx
# ---------------------------------------------------------------------------


class GenerateDocxOptions(BaseModel):
    orientation: Literal["portrait", "landscape"] = "portrait"
    matter_id: uuid.UUID | None = None
    matter_slug: str | None = Field(default=None, max_length=120)


class GenerateDocxInput(BaseModel):
    title: str = Field(..., max_length=500)
    body_markdown: str = Field(..., max_length=500_000)
    options: GenerateDocxOptions | None = None


class GenerateDocxOutput(BaseModel):
    storage_uri: str
    byte_count: int = Field(..., ge=0)
    char_count: int = Field(..., ge=0)


# ---------------------------------------------------------------------------
# edit_document
# ---------------------------------------------------------------------------


class EditDocumentChange(BaseModel):
    """A single change as produced by the model.

    `correlation_id` carries the model's transient `c1`/`c2` tag; the
    server-side `change_id` is a UUID assigned at persistence time.
    """

    correlation_id: str | None = Field(default=None, max_length=32)
    deleted_text: str = ""
    inserted_text: str = ""
    context_before: str = Field(default="", max_length=200)
    context_after: str = Field(default="", max_length=200)
    rationale: str | None = Field(default=None, max_length=500)


class EditDocumentInput(BaseModel):
    version_id: uuid.UUID
    changes: list[EditDocumentChange] = Field(..., max_length=50)


class PendingEditRead(BaseModel):
    id: uuid.UUID
    document_version_id: uuid.UUID
    change_id: str
    status: str
    correlation_id: str | None = None


class EditDocumentOutput(BaseModel):
    pending_edits: list[PendingEditRead]


# ---------------------------------------------------------------------------
# replicate_document
# ---------------------------------------------------------------------------


class ReplicateDocumentInput(BaseModel):
    document_id: uuid.UUID


class DocumentVersionRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    version_number: int
    kind: str
    created_at: datetime
    storage_uri: str | None = None
    notes: str | None = None


class ReplicateDocumentOutput(BaseModel):
    new_version: DocumentVersionRead


__all__ = [
    "GenerateDocxOptions",
    "GenerateDocxInput",
    "GenerateDocxOutput",
    "EditDocumentChange",
    "EditDocumentInput",
    "EditDocumentOutput",
    "PendingEditRead",
    "ReplicateDocumentInput",
    "ReplicateDocumentOutput",
    "DocumentVersionRead",
]
