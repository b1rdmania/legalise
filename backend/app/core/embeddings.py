"""Embedding service for audited retrieval (P3).

Local and keyless by default. The default backend (`fastembed`,
BAAI/bge-small-en-v1.5, 384-dim ONNX, CPU, no torch) runs in-process so a
fork works with no API keys *and* — the privilege-critical part —
**privileged matter content is never sent to a third party to be indexed**.
The search index stays in-tenant; this extends the privilege posture to
retrieval rather than weakening it.

A deterministic, dependency-free `hash` backend (also 384-dim) is the
fallback for tests and keyless CI. Both backends emit unit-norm 384-dim
vectors because the pgvector column and cosine index are fixed at 384 for v1.

Backends are selected by ``settings.embedding_backend``
(``LEGALISE_EMBEDDING_BACKEND``). The fastembed model is loaded lazily on
first embed call (a singleton), so importing this module never triggers a
model download, and the synchronous CPU work runs in a worker thread via
``anyio.to_thread.run_sync`` so it does not block the event loop.

If fastembed is selected but not importable, we raise a clear ``RuntimeError``
rather than silently falling back — a silent fall back to the hash backend
would corrupt the index with vectors that are dimensionally identical but
semantically incompatible.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import TYPE_CHECKING

import anyio

from app.core.config import settings

if TYPE_CHECKING:
    from fastembed import TextEmbedding

EMBEDDING_DIM = 384

# fastembed model id — BAAI/bge-small-en-v1.5 is 384-dim and expects cosine
# similarity over L2-normalised vectors.
_FASTEMBED_MODEL_NAME = "BAAI/bge-small-en-v1.5"

# Lazily-instantiated singleton; loaded on first embed call, not on import.
_fastembed_model: "TextEmbedding | None" = None

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _l2_normalize(vector: list[float]) -> list[float]:
    """Return the unit-norm version of ``vector`` (cosine-ready)."""
    norm = math.sqrt(sum(component * component for component in vector))
    if norm == 0.0:
        return vector
    return [component / norm for component in vector]


# --- hash backend ---------------------------------------------------------


def _embed_hash(text: str) -> list[float]:
    """Deterministic 384-dim embedding with no external dependencies.

    Tokens are hashed into ``EMBEDDING_DIM`` buckets; the resulting vector is
    L2-normalised so it lives on the same unit sphere as the model backend.
    Deterministic across processes (uses ``hashlib``, not ``hash()``).
    """
    vector = [0.0] * EMBEDDING_DIM
    for token in _TOKEN_RE.findall(text.lower()):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % EMBEDDING_DIM
        # Sign bit from a separate digest byte to spread mass +/-.
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[bucket] += sign
    return _l2_normalize(vector)


# --- fastembed backend ----------------------------------------------------


def _get_fastembed_model() -> "TextEmbedding":
    """Load (once) and return the cached fastembed model.

    Raises a clear ``RuntimeError`` if fastembed is not installed, pointing
    the operator at the retrieval extra or the hash backend.
    """
    global _fastembed_model
    if _fastembed_model is not None:
        return _fastembed_model

    try:
        from fastembed import TextEmbedding
    except ImportError as exc:  # pragma: no cover - import-guard
        raise RuntimeError(
            "fastembed is not installed but LEGALISE_EMBEDDING_BACKEND="
            "'fastembed'. Install the retrieval extra (e.g. "
            "`pip install 'legalise-backend[retrieval]'`) or set "
            "LEGALISE_EMBEDDING_BACKEND=hash for keyless/test environments."
        ) from exc

    _fastembed_model = TextEmbedding(model_name=_FASTEMBED_MODEL_NAME)
    return _fastembed_model


def _embed_fastembed_sync(texts: list[str]) -> list[list[float]]:
    """Synchronous fastembed call — must run in a worker thread."""
    model = _get_fastembed_model()
    # fastembed yields numpy arrays; bge embeddings ship normalised but we
    # normalise again defensively so callers can rely on unit-norm output.
    return [_l2_normalize([float(x) for x in vector]) for vector in model.embed(texts)]


# --- public interface -----------------------------------------------------


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts into ``EMBEDDING_DIM``-dim unit vectors.

    Returns one vector per input, in order. Empty input returns ``[]``.
    """
    if not texts:
        return []

    backend = settings.embedding_backend
    if backend == "hash":
        return [_embed_hash(text) for text in texts]
    if backend == "fastembed":
        # fastembed is sync/CPU — offload so we don't block the event loop.
        return await anyio.to_thread.run_sync(_embed_fastembed_sync, texts)

    raise RuntimeError(
        f"Unknown LEGALISE_EMBEDDING_BACKEND={backend!r}; "
        "expected 'fastembed' or 'hash'."
    )


async def embed_query(text: str) -> list[float]:
    """Embed a single query string into one ``EMBEDDING_DIM``-dim vector."""
    [vector] = await embed_texts([text])
    return vector
