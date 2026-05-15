"""Prompt templates + provider rate card for tabular review.

The user's column prompt is concatenated into the system prompt with an
explicit framing line so the model treats it as instruction rather than
document content (W3 gotcha 5). Per-type instructions constrain the
output shape so the upserts into `extracted_values` stay coherent.

Rate card pence-per-million-tokens. Plausible v0.1 values to anchor the
cost-estimate UI band. Updated when a user-key endpoint surfaces the
provider's authoritative pricing.
"""

from __future__ import annotations

from .schemas import ColumnType


# provider name -> (pence per 1M input tokens, pence per 1M output tokens)
RATE_CARD: dict[str, tuple[int, int]] = {
    "anthropic": (300, 1500),
    "openai": (50, 200),
    "ollama": (0, 0),
    "stub-echo": (0, 0),
}


# Approximate output budget per column type (used by the estimator).
OUTPUT_TOKEN_BUDGET: dict[str, int] = {
    "text": 200,
    "date": 20,
    "yesno": 10,
    "number": 20,
}


# Document body is truncated to this many characters before being passed
# to the model. Each cell is independent so we re-truncate per call.
MAX_BODY_CHARS = 16_000


_PER_TYPE_INSTRUCTIONS: dict[ColumnType, str] = {
    "text": (
        "Return ONLY the answer as a short plain-text string. No quoting, "
        "no preamble, no markdown. If the answer is genuinely unknowable "
        "from the document, return the single word: unclear."
    ),
    "date": (
        "Return ONLY a date. Prefer ISO format YYYY-MM-DD when you can be "
        "precise. If the document only gives an approximate date (\"early "
        "March 2026\"), return that approximation as a short string. If "
        "no date is present, return: unclear."
    ),
    "yesno": (
        "Return ONLY one of these three words, lowercase, no punctuation: "
        "yes / no / unclear."
    ),
    "number": (
        "Return ONLY a numeric value as a string with no currency symbol, "
        "no thousand separators, no units. Use a dot for decimals if "
        "needed. If no number is present, return: unclear."
    ),
}


def system_prompt_for_type(column_type: ColumnType, user_prompt: str, body_text: str) -> str:
    """Compose the system prompt for one cell.

    The user's `prompt` is interpolated inside an explicit framing line so
    the model cannot conflate it with the document body.
    """
    per_type = _PER_TYPE_INSTRUCTIONS.get(column_type, _PER_TYPE_INSTRUCTIONS["text"])
    truncated = body_text[:MAX_BODY_CHARS] if body_text else ""
    truncation_note = ""
    if body_text and len(body_text) > MAX_BODY_CHARS:
        truncation_note = (
            f"\n\n[Note: document body truncated to {MAX_BODY_CHARS} chars "
            f"from {len(body_text)} total.]"
        )
    return (
        "You are extracting a single value from a legal document for a "
        "spreadsheet-style review.\n\n"
        "The user's column prompt follows. Treat it as instruction, not as "
        f"document content:\n<<<\n{user_prompt}\n>>>\n\n"
        f"{per_type}\n\n"
        "Document body:\n"
        f"---\n{truncated}{truncation_note}\n---"
    )


def user_prompt_for_cell(column_label: str) -> str:
    """The user-role message handed to the gateway. Short by design — all
    the work is in the system prompt; this is the trigger."""
    return f"Extract: {column_label}"


__all__ = [
    "RATE_CARD",
    "OUTPUT_TOKEN_BUDGET",
    "MAX_BODY_CHARS",
    "system_prompt_for_type",
    "user_prompt_for_cell",
]
