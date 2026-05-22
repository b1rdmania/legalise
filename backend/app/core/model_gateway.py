"""Model gateway — privilege-aware routing across Anthropic, OpenAI, Ollama.

Every call writes an `AuditEntry` row with prompt/response hashes, model used,
token count and latency. Privilege posture gates which provider can serve the
call:

    A_cleared  →  frontier or local — caller's choice
    B_mixed    →  local preferred when an Ollama URL is reachable;
                  frontier permitted with explicit consent
    C_paused   →  no LLM calls at all — raises PrivilegePaused

v0.1 ships the routing + audit logic plus a deterministic stub provider so
the rest of the workspace can run end-to-end without API keys. Real Anthropic
/ OpenAI / Ollama HTTP wiring lands Week 1 Day 5 (`provider_anthropic.py` etc.)
"""

from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Any, Awaitable, Callable, Protocol

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.observability import record_key_missing, record_provider_error, scrub_dict
from app.core.user_keys import (
    ProviderKeyMissing,
    ProviderUpstreamError,
    get_user_provider_key,
    mark_user_key_used,
)
from app.models import Matter

# Providers that require a per-user (or server-fallback) API key. Ollama
# and stub-echo run keyless; everything else routes through user_keys.
_KEYED_PROVIDERS = {"anthropic", "openai"}
_DEV_ENVIRONMENTS = {"development", "dev", "local"}


def provider_for_model(model_id: str | None) -> str | None:
    """Map a model id to the provider name registered with the gateway.

    Returns None for keyless models (`stub-echo`, ollama-served local
    models, anything else). Shared between `_select_provider` and the
    SSE preflight in `pre_motion/router.py` so a model-id rename can't
    let the two drift.
    """
    if not model_id:
        return None
    if model_id.startswith("claude-"):
        return "anthropic"
    if model_id.startswith("gpt-"):
        return "openai"
    # Allow direct provider-name passthrough for tests and explicit calls.
    if model_id in _KEYED_PROVIDERS or model_id in {"ollama", "stub-echo"}:
        return model_id if model_id in _KEYED_PROVIDERS else None
    return None


class PrivilegePosture(str, Enum):
    A_CLEARED = "A_cleared"
    B_MIXED = "B_mixed"
    C_PAUSED = "C_paused"


class PrivilegePaused(RuntimeError):
    """Raised when a model call is attempted on a C_paused matter."""


class ToolNotFound(RuntimeError):
    """Raised when `invoke_tool` is asked for a name that isn't registered."""


class ToolValidationError(ValueError):
    """Raised when tool input or output fails its Pydantic model."""


@dataclass
class GatewayTool:
    """A registered tool callable through `ModelGateway.invoke_tool`.

    `input_model` and `output_model` are Pydantic models; their
    `model_json_schema()` is the wire-format JSON Schema (no separate
    `jsonschema` lib dep — design call G4.1).

    `handler` is `async def handler(inputs, *, session, actor_id, matter_id)`;
    return value is validated against `output_model` before the gateway
    returns the dict to the caller.
    """

    name: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    handler: Callable[..., Awaitable[Any]]
    posture_gated: bool = True


# `ProviderKeyMissing` is re-exported so routers catch it via the same
# import surface as `PrivilegePaused`. Defined in `app.core.user_keys`.


@dataclass
class ModelResult:
    text: str
    model_used: str
    prompt_hash: str
    response_hash: str
    token_count: int
    latency_ms: int


class ModelProvider(Protocol):
    name: str

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        """Return (response_text, approximate_token_count)."""


class StubProvider:
    """Deterministic dev provider — no network. Returns a recognisable echo
    so smoke tests and Day-2/3 fixtures work without an API key."""

    def __init__(self, name: str = "stub-echo"):
        self.name = name

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        head = prompt.strip().splitlines()[0][:120] if prompt.strip() else "(empty)"
        text = f"[{self.name}] {head}"
        tokens = max(1, len(prompt) // 4 + len(text) // 4)
        return text, tokens


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


class ModelGateway:
    """Per-matter, privilege-aware model routing.

    Construct once at app startup with the providers available in this
    deployment. Call `gateway.call(...)` with the matter's slug + posture.
    """

    def __init__(self, providers: dict[str, ModelProvider] | None = None):
        self._providers: dict[str, ModelProvider] = providers or {}
        # Always-available dev fallback.
        self._providers.setdefault("stub-echo", StubProvider())
        # Tool registry — populated at lifespan startup by
        # `app.core.tools.register_phase_a_tools(gateway)`.
        self._tools: dict[str, GatewayTool] = {}

    def register(self, provider: ModelProvider) -> None:
        self._providers[provider.name] = provider

    # ------------------------------------------------------------------
    # Tool registry
    # ------------------------------------------------------------------

    def register_tool(self, tool: GatewayTool) -> None:
        """Register (or overwrite) a tool by name."""
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> GatewayTool | None:
        return self._tools.get(name)

    def clear_tools(self) -> None:
        """Drop all registered tools. Intended for tests."""
        self._tools.clear()

    def list_tools(self) -> list[GatewayTool]:
        return list(self._tools.values())

    async def invoke_tool(
        self,
        name: str,
        *,
        session: AsyncSession,
        actor_id: uuid.UUID,
        matter_id: uuid.UUID | None,
        inputs: dict,
        plugin: str | None = None,
        skill: str | None = None,
    ) -> dict:
        """Invoke a registered tool by name.

        Validates `inputs` against the tool's `input_model`. If the tool
        is posture-gated, `matter_id` is REQUIRED and the matter's
        `privilege_posture` is read authoritatively from the DB; C_paused
        raises `PrivilegePaused`. Runs the handler, validates the result
        against `output_model`, and returns `model_dump()`.

        Tools that legitimately operate without a matter (admin / system
        scope) must be registered with `posture_gated=False`.
        """
        tool = self._tools.get(name)
        if tool is None:
            raise ToolNotFound(f"tool not registered: {name}")

        # Runtime capability enforcement: tool calls made on behalf of a
        # `(plugin, skill)` need `model.invoke` for that triple. Non-module
        # tool invocations (user-initiated, internal jobs) skip the check.
        # Tools that write privileged resources also need the matching
        # write capability: `generate_docx` -> `document.generated.write`.
        if plugin and skill and actor_id is not None:
            from app.core.capabilities import require_capability

            await require_capability(
                session,
                user_id=actor_id,
                plugin=plugin,
                skill=skill,
                capability="model.invoke",
            )
            # Tool-specific capability map. Kept inline (a handful of
            # entries) until the registry grows; lift to GatewayTool
            # metadata when that happens.
            _TOOL_WRITE_CAPABILITY = {
                "generate_docx": "document.generated.write",
            }
            extra_cap = _TOOL_WRITE_CAPABILITY.get(name)
            if extra_cap is not None:
                await require_capability(
                    session,
                    user_id=actor_id,
                    plugin=plugin,
                    skill=skill,
                    capability=extra_cap,
                )

        try:
            validated_inputs = tool.input_model.model_validate(inputs)
        except ValidationError as exc:
            raise ToolValidationError(f"input validation failed for {name}: {exc}") from exc

        if tool.posture_gated:
            if matter_id is None:
                # Refuse: posture-gated tools must be scoped to a matter so
                # the C_paused gate cannot be bypassed by omitting matter_id.
                # Tools that legitimately need to run without a matter must
                # be registered with posture_gated=False explicitly.
                raise PrivilegePaused(
                    f"tool {name!r} is posture-gated; matter_id is required"
                )
            posture_row = await session.scalar(
                select(Matter.privilege_posture).where(Matter.id == matter_id)
            )
            if posture_row is None:
                raise PrivilegePaused(f"matter not found for matter_id={matter_id}")
            if PrivilegePosture(posture_row) is PrivilegePosture.C_PAUSED:
                raise PrivilegePaused(
                    "Matter privilege posture is C_paused — tool invocation is blocked. "
                    "Change posture to A_cleared or B_mixed to proceed."
                )

        result = await tool.handler(
            validated_inputs,
            session=session,
            actor_id=actor_id,
            matter_id=matter_id,
        )

        # Handlers may return either a Pydantic model instance or a dict.
        if isinstance(result, tool.output_model):
            validated_output = result
        else:
            try:
                validated_output = tool.output_model.model_validate(result)
            except ValidationError as exc:
                raise ToolValidationError(
                    f"output validation failed for {name}: {exc}"
                ) from exc

        return validated_output.model_dump(mode="json")

    def _select_provider(self, requested: str, posture: PrivilegePosture) -> ModelProvider:
        if posture is PrivilegePosture.B_MIXED:
            # Prefer a local model if configured and reachable. v0.1 cannot
            # probe reachability synchronously, so we trust the requested
            # model unless it's obviously frontier and a local exists.
            local = self._providers.get("ollama")
            if local is not None and requested.startswith(("claude-", "gpt-")):
                return local
        # Map a model id (e.g. claude-opus-4-7) onto a provider name
        # (anthropic). Without this, a Claude model id falls through to
        # stub-echo because the gateway only stores `anthropic`/`openai`
        # under their provider-name keys.
        provider_name = provider_for_model(requested)
        if provider_name is not None and provider_name in self._providers:
            return self._providers[provider_name]
        return self._providers.get(requested) or self._providers["stub-echo"]

    def select_provider_name(
        self, requested: str | None, posture: PrivilegePosture
    ) -> str:
        """Public peek at which provider would serve `(model, posture)`.

        Returns the provider name (`"anthropic"`, `"openai"`, `"ollama"`,
        `"stub-echo"`, …) the gateway would route to right now, given
        the currently-registered provider set. Preflight callers use
        this to decide whether to require a user-supplied API key —
        avoids preflights being stricter than the gateway's own routing
        (e.g. demanding an Anthropic key on a `B_mixed` matter where
        Ollama is registered and would actually serve the request).
        """
        model = requested or settings.default_model_id
        return self._select_provider(model, posture).name

    @staticmethod
    def is_keyed_provider(name: str) -> bool:
        """True if the named provider requires a user-supplied API key."""
        return name in _KEYED_PROVIDERS

    async def call(
        self,
        *,
        session: AsyncSession,
        matter_id: uuid.UUID | None,
        actor_id: uuid.UUID | None,
        prompt: str,
        model: str | None = None,
        posture: PrivilegePosture | None = None,
        system: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        payload: dict | None = None,
        caller_module: str | None = None,
    ) -> ModelResult:
        # Privilege posture is authoritative from the matter row in this
        # session, never from a caller-supplied argument. This closes the
        # TOCTOU window where a caller reads posture as B_mixed, an
        # administrator changes it to C_paused, and the caller dispatches
        # using the stale value. The `posture` parameter is accepted for
        # tooling/tests when matter_id is None; if both are provided, the
        # DB-derived value wins.
        effective_posture: PrivilegePosture
        if matter_id is not None:
            row = await session.scalar(select(Matter.privilege_posture).where(Matter.id == matter_id))
            if row is None:
                raise PrivilegePaused(f"matter not found for matter_id={matter_id}")
            effective_posture = PrivilegePosture(row)
        elif posture is not None:
            effective_posture = posture
        else:
            effective_posture = PrivilegePosture.B_MIXED

        if effective_posture is PrivilegePosture.C_PAUSED:
            raise PrivilegePaused(
                "Matter privilege posture is C_paused — LLM calls are blocked. "
                "Change posture to A_cleared or B_mixed to proceed."
            )

        # Runtime capability enforcement: if this call is attributed to a
        # `(plugin, skill)` (payload carries both keys), require the
        # `model.invoke` grant for that triple. Non-module-attributed
        # calls (user-initiated assistant turns, internal jobs) skip the
        # check — the existing per-matter privilege gate above stands.
        if (
            actor_id is not None
            and isinstance(payload, dict)
            and payload.get("plugin")
            and payload.get("skill")
        ):
            from app.core.capabilities import require_capability

            await require_capability(
                session,
                user_id=actor_id,
                plugin=str(payload["plugin"]),
                skill=str(payload["skill"]),
                capability="model.invoke",
            )

        requested = model or settings.default_model_id
        provider = self._select_provider(requested, effective_posture)

        # Per-user key resolution for keyed providers (anthropic, openai).
        # Ollama/stub-echo are keyless. If the user has no key and the
        # dev-only server fallback isn't permitted, raise structured
        # ProviderKeyMissing — routers translate to 422 with a UI nudge.
        provider_kwargs: dict = {}
        if provider.name in _KEYED_PROVIDERS:
            user_key: str | None = None
            if actor_id is not None:
                user_key = await get_user_provider_key(session, actor_id, provider.name)

            if user_key is None:
                fallback_allowed = (
                    settings.environment in _DEV_ENVIRONMENTS
                    and settings.allow_server_key_fallback
                )
                if not fallback_allowed:
                    # Unit 8: emit scrubbed operational event — no key material logged.
                    record_key_missing(provider=provider.name)
                    # Audit provenance for key-missing failures. R3 review
                    # surfaced that `audit.log(session, ...)` from a failure
                    # path is rolled back when the caller raises HTTPException
                    # — the row never reaches the DB. `audit_failure` opens
                    # an independent committed transaction so the row
                    # survives any subsequent rollback.
                    _km_module = caller_module or "unknown"
                    from app.core.api import audit_failure as _audit_failure
                    await _audit_failure(
                        session,
                        f"module.{_km_module}.model.key_missing",
                        actor_id=actor_id,
                        matter_id=matter_id,
                        module=_km_module,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        model_used=provider.name,
                        payload={
                            "requested_model": requested,
                            "posture": effective_posture.value,
                            "provider": provider.name,
                            "error": {"code": "key_missing", "provider": provider.name},
                            **(payload or {}),
                        },
                    )
                    raise ProviderKeyMissing(provider.name)
                # Fall through with no api_key kwarg — provider uses its
                # construct-time fallback. Dev only.
            else:
                provider_kwargs["api_key"] = user_key

        start = time.perf_counter()
        try:
            response_text, tokens = await provider.call(prompt, system=system, **provider_kwargs)
        except ProviderUpstreamError as exc:
            # Audit provenance is mandatory on failure: a failed model call
            # is just as accountable as a successful one. R3 review: use
            # `audit_failure` (separate committed session) so the row
            # survives the caller's rollback when the exception bubbles
            # up to the HTTPException handler.
            latency_ms = int((time.perf_counter() - start) * 1000)
            # Unit 8: emit scrubbed operational event — provider name and
            # error code only; no request body or prompt text logged.
            record_provider_error(
                provider=exc.provider,
                code=exc.code,
                upstream_status=exc.upstream_status,
            )
            from app.core.api import audit_failure  # lazy import, see success path

            await audit_failure(
                session,
                "model.call.error",
                actor_id=actor_id,
                matter_id=matter_id,
                module=caller_module,
                resource_type=resource_type,
                resource_id=resource_id,
                model_used=provider.name,
                prompt_hash=_sha(prompt),
                response_hash=None,
                token_count=None,
                latency_ms=latency_ms,
                payload={
                    "requested_model": requested,
                    "posture": effective_posture.value,
                    "error": {
                        "code": exc.code,
                        "provider": exc.provider,
                        "upstream_status": exc.upstream_status,
                    },
                    **(payload or {}),
                },
            )
            raise
        latency_ms = int((time.perf_counter() - start) * 1000)

        if provider.name in _KEYED_PROVIDERS and actor_id is not None and "api_key" in provider_kwargs:
            await mark_user_key_used(session, actor_id, provider.name)

        result = ModelResult(
            text=response_text,
            model_used=provider.name,
            prompt_hash=_sha(prompt),
            response_hash=_sha(response_text),
            token_count=tokens,
            latency_ms=latency_ms,
        )

        # Audit the call. Session lifecycle is the caller's responsibility.
        # Lazy import of the audit helper to break the import cycle
        # (`app.core.api` re-exports this gateway as `model_gateway`).
        from app.core.api import audit

        await audit.log(
            session,
            "model.call",
            actor_id=actor_id,
            matter_id=matter_id,
            module=caller_module,
            resource_type=resource_type,
            resource_id=resource_id,
            model_used=result.model_used,
            prompt_hash=result.prompt_hash,
            response_hash=result.response_hash,
            token_count=result.token_count,
            latency_ms=result.latency_ms,
            payload={
                "requested_model": requested,
                "posture": effective_posture.value,
                **(payload or {}),
            },
        )

        return result


# Module-level singleton — wired with real providers at app startup
# in `main.lifespan`. Until then, the stub-echo provider serves.
gateway = ModelGateway()
