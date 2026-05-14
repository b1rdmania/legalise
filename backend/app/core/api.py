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
        plugin_bridge,
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
- `plugin_bridge`  — placeholder; lands Day 5 with the first plugin invoke.
- `storage`        — placeholder; lands with MinIO/R2 wiring (Day 5+).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters import plugin_bridge as _plugin_bridge_module
from app.core.model_gateway import gateway as _gateway
from app.models import AuditEntry, Matter


# Matter context
# --------------

async def get_matter(
    session: AsyncSession, slug: str, user_id: uuid.UUID
) -> Matter | None:
    """Fetch a matter by `(slug, user_id)`, or None if absent.

    Slug uniqueness is composite per-owner (HANDOVER_AUTH.md §3e
    Option A) — a global slug lookup would be ambiguous, so `user_id`
    is required.
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
        resource_type: str | None = None,
        resource_id: str | None = None,
        payload: dict | None = None,
    ) -> None:
        session.add(
            AuditEntry(
                actor_id=actor_id,
                matter_id=matter_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                payload=payload or {},
            )
        )


audit = _AuditAPI()


# AI gateway
# ----------
# Re-exports the module-level singleton from app.core.model_gateway.
# Callers should treat this as the stable name; the implementation may
# swap behind it without breaking modules.
model_gateway = _gateway


# Plugin bridge
# -------------
# Modules call `plugin_bridge.invoke(...)` to dispatch a
# `claude-for-uk-legal` skill against a matter. The bridge object itself
# is initialised at app startup (`main.lifespan`); modules read it via
# this attribute at call time.

def _get_plugin_bridge():
    return _plugin_bridge_module.bridge


class _PluginBridgeProxy:
    """Module-friendly facade: forwards attribute access to whichever
    PluginBridge instance is currently registered. This avoids a stale
    None reference if a module imports `plugin_bridge` before lifespan
    has run."""

    def __getattr__(self, name):
        bridge = _get_plugin_bridge()
        if bridge is None:
            raise RuntimeError("plugin bridge not initialised — call from a request, not at import")
        return getattr(bridge, name)


plugin_bridge = _PluginBridgeProxy()


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
    "model_gateway",
    "plugin_bridge",
    "storage",
]
