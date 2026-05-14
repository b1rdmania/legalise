"""Model provider implementations.

Each provider implements `app.core.model_gateway.ModelProvider`:

    name: str
    async def call(prompt: str, *, system: str | None = None, **kwargs)
        -> tuple[str, int]

The `register_providers()` helper inspects environment settings and
registers every provider that has credentials/URL configured. Called
once from `main.lifespan` at boot.
"""

from __future__ import annotations

import httpx
import structlog

from app.core.config import settings
from app.core.model_gateway import ModelGateway

from app.providers.anthropic_provider import AnthropicProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.openai_provider import OpenAIProvider

logger = structlog.get_logger()


# Ollama reachability probe timeout — short, so a missing local-models
# profile doesn't delay boot by more than a second or two.
OLLAMA_PROBE_TIMEOUT_SECONDS = 1.5


async def _probe_ollama(base_url: str) -> bool:
    """Best-effort reachability check against the Ollama server.

    Hits `/api/tags` (the standard health-ish endpoint that lists
    installed models). Any successful HTTP response — even an empty
    model list — means the server is up. Connection errors, timeouts,
    DNS failures all return False without raising.
    """
    url = base_url.rstrip("/") + "/api/tags"
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_PROBE_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
        return response.status_code < 500
    except Exception as exc:
        logger.info("legalise.providers.ollama_unreachable", url=url, error=str(exc))
        return False


async def register_providers(gateway: ModelGateway) -> list[str]:
    """Register every provider whose credentials/service are reachable.

    - Anthropic and OpenAI register on the presence of an API key. The key
      is the user's explicit opt-in; a bad key surfaces at first call.
    - Ollama is a co-deployed service in this stack. It only registers if
      the URL is reachable at boot — otherwise B_mixed routing would
      prefer it and crash at request time. The `local-models` compose
      profile is off by default, so this probe is load-bearing.
    - The stub-echo provider is always available. It's the fallback path
      under B_mixed when no local provider is reachable, so the workspace
      never 500s during a smoke run with no keys configured.
    """
    registered: list[str] = ["stub-echo"]  # always available

    # Always register Anthropic + OpenAI providers — keys come from each
    # user's settings at call time (BYO key). The server-level env vars
    # are kept as a dev-only fallback used by the gateway only when
    # ENVIRONMENT is dev/development/local AND LEGALISE_ALLOW_SERVER_KEY_FALLBACK
    # is set (gateway enforces; production reads the flag as false).
    gateway.register(AnthropicProvider(api_key=settings.anthropic_api_key))
    registered.append("anthropic")

    gateway.register(OpenAIProvider(api_key=settings.openai_api_key))
    registered.append("openai")

    if settings.ollama_url and await _probe_ollama(settings.ollama_url):
        gateway.register(OllamaProvider(base_url=settings.ollama_url))
        registered.append("ollama")

    logger.info("legalise.providers.registered", providers=registered)
    return registered


__all__ = ["register_providers", "AnthropicProvider", "OpenAIProvider", "OllamaProvider"]
