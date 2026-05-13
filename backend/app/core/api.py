"""Public API surface for modules.

This is the **stable** surface that workspace modules import. The names exposed
here keep their signatures across `0.1.x`; internals under `app.core.*` are not
stable across patch versions.

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

Real implementations land during the v0.1 build window (see BUILD_PLAN.md).
This file is the public-surface placeholder.
"""

from __future__ import annotations

# Matter context
# --------------
# `require_matter` is a FastAPI dependency that resolves the matter from the
# request path (`/matters/{slug}/...`) and yields the Matter ORM object.
# `get_matter` is the async helper for direct fetch by slug.
#
# def require_matter() -> Matter: ...
# async def get_matter(slug: str) -> Matter | None: ...
require_matter = None  # type: ignore[assignment]
get_matter = None  # type: ignore[assignment]


# Audit log
# ---------
# `audit.log(action, matter_id=..., metadata=...)` writes an AuditEntry row and
# also emits the daily JSONL audit shard in the matter's filesystem mirror.
#
# class _AuditAPI:
#     async def log(self, action: str, *, matter_id: str | None = None,
#                   resource_type: str | None = None, resource_id: str | None = None,
#                   metadata: dict | None = None) -> None: ...
audit = None  # type: ignore[assignment]


# AI gateway
# ----------
# `model_gateway.call(matter_id, prompt, ...)` runs the prompt through the
# matter's resolved model with privilege-posture routing. Returns the response
# string. Audit logging is automatic.
#
# class _ModelGatewayAPI:
#     async def call(self, *, matter_id: str, prompt: str,
#                    system: str | None = None,
#                    model: str | None = None,
#                    posture: str | None = None,
#                    **kwargs) -> str: ...
model_gateway = None  # type: ignore[assignment]


# Plugin bridge
# -------------
# `plugin_bridge.invoke(plugin, skill, matter_id, inputs)` calls a
# `claude-for-uk-legal` skill with the matter as context. Returns the structured
# result dict.
#
# class _PluginBridgeAPI:
#     async def invoke(self, *, plugin: str, skill: str,
#                      matter_id: str, inputs: dict) -> dict: ...
plugin_bridge = None  # type: ignore[assignment]


# Storage
# -------
# S3-compatible blob storage (MinIO in dev, R2 / S3 / Azure Blob in cloud).
# Modules should use this rather than reaching into boto3 directly.
#
# class _StorageAPI:
#     async def put(self, path: str, data: bytes, *, content_type: str | None = None) -> str: ...
#     async def get(self, path: str) -> bytes: ...
#     async def signed_url(self, path: str, *, expires_in: int = 3600) -> str: ...
storage = None  # type: ignore[assignment]


__all__ = [
    "require_matter",
    "get_matter",
    "audit",
    "model_gateway",
    "plugin_bridge",
    "storage",
]
