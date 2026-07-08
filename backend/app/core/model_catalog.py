"""Curated catalog of selectable models.

This is the single editable source of truth for the model picker. The
frontend reads it (via ``GET /api/models``) to render a real list instead
of a free-text field, and the matter PATCH endpoint validates a chosen
model id against it.

Each entry carries:

    id            the model id stored on the matter (``default_model_id``)
    label         human-readable name for the picker
    provider      gateway provider name the id routes to —
                  "anthropic" | "openai" | "openrouter" | "ollama" | "none"
    requires_key  True if a per-user provider key must be configured
    note          short one-line hint shown beside the entry

Provider values are kept consistent with
``app.core.model_gateway.provider_for_model`` (slash-form ids ->
openrouter, claude-* -> anthropic, gpt-* -> openai, keyless otherwise).
To add or retire a model, edit ``_CATALOG`` below — nothing else needs
to change.

Reference-model policy: Legalise is built and tested against Claude
Sonnet 5. Other models run (via their own provider or an OpenRouter
key) but are available, not endorsed — citation behaviour is verified
on the reference model only.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelEntry:
    id: str
    label: str
    provider: str  # "anthropic" | "openai" | "ollama" | "none"
    requires_key: bool
    note: str
    recommended: bool = False


# Curated, editable list. Order is presentation order in the picker.
_CATALOG: list[ModelEntry] = [
    # --- Anthropic (claude-* -> anthropic, requires a user key) ----------
    ModelEntry(
        id="claude-sonnet-5",
        label="Claude Sonnet 5 - reference model",
        provider="anthropic",
        requires_key=True,
        note="Legalise is built and tested against Sonnet 5. Runs on your Anthropic key.",
        recommended=True,
    ),
    ModelEntry(
        id="claude-opus-4-8",
        label="Claude Opus 4.8 — most capable",
        provider="anthropic",
        requires_key=True,
        note="Highest quality; slower and most expensive.",
    ),
    ModelEntry(
        id="claude-sonnet-4-6",
        label="Claude Sonnet 4.6 — balanced",
        provider="anthropic",
        requires_key=True,
        note="Previous default; superseded by Sonnet 5.",
    ),
    ModelEntry(
        id="claude-haiku-4-5",
        label="Claude Haiku 4.5 — fast",
        provider="anthropic",
        requires_key=True,
        note="Fastest and cheapest; good for light tasks.",
    ),
    # Legacy in-code default — kept selectable so matters created against
    # the previous settings.default_model_id still validate.
    ModelEntry(
        id="claude-opus-4-7",
        label="Claude Opus 4.7",
        provider="anthropic",
        requires_key=True,
        note="Legacy default; superseded by Opus 4.8.",
    ),
    # --- OpenAI (gpt-* -> openai, requires a user key) -------------------
    ModelEntry(
        id="gpt-5",
        label="GPT-5 — most capable",
        provider="openai",
        requires_key=True,
        note="OpenAI flagship; requires an OpenAI key.",
    ),
    ModelEntry(
        id="gpt-5-mini",
        label="GPT-5 mini — fast",
        provider="openai",
        requires_key=True,
        note="Cheaper, faster OpenAI tier.",
    ),
    # --- OpenRouter (slash-form ids -> openrouter, one key, many models).
    # Curated, not exhaustive. Requests are privacy-pinned: routing only
    # to endpoints that do not train on or retain prompts.
    ModelEntry(
        id="anthropic/claude-sonnet-5",
        label="Claude Sonnet 5 (via OpenRouter)",
        provider="openrouter",
        requires_key=True,
        note="The reference model on an OpenRouter key.",
    ),
    ModelEntry(
        id="openai/gpt-5",
        label="GPT-5 (via OpenRouter)",
        provider="openrouter",
        requires_key=True,
        note="OpenAI flagship on an OpenRouter key.",
    ),
    ModelEntry(
        id="deepseek/deepseek-r1",
        label="DeepSeek R1 (via OpenRouter)",
        provider="openrouter",
        requires_key=True,
        note="Strong open-weights reasoning model on an OpenRouter key.",
    ),
    # --- Local (Ollama, keyless, in-tenant) ------------------------------
    ModelEntry(
        id="ollama",
        label="Local (Ollama) — keyless, in-tenant",
        provider="ollama",
        requires_key=False,
        note="Only works if a local Ollama provider is configured.",
    ),
    # --- Keyless demo ----------------------------------------------------
    ModelEntry(
        id="stub-echo",
        label="Demo model (no key, echoes input)",
        provider="none",
        requires_key=False,
        note="Deterministic echo; no provider key needed.",
    ),
]

_BY_ID: dict[str, ModelEntry] = {e.id: e for e in _CATALOG}


def model_catalog() -> list[ModelEntry]:
    """Return the curated list of selectable models (presentation order)."""
    return list(_CATALOG)


def is_known_model(model_id: str | None) -> bool:
    """True if ``model_id`` is a selectable entry in the catalog."""
    return bool(model_id) and model_id in _BY_ID


def get_model(model_id: str) -> ModelEntry | None:
    """Return the catalog entry for ``model_id``, or None if unknown."""
    return _BY_ID.get(model_id)
