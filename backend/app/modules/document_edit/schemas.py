"""Pydantic shapes for the edit-instruction surface.

`ChangesEnvelope` mirrors the JSON envelope the model is asked to return
from a document_edit prompt. Field types are intentionally permissive —
every downstream consumer in `pipeline.py` coerces via `str(...)` and
truncates, so the schema's job is only to confirm the top-level shape
and let extra keys ride through for audit.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ChangeEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    change_id: Any | None = None
    deleted_text: Any | None = None
    inserted_text: Any | None = None
    context_before: Any | None = None
    context_after: Any | None = None
    rationale: Any | None = None


class ChangesEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    changes: list[ChangeEntry] | None = Field(default_factory=list)
    model_notes: str | None = ""


__all__ = ["ChangeEntry", "ChangesEnvelope"]
