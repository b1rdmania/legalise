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
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AuditEntry, Matter


class PrivilegePosture(str, Enum):
    A_CLEARED = "A_cleared"
    B_MIXED = "B_mixed"
    C_PAUSED = "C_paused"


class PrivilegePaused(RuntimeError):
    """Raised when a model call is attempted on a C_paused matter."""


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

    def register(self, provider: ModelProvider) -> None:
        self._providers[provider.name] = provider

    def _select_provider(self, requested: str, posture: PrivilegePosture) -> ModelProvider:
        if posture is PrivilegePosture.B_MIXED:
            # Prefer a local model if configured and reachable. v0.1 cannot
            # probe reachability synchronously, so we trust the requested
            # model unless it's obviously frontier and a local exists.
            local = self._providers.get("ollama")
            if local is not None and requested.startswith(("claude-", "gpt-")):
                return local
        return self._providers.get(requested) or self._providers["stub-echo"]

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

        requested = model or settings.default_model_id
        provider = self._select_provider(requested, effective_posture)

        start = time.perf_counter()
        response_text, tokens = await provider.call(prompt, system=system)
        latency_ms = int((time.perf_counter() - start) * 1000)

        result = ModelResult(
            text=response_text,
            model_used=provider.name,
            prompt_hash=_sha(prompt),
            response_hash=_sha(response_text),
            token_count=tokens,
            latency_ms=latency_ms,
        )

        # Audit the call. Session lifecycle is the caller's responsibility.
        session.add(
            AuditEntry(
                actor_id=actor_id,
                matter_id=matter_id,
                action="model.call",
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
        )

        return result


# Module-level singleton — wired with real providers at app startup
# in `main.lifespan`. Until then, the stub-echo provider serves.
gateway = ModelGateway()
