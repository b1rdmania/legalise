"""Structured-output helper — JSON extraction + Pydantic validation.

Centralises the ad-hoc regex sites that previously lived inside each
module's pipeline. Callers hand a raw model response and a Pydantic
model class; this helper strips fences/prose, finds the first balanced
top-level `{...}`, loads it, and validates.

Boundary doctrine: this lives **outside** the gateway. The gateway
routes and audits model calls; structured-output parsing is a consumer
concern. Provider-native schema/tool-calling is a v0.2/v0.3 gateway
upgrade per PHASE_INFRA_DELTA §4 decision 7 — not rushed.
"""

from __future__ import annotations

import json
from typing import TypeVar

from pydantic import BaseModel, ValidationError


M = TypeVar("M", bound=BaseModel)


class StructuredOutputError(Exception):
    """Raised when a model response cannot be parsed + validated.

    `raw_text` is the original response — callers log it into the audit
    payload so a malformed response is recoverable for review.
    """

    def __init__(self, message: str, raw_text: str = "") -> None:
        super().__init__(message)
        self.raw_text = raw_text


def _find_first_balanced_object(text: str) -> str | None:
    """Return the first balanced top-level `{...}` substring, or None.

    Naive depth scan — sufficient for model JSON envelopes. Does not
    attempt to handle braces inside string literals (`{` / `}` inside
    strings would mis-balance), which is acceptable because the upstream
    extraction (markdown-fence strip + bare-JSON attempt) catches the
    well-formed cases first.
    """
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth == 0:
                continue
            depth -= 1
            if depth == 0 and start >= 0:
                return text[start : i + 1]
    return None


def _strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        # Drop opening fence (optional language tag) and trailing fence.
        newline = text.find("\n")
        if newline != -1:
            text = text[newline + 1 :]
        if text.endswith("```"):
            text = text[: -3]
        text = text.strip()
    return text


def parse_model_json(raw: str, model: type[M]) -> M:
    """Extract JSON from a model response and validate against `model`.

    Strips leading prose / ```json fences / ``` fences, locates the
    first balanced top-level `{...}` if a direct `json.loads` fails,
    then validates with `model.model_validate(...)`. Any failure raises
    `StructuredOutputError` with the original `raw` attached for audit.
    """
    if raw is None:
        raise StructuredOutputError("empty model response", raw_text="")

    stripped = _strip_fences(raw)
    parsed: object = None

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        candidate = _find_first_balanced_object(stripped)
        if candidate is None:
            raise StructuredOutputError(
                "no JSON object found in model response", raw_text=raw
            )
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise StructuredOutputError(
                f"json decode failed: {exc}", raw_text=raw
            ) from exc

    if not isinstance(parsed, dict):
        raise StructuredOutputError(
            f"expected JSON object at top level, got {type(parsed).__name__}",
            raw_text=raw,
        )

    try:
        return model.model_validate(parsed)
    except ValidationError as exc:
        raise StructuredOutputError(
            f"pydantic validation failed: {exc}", raw_text=raw
        ) from exc


__all__ = ["StructuredOutputError", "parse_model_json"]
