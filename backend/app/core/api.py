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

from app.core.model_gateway import gateway as _gateway
from app.models import AuditEntry, Matter


# Matter context
# --------------

async def get_matter(session: AsyncSession, slug: str) -> Matter | None:
    """Fetch a matter by slug, or None if absent."""
    return await session.scalar(select(Matter).where(Matter.slug == slug))


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
# `plugin_bridge.invoke(plugin, skill, matter_id, inputs)` calls a
# `claude-for-uk-legal` skill with the matter as context. Lands Day 5
# alongside the first end-to-end module invocation.
plugin_bridge = None  # type: ignore[assignment]


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
