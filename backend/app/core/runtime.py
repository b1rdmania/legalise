"""Phase 10 — host-side runtime: invocation context, provider adapter,
capability dispatcher.

Three public types + one helper + one dispatcher:

- ``InvocationContext`` — the trusted invocation envelope the host
  populates and modules read. Phase 6 R2 P1#3 established the
  contract; Phase 9 surfaced that Contract Review and Pre-Motion
  declared identical local versions; Phase 10 lifts it to substrate.

- ``ProviderResponse`` — canonical seven-field shape modules expect
  back from ``provider_call``. Same convergence story.

- ``make_provider_call(...)`` — adapter that wraps
  ``app.core.api.model_gateway.call(...)`` and translates the
  ``ModelResult`` shape into ``ProviderResponse``. Pinned to the
  real gateway signature (Phase 10 v3 redline).

- ``dispatch_capability(...)`` — resolves a module entrypoint via
  ``importlib`` and dispatches the capability invoke. Pre-dispatch
  validation (matter scope, invokable kind) happens at the endpoint
  layer; the dispatcher trusts the declaration it's given.

The dispatcher is stateless: each invocation re-resolves the
entrypoint. Python's import cache makes this near-free.
"""

from __future__ import annotations

import importlib
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import InstalledModule, Matter


# ---------------------------------------------------------------------------
# Canonical types lifted from the reference modules (Phase 10 Decision #2)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class InvocationContext:
    """Trusted invocation envelope, populated by the host.

    Phase 6 R2 P1#3 established that modules cannot self-assert
    ``actor_role``. The host builds this dataclass from the
    authenticated user record and hands it to the capability; the
    module reads it but cannot construct one with elevated values.
    """

    actor_user_id: uuid.UUID
    actor_role: str
    invocation_id: uuid.UUID


@dataclass(frozen=True)
class ProviderResponse:
    """Canonical shape modules receive back from ``provider_call``.

    Seven fields. Promoted from each module's local declaration in
    Phase 10 (the v2 review surfaced the duplication). The Phase 5
    cost-column helper at ``audit_emit_model_invoked`` expects
    ``cost_micros`` and ``currency`` to be paired (both None or
    both set) — the adapter at ``make_provider_call`` honours that.
    """

    text: str
    model_id: str
    provider: str
    tokens_in: int | None
    tokens_out: int | None
    cost_micros: int | None
    currency: str | None


# ---------------------------------------------------------------------------
# Adapter — gateway shape → module shape (Phase 10 v3 Decision #4)
# ---------------------------------------------------------------------------


ProviderCallable = Callable[..., Awaitable[ProviderResponse]]


def make_provider_call(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_user_id: uuid.UUID,
    module_id: str,
    capability_id: str,
    invocation_id: uuid.UUID,
) -> ProviderCallable:
    """Build the ``provider_call`` callable the dispatcher hands to modules.

    Wraps ``model_gateway.call(...)`` with the seven-field mapping the
    Phase 10 v3 plan pinned in Decision #4. Pins to the real gateway
    signature at ``backend/app/core/model_gateway.py:320`` — uses
    ``model=`` (not ``requested_model=``), ``caller_module=`` (not
    ``module=``), and a ``payload`` deliberately restricted to
    ``capability_id`` + ``invocation_id``.

    Critical: the payload MUST NOT include ``plugin`` or ``skill``.
    At ``model_gateway.py:364-378`` the gateway runs a legacy
    workspace-scope ``require_capability("model.invoke", ...)`` check
    whenever both keys are present in the payload. Phase 7's grant
    lifecycle never creates a ``model.invoke`` workspace grant — only
    matter-scoped grants from declared reads + writes. A naive payload
    would make both reference modules fail immediately. Phase 10
    explicitly keeps this contract; Phase 12+ may revisit if matter-
    scoped ``model.invoke`` rolls out.

    Propagates ``ProviderKeyMissing`` and ``ProviderUpstreamError``
    unchanged so the endpoint can translate them per Decision #5 v2.
    """
    from app.core.api import model_gateway

    async def _provider_call(prompt: str, *, system: str | None = None) -> ProviderResponse:
        result = await model_gateway.call(
            session=session,
            matter_id=matter.id,
            actor_id=actor_user_id,
            prompt=prompt,
            model=matter.default_model_id,
            system=system,
            caller_module=module_id,
            payload={
                "capability_id": capability_id,
                "invocation_id": str(invocation_id),
            },
        )
        return ProviderResponse(
            text=result.text,
            # The requested model (what the matter asked for), not the
            # provider's internal name. result.model_used carries the
            # provider name; we map it to ProviderResponse.provider.
            model_id=matter.default_model_id or result.model_used,
            provider=result.model_used,
            tokens_in=result.token_count,
            # Sentinel — pinned at 0 so the audit row's
            # token_count = tokens_in + tokens_out stays honestly equal
            # to the gateway's authoritative combined count. A future
            # provider-protocol extension can split correctly without
            # touching modules.
            tokens_out=0,
            # The gateway doesn't price calls today; cost_micros +
            # currency stay None together (Phase 5 check constraint).
            cost_micros=None,
            currency=None,
        )

    return _provider_call


# ---------------------------------------------------------------------------
# Dispatcher — importlib-driven, stateless (Phase 10 Decision #3)
# ---------------------------------------------------------------------------


class CapabilityNotDeclared(Exception):
    """Raised when the requested ``capability_id`` is not declared in the
    installed manifest. The endpoint translates to HTTP 404
    ``capability_not_declared``."""

    def __init__(self, module_id: str, capability_id: str) -> None:
        self.module_id = module_id
        self.capability_id = capability_id
        super().__init__(
            f"capability {capability_id!r} not declared in module {module_id!r}"
        )


class EntrypointResolutionError(Exception):
    """Raised when the manifest's entrypoint can't be imported or the
    entry class is missing. Translates to HTTP 500 — this is a
    install-side data problem, not a request-side error."""


def _resolve_entrypoint(installed_module: InstalledModule):
    """Import the module's entrypoint class per its manifest.

    Each invocation re-imports — Python's import cache makes this
    near-free, and a fresh import means a future hot-reload phase can
    invalidate it without disturbing the dispatcher.
    """
    manifest = installed_module.manifest_snapshot or {}
    entrypoint = manifest.get("entrypoint") or {}
    python_module = entrypoint.get("python_module")
    entry_name = entrypoint.get("entry")
    if not python_module or not entry_name:
        raise EntrypointResolutionError(
            f"module {installed_module.module_id!r} v{installed_module.version} "
            f"manifest missing entrypoint.python_module or .entry"
        )
    try:
        module = importlib.import_module(python_module)
    except ImportError as exc:
        raise EntrypointResolutionError(
            f"cannot import {python_module!r}: {exc}"
        ) from exc
    try:
        entry_class = getattr(module, entry_name)
    except AttributeError as exc:
        raise EntrypointResolutionError(
            f"module {python_module!r} has no attribute {entry_name!r}"
        ) from exc
    return entry_class


def _find_capability_declaration(
    manifest: dict[str, Any], capability_id: str
) -> dict[str, Any] | None:
    """Locate the capability declaration in a v2 manifest snapshot.

    Returns the inner dict or None. Same shape Phase 7
    ``grants_lifecycle._find_capability_declaration`` uses.
    """
    for cap in manifest.get("capabilities") or []:
        if cap.get("id") == capability_id:
            return cap
    return None


async def dispatch_capability(
    session: AsyncSession,
    *,
    installed_module: InstalledModule,
    capability_declaration: dict[str, Any],
    matter: Matter,
    context: InvocationContext,
    args: dict[str, Any],
    provider_call: ProviderCallable,
) -> dict[str, Any]:
    """Resolve the module's entrypoint via importlib and dispatch.

    Pre-dispatch validation (matter scope, invokable kind) is the
    endpoint's responsibility — see Decision #7. By the time the
    dispatcher runs, the capability declaration has been confirmed
    matter-scope + invokable-kind.

    The dispatcher does NOT catch capability exceptions. They
    propagate to the endpoint which translates per Decision #5 v2.
    """
    capability_id = capability_declaration.get("id")
    if not capability_id:
        raise CapabilityNotDeclared(installed_module.module_id, "<missing-id>")

    entry_class = _resolve_entrypoint(installed_module)
    entry = entry_class()

    # The entry class's invoke() signature is fixed by the module-
    # author convention Contract Review + Pre-Motion both follow.
    return await entry.invoke(
        capability_id,
        session=session,
        matter=matter,
        context=context,
        args=args,
        provider_call=provider_call,
    )


__all__ = [
    "CapabilityNotDeclared",
    "EntrypointResolutionError",
    "InvocationContext",
    "ProviderCallable",
    "ProviderResponse",
    "dispatch_capability",
    "make_provider_call",
]
