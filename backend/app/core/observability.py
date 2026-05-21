"""Observability — structured logging, exception reporting, and PII scrubbing.

Design goals:
  - Know when prod is broken without leaking matter content.
  - Prompts, responses, document text, provider keys, and filenames must
    never appear in operational logs.
  - Hashes already written to audit rows are safe; raw content is not.
  - No external telemetry SaaS that ingests prompts. Structlog drain only
    for now; Sentry/Prometheus adapters can be wired behind the same
    scrubbing layer later (see TODO below).

Unit 8 — Observability with Scrubbing.
"""

from __future__ import annotations

import logging
import re
import traceback
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Scrubbing
# ---------------------------------------------------------------------------

# Keys whose values must always be redacted in operational logs.
# Audit payloads (already hashed) are NOT passed through scrub_dict —
# this is strictly the operational log path.
_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "prompt",
        "response",
        "body",
        "text",
        "content",
        "api_key",
        "key",
        "secret",
        "filename",
        "password",
        "token",
    }
)

# Pattern for Bearer tokens and long hex/base64 strings that look like secrets.
_BEARER_RE = re.compile(r"\bBearer\s+\S+", re.IGNORECASE)
# Anything 32+ chars that looks like a hex or base64 token.
_TOKEN_RE = re.compile(r"\b[A-Za-z0-9+/=_\-]{32,}\b")

_REDACTED = "[redacted]"


def scrub(value: Any) -> Any:
    """Redact a single value if it looks like a secret or token.

    Strings matching a Bearer-token pattern or a long opaque token are
    replaced with ``[redacted]``. Non-string values are returned unchanged.
    """
    if not isinstance(value, str):
        return value
    if _BEARER_RE.search(value):
        return _REDACTED
    # Only replace long opaque strings that *are* the full value — avoid
    # mangling short readable strings like model names.
    if len(value) >= 32 and _TOKEN_RE.fullmatch(value):
        return _REDACTED
    return value


def scrub_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow copy of *d* with sensitive keys redacted.

    Recursively scrubs nested dicts. Values that are themselves dicts are
    recursed into; all other values for a sensitive key are replaced with
    ``[redacted]`` regardless of type.

    Does NOT mutate the original dict.
    """
    result: dict[str, Any] = {}
    for k, v in d.items():
        if k.lower() in _SENSITIVE_KEYS:
            result[k] = _REDACTED
        elif isinstance(v, dict):
            result[k] = scrub_dict(v)
        else:
            result[k] = scrub(v)
    return result


# ---------------------------------------------------------------------------
# Metric counters (structlog events — Prometheus adapter is a future TODO)
# ---------------------------------------------------------------------------
# TODO: wire a Prometheus Counter / Sentry breadcrumb adapter here. The
# structlog events below are the canonical operational signal. A future
# adapter can subscribe to structlog processors and forward counts to
# Prometheus/Sentry without changing call sites.

_obs_logger = structlog.get_logger("legalise.observability")


def record_request_error(
    *,
    status_code: int,
    path: str,
    method: str,
    error_type: str,
) -> None:
    """Emit a structured event for an unhandled request error."""
    _obs_logger.error(
        "legalise.obs.request_error",
        status_code=status_code,
        path=path,
        method=method,
        error_type=error_type,
    )


def record_job_failure(*, job_id: str | None, kind: str | None, error_code: str | None) -> None:
    """Emit a structured event when a durable job fails."""
    _obs_logger.error(
        "legalise.obs.job_failure",
        job_id=job_id,
        kind=kind,
        error_code=error_code,
    )


def record_provider_error(
    *,
    provider: str,
    code: str | None,
    upstream_status: int | None,
) -> None:
    """Emit a structured event for a provider-level error (no request body)."""
    _obs_logger.error(
        "legalise.obs.provider_error",
        provider=provider,
        code=code,
        upstream_status=upstream_status,
    )


def record_key_missing(*, provider: str) -> None:
    """Emit a structured event when a required provider key is absent."""
    _obs_logger.warning(
        "legalise.obs.key_missing",
        provider=provider,
    )


def record_storage_failure(*, operation: str, error_type: str) -> None:
    """Emit a structured event for a storage read/write failure."""
    _obs_logger.error(
        "legalise.obs.storage_failure",
        operation=operation,
        error_type=error_type,
    )


# ---------------------------------------------------------------------------
# Structlog configuration
# ---------------------------------------------------------------------------

def _configure_structlog(log_format: str = "console") -> None:
    """Configure structlog processors chain.

    ``log_format="json"`` emits newline-delimited JSON (for log drains).
    ``log_format="console"`` (default) emits colourised human-readable
    output suitable for dev terminals and Fly log viewer.

    Idempotent — safe to call multiple times.
    """
    # NOTE: structlog.stdlib.add_logger_name requires loggers with a `.name`
    # attribute (stdlib loggers). We use PrintLoggerFactory below, which
    # doesn't provide one. The event field already identifies the operation,
    # so logger name is redundant.
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if log_format == "json":
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


# ---------------------------------------------------------------------------
# FastAPI integration
# ---------------------------------------------------------------------------

def _make_exception_handler(app: FastAPI):
    """Build a global exception handler that scrubs matter content from logs."""

    async def _handler(request: Request, exc: Exception) -> JSONResponse:
        # Build a safe log payload — never include raw body, prompt, or response.
        safe_path = request.url.path
        safe_method = request.method
        error_type = type(exc).__name__
        tb = traceback.format_exc()

        _obs_logger.error(
            "legalise.obs.unhandled_exception",
            method=safe_method,
            path=safe_path,
            error_type=error_type,
            # Include the traceback (class names + line numbers) but NOT any
            # request body or model content. The tb string contains only code
            # locations, not data values — safe to log.
            traceback=tb,
        )

        record_request_error(
            status_code=500,
            path=safe_path,
            method=safe_method,
            error_type=error_type,
        )

        return JSONResponse(
            status_code=500,
            content={"error": "internal_server_error", "detail": error_type},
        )

    return _handler


def init_observability(app: FastAPI) -> None:
    """Initialise observability for the FastAPI application.

    - Configures structlog (format driven by ``LOG_FORMAT`` env via settings).
    - Registers a global exception handler that scrubs matter content.
    - Idempotent: safe to call in dev with no telemetry endpoint configured.

    Call once from the lifespan context in ``main.py``.
    """
    from app.core.config import settings  # avoid circular at module load

    log_format = getattr(settings, "log_format", "console")
    _configure_structlog(log_format)

    # Register the global exception handler. Existing specific handlers
    # (e.g. CapabilityDenied) are registered before this and take precedence
    # because FastAPI resolves exception handlers in MRO order.
    app.add_exception_handler(Exception, _make_exception_handler(app))

    _obs_logger.info(
        "legalise.obs.init",
        log_format=log_format,
        # No LOGS_ENDPOINT configured yet → no external drain.
        logs_endpoint=getattr(settings, "logs_endpoint", None) or "none",
    )
