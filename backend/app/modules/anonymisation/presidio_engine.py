"""Presidio analyser wrapper with UK-specific recognisers.

Lazy singleton — Presidio + spaCy together resident is ~50MB, so we
avoid loading at import time. Calls to `analyse()` are the only public
entry point.

Presidio is an optional install — the `anonymisation` extra
(`pip install -e ".[anonymisation]"`) plus a spaCy model must be present
for this module to do real work. We wrap the imports in a try/except so
the module still imports in environments that do not have the wheels
(slim deploys, frontend-only dev). The first real `analyse` call in that
state raises a clean `RuntimeError` with install guidance, which the
anonymisation routes translate into a 503.

Model selection: the `PRESIDIO_MODEL` env var lets production swap in
`en_core_web_lg` (~560MB) for higher recall. Defaults to
`en_core_web_sm` (12MB) for the v0.1 image.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any

try:  # pragma: no cover — exercised only when the deps are installed.
    from presidio_analyzer import (
        AnalyzerEngine,
        Pattern,
        PatternRecognizer,
        RecognizerResult,
    )
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    _PRESIDIO_AVAILABLE = True
    _IMPORT_ERROR: Exception | None = None
except Exception as exc:  # noqa: BLE001 — defensive: import-time failure.
    _PRESIDIO_AVAILABLE = False
    _IMPORT_ERROR = exc
    AnalyzerEngine = None  # type: ignore[assignment]
    Pattern = None  # type: ignore[assignment]
    PatternRecognizer = None  # type: ignore[assignment]
    RecognizerResult = None  # type: ignore[assignment]
    NlpEngineProvider = None  # type: ignore[assignment]


# UK-specific regex sources. Postcode pattern intentionally tolerant of
# the optional space (some forms strip it). NI numbers exclude the
# administrative prefixes D, F, I, Q, U, V (and O as second character) per
# HMRC spec. GBP money pattern matches "£1,234.56", "£1234", "GBP 50".
_UK_POSTCODE_RE = r"\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b"
_UK_NINO_RE = r"\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b"
_GBP_MONEY_RE = r"(?:£|GBP\s?)\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?\b"


@dataclass(slots=True)
class AnalysedSpan:
    """Engine-agnostic span shape used downstream by `mapping.tokenise`."""

    start: int
    end: int
    entity_type: str
    score: float
    original: str


_engine: Any | None = None  # AnalyzerEngine when available


def _build_engine() -> Any:
    """Construct the analyser singleton.

    Registers three custom pattern recognisers on top of the spaCy NER
    defaults so Khan-style UK correspondence picks up postcodes / NI
    numbers / GBP amounts that the base recognisers miss.
    """
    if not _PRESIDIO_AVAILABLE:
        raise RuntimeError(
            "anonymisation extra not installed. Install with: "
            '`pip install -e ".[anonymisation]" && '
            "python -m spacy download en_core_web_sm` (from backend/). "
            f"(Underlying import error: {_IMPORT_ERROR!r})"
        )

    model_name = os.environ.get("PRESIDIO_MODEL", "en_core_web_sm")
    nlp_config = {
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": model_name}],
    }
    provider = NlpEngineProvider(nlp_configuration=nlp_config)
    nlp_engine = provider.create_engine()

    engine = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])

    # UK postcode — entity type "LOCATION" so it joins the address bucket.
    engine.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="LOCATION",
            name="uk_postcode",
            patterns=[Pattern(name="uk_postcode", regex=_UK_POSTCODE_RE, score=0.85)],
        )
    )
    # UK National Insurance number.
    engine.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="UK_NINO",
            name="uk_nino",
            patterns=[Pattern(name="uk_nino", regex=_UK_NINO_RE, score=0.9)],
        )
    )
    # GBP currency. Presidio's MONEY recogniser is currency-agnostic and
    # tends to miss the £ symbol; this regex covers "£1,234.56" / "GBP 50".
    engine.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="MONEY",
            name="gbp_money",
            patterns=[Pattern(name="gbp_money", regex=_GBP_MONEY_RE, score=0.7)],
        )
    )
    return engine


def _get_engine() -> Any:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def is_available() -> bool:
    """Cheap check used by callers that want to skip Presidio gracefully."""
    return _PRESIDIO_AVAILABLE


def analyse(
    text: str,
    *,
    threshold: float = 0.4,
    entity_types: list[str] | None = None,
) -> list[AnalysedSpan]:
    """Run Presidio against `text` and return spans sorted right-to-left.

    Sorting by descending start offset is the property the tokeniser
    relies on: replacing right-to-left preserves the start/end indices
    of every span we haven't visited yet.
    """
    if not text:
        return []

    engine = _get_engine()
    results: list[RecognizerResult] = engine.analyze(
        text=text,
        language="en",
        entities=entity_types,
        score_threshold=threshold,
    )

    spans: list[AnalysedSpan] = []
    for r in results:
        original = text[r.start : r.end]
        if not original.strip():
            continue
        spans.append(
            AnalysedSpan(
                start=r.start,
                end=r.end,
                entity_type=r.entity_type,
                score=float(r.score),
                original=original,
            )
        )

    # Presidio occasionally returns overlapping spans (e.g. PERSON and
    # ORG both fire on the same substring). De-dup by keeping the highest-
    # scoring span at any given start offset.
    spans.sort(key=lambda s: (s.start, -s.score))
    deduped: list[AnalysedSpan] = []
    last_end = -1
    for s in spans:
        if s.start < last_end:
            # overlap: skip the lower-scoring one we just appended? Keep
            # the first (higher-scoring by sort key) and drop this.
            continue
        deduped.append(s)
        last_end = s.end

    # Right-to-left for safe in-place replacement.
    deduped.sort(key=lambda s: s.start, reverse=True)
    return deduped


# Re-exports for callers wanting a cheap probe without importing private names.
__all__ = ["AnalysedSpan", "analyse", "is_available"]
