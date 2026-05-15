"""Pydantic shapes for the tabular review module.

Wire-format mirrors the delta sheet (§4b). `columns_config` is a JSONB
column on `tabular_reviews`; we validate via `ColumnSpec` at both create
and patch boundaries so a malformed config never lands in the DB.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


COLUMN_TYPES = ("text", "date", "yesno", "number")
ColumnType = Literal["text", "date", "yesno", "number"]


class ColumnSpec(BaseModel):
    """One column in a review.

    `key` is a snake-case identifier used as the JSON key in
    `tabular_review_rows.extracted_values`. `prompt` is user-authored
    instruction text passed through to the model; injection is accepted
    by design (W3 gotcha 5).
    """

    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=4, max_length=2000)
    type: ColumnType = "text"


class ReviewCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    columns_config: list[ColumnSpec] = Field(default_factory=list, max_length=30)


class ReviewUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    columns_config: list[ColumnSpec] | None = Field(default=None, max_length=30)


class ReviewRowRead(BaseModel):
    document_id: uuid.UUID
    document_filename: str
    extracted_values: dict[str, Any] = Field(default_factory=dict)
    last_run_at: datetime | None = None


class ReviewRead(BaseModel):
    id: uuid.UUID
    matter_slug: str
    title: str
    columns_config: list[ColumnSpec]
    rows: list[ReviewRowRead]
    created_at: datetime
    updated_at: datetime


class ReviewSummary(BaseModel):
    id: uuid.UUID
    title: str
    column_count: int
    row_count: int
    last_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class RunRequest(BaseModel):
    document_ids: list[uuid.UUID] | None = None
    column_keys: list[str] | None = None
    confirm_above_50: bool = False


class RunEstimate(BaseModel):
    total_calls: int
    est_input_tokens: int
    est_output_tokens: int
    est_cost_pence_lower: int
    est_cost_pence_upper: int
    requires_confirm: bool
    provider: str | None = None
    model_id: str | None = None


class RunErrorRow(BaseModel):
    document_id: uuid.UUID
    column_key: str
    error_message: str


class RunReport(BaseModel):
    cells_run: int
    cells_failed: int
    errors: list[RunErrorRow] = Field(default_factory=list)
    duration_ms: int


class ExportResponse(BaseModel):
    file_uuid: uuid.UUID
    download_url: str
    byte_count: int


__all__ = [
    "COLUMN_TYPES",
    "ColumnType",
    "ColumnSpec",
    "ReviewCreateRequest",
    "ReviewUpdateRequest",
    "ReviewRowRead",
    "ReviewRead",
    "ReviewSummary",
    "RunRequest",
    "RunEstimate",
    "RunErrorRow",
    "RunReport",
    "ExportResponse",
]
