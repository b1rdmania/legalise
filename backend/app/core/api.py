"""Public API surface for modules.

This is the **stable** surface that workspace modules import. The names
exposed here keep their signatures across `0.1.x`; internals under
`app.core.*` are not stable across patch versions.

Modules should import only from this file:

    from app.core.api import (
        require_matter,
        get_matter,
        audit,
        model_gateway,
        storage,
    )

If a primitive you need isn't here, open an issue rather than reaching into
internals. The contract is part of the platform.

Status (R3, Day 4):
- `model_gateway`  — wired to the real ModelGateway singleton.
- `audit`          — wired to a thin helper that writes AuditEntry rows.
- `get_matter`     — wired to a slug-based lookup.
- `require_matter` — placeholder; FastAPI dependency lands when modules
                     get their own routers (Day 5).
- `storage`        — placeholder; lands with MinIO/R2 wiring (Day 5+).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)

from app.core.model_gateway import PrivilegePaused, gateway as _gateway
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.models import AuditEntry, Matter


# Matter context
# --------------

async def get_matter(
    session: AsyncSession, slug: str, user_id: uuid.UUID
) -> Matter | None:
    """Fetch a matter by `(slug, user_id)`, or None if absent.

    Slug uniqueness is composite per-owner; a global slug lookup would
    be ambiguous, so `user_id` is required.
    """
    return await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user_id)
    )


# `require_matter` is a FastAPI dependency. It lands Day 5 alongside the
# first module router; placeholder until then so an import doesn't blow up
# but a call site does.
require_matter = None  # type: ignore[assignment]


# Audit log
# ---------

@dataclass
class _AuditAPI:
    """Thin helper that writes one AuditEntry per call.

    The session is the caller's responsibility — `log` adds the row, but
    does not commit. That keeps the audit row in the same transaction as
    the work it audits, so a rollback rolls both back together.
    """

    async def log(
        self,
        session: AsyncSession,
        action: str,
        *,
        actor_id: uuid.UUID | None = None,
        matter_id: uuid.UUID | None = None,
        module: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        payload: dict | None = None,
        model_used: str | None = None,
        prompt_hash: str | None = None,
        response_hash: str | None = None,
        token_count: int | None = None,
        latency_ms: int | None = None,
        # Cost columns. Populated by audit_emit_model_invoked
        # for model.invoked rows; left None for everything else.
        tokens_in: int | None = None,
        tokens_out: int | None = None,
        cost_micros: int | None = None,
        currency: str | None = None,
        provider: str | None = None,
        model_id: str | None = None,
    ) -> None:
        session.add(
            AuditEntry(
                actor_id=actor_id,
                matter_id=matter_id,
                action=action,
                module=module,
                resource_type=resource_type,
                resource_id=resource_id,
                model_used=model_used,
                prompt_hash=prompt_hash,
                response_hash=response_hash,
                token_count=token_count,
                latency_ms=latency_ms,
                payload=payload or {},
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost_micros=cost_micros,
                currency=currency,
                provider=provider,
                model_id=model_id,
            )
        )


audit = _AuditAPI()


PROVIDER_HTTP_EXCEPTIONS = (
    PrivilegePaused,
    ProviderKeyMissing,
    ProviderUpstreamError,
)


def provider_error_http_exception(
    exc: PrivilegePaused | ProviderKeyMissing | ProviderUpstreamError,
    *,
    missing_key_message: str | None = None,
    upstream_shape: Literal["module", "generic"] = "module",
) -> HTTPException:
    """Translate model-provider exceptions into the canonical HTTP envelopes.

    Most module routers expose upstream failures as ``{"error": exc.code,
    "message": str(exc)}``. The generic invocation endpoint historically uses
    ``{"error": "provider_upstream_error", "code": exc.code}``. Keep both
    shapes explicit so callers can centralise translation without changing
    their public wire contract.
    """
    if isinstance(exc, PrivilegePaused):
        return HTTPException(409, str(exc))
    if isinstance(exc, ProviderKeyMissing):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "provider_key_missing",
                "provider": getattr(exc, "provider", None),
                "message": missing_key_message or str(exc),
            },
        )

    if upstream_shape == "generic":
        return HTTPException(
            status_code=502,
            detail={
                "error": "provider_upstream_error",
                "provider": getattr(exc, "provider", None),
                "code": getattr(exc, "code", None),
                "upstream_status": getattr(exc, "upstream_status", None),
            },
        )

    return HTTPException(
        status_code=502,
        detail={
            "error": exc.code,
            "provider": exc.provider,
            "upstream_status": exc.upstream_status,
            "message": str(exc),
        },
    )


def http_error(
    status_code: int,
    error: str,
    *,
    message: str | None = None,
    **detail: object,
) -> HTTPException:
    """Build a structured FastAPI HTTPException envelope.

    Keeps repeated ``{"error": ..., "message": ...}`` shapes consistent
    without hiding the status code at call sites.
    """
    payload: dict[str, object] = {"error": error}
    if message is not None:
        payload["message"] = message
    payload.update({key: value for key, value in detail.items() if value is not None})
    return HTTPException(status_code=status_code, detail=payload)


def storage_write_http_exception(
    *,
    message: str,
    storage_key: str,
    backend: str,
) -> HTTPException:
    return http_error(
        502,
        "storage_write_failed",
        message=message,
        storage_key=storage_key,
        backend=backend,
    )


async def audit_storage_write_failure(
    request_session: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    matter_id: uuid.UUID | None,
    resource_type: str,
    resource_id: str,
    storage_key: str,
    backend: str,
    error_code: str,
    **payload: object,
) -> None:
    """Record a storage write failure in the committed failure-audit path."""
    await audit_failure(
        request_session,
        "storage.put_bytes.failed",
        actor_id=actor_id,
        matter_id=matter_id,
        module="storage",
        resource_type=resource_type,
        resource_id=resource_id,
        payload={
            "storage_key": storage_key,
            "backend": backend,
            "error_code": error_code,
            **payload,
        },
    )


async def audit_failure(
    request_session: AsyncSession,
    action: str,
    *,
    actor_id: uuid.UUID | None = None,
    matter_id: uuid.UUID | None = None,
    module: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    payload: dict | None = None,
    model_used: str | None = None,
    prompt_hash: str | None = None,
    response_hash: str | None = None,
    token_count: int | None = None,
    latency_ms: int | None = None,
) -> None:
    """Write a failure-provenance audit row in its own committed transaction.

    Use this from any failure path that will raise HTTPException (or
    propagate an exception) before the caller's request session has a
    chance to commit. `audit.log` adds the row to the request session,
    which is correct for success/blocked rows that commit alongside
    the semantic work — but on failure the request session gets rolled
    back, taking the audit row with it.

    `audit_failure` opens a fresh `AsyncSession` bound to the same
    engine as the request session, writes the row, and commits before
    returning. It does NOT participate in the request session's
    transaction, so the row survives any subsequent rollback.

    Required because ProviderKeyMissing + ProviderUpstreamError audit
    rows in `model_gateway.py` and storage upload/download failure audit
    rows can otherwise be lost to rollback. All failure-provenance audit
    writes must use this helper.

    Implementation note: the conftest test pattern wraps the request
    session in a SAVEPOINT inside an outer transaction. A separate
    session opened on the same engine connects via its own pooled
    connection, so its commit is independent of the SAVEPOINT.
    """
    bind = request_session.bind
    if bind is None:
        # Test or fixture context where the session isn't bound to an
        # engine. Best-effort: drop the audit row rather than crash.
        # In production, sessions always have a bind.
        return

    # If the session is bound to an AsyncConnection (the conftest pattern
    # wraps each test in an outer transaction on a specific connection),
    # walk up to the AsyncEngine so the new sessionmaker checks out a
    # fresh connection from the pool. Do not use a generic `.engine`
    # attribute check here: AsyncEngine exposes a sync `.engine` alias,
    # and handing that sync Engine to async_sessionmaker crashes the
    # failure path in production.
    if isinstance(bind, AsyncConnection):
        bind = bind.engine
    elif not isinstance(bind, AsyncEngine):
        # Unexpected/test-only bind shape. Best-effort: do not let a
        # failure-audit attempt turn the original API error into a 500.
        return

    factory = async_sessionmaker(bind, expire_on_commit=False)
    async with factory() as audit_session:
        audit_session.add(
            AuditEntry(
                actor_id=actor_id,
                matter_id=matter_id,
                action=action,
                module=module,
                resource_type=resource_type,
                resource_id=resource_id,
                model_used=model_used,
                prompt_hash=prompt_hash,
                response_hash=response_hash,
                token_count=token_count,
                latency_ms=latency_ms,
                payload=payload or {},
            )
        )
        await audit_session.commit()


# Neutral alias for the same independent-committed-transaction write.
# `audit_failure` is named for its commonest use (failure provenance that
# must survive a rollback), but the identical mechanism is also the right
# tool for a *success-path* audit row that must NOT keep the audit chain's
# per-scope advisory lock (migration 0030 trigger) held on the request
# session across a later long, fallible operation. The assistant writes its
# `retrieval.search` row this way: holding that lock across the model call
# deadlocks the model-failure paths, which append their own audit on a
# separate connection that would otherwise block on it. Same code, clearer
# intent at the call site — see pipeline._audit_retrieval_search.
audit_out_of_band = audit_failure


# AI gateway
# ----------
# Re-exports the module-level singleton from app.core.model_gateway.
# Callers should treat this as the stable name; the implementation may
# swap behind it without breaking modules.
model_gateway = _gateway


# Storage
# -------
# S3-compatible blob storage (MinIO in dev, R2 in cloud). Lands when
# binary document uploads switch from metadata-only to real storage
# (Week 1 Day 5+).
storage = None  # type: ignore[assignment]


__all__ = [
    "require_matter",
    "get_matter",
    "audit",
    "audit_failure",
    "audit_out_of_band",
    "audit_storage_write_failure",
    "http_error",
    "PROVIDER_HTTP_EXCEPTIONS",
    "provider_error_http_exception",
    "storage_write_http_exception",
    "model_gateway",
    "storage",
]
