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

import structlog

from app.core.config import settings
from app.core.model_gateway import ModelGateway

from app.providers.anthropic_provider import AnthropicProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.openai_provider import OpenAIProvider

logger = structlog.get_logger()


def register_providers(gateway: ModelGateway) -> list[str]:
    """Register every provider whose credentials are present. Returns the
    list of provider names successfully registered.

    The stub-echo provider is always available — it stays as the fallback
    so the workspace never fails closed on a missing key in dev.
    """
    registered: list[str] = ["stub-echo"]  # always available

    if settings.anthropic_api_key:
        gateway.register(AnthropicProvider(api_key=settings.anthropic_api_key))
        registered.append("anthropic")

    if settings.openai_api_key:
        gateway.register(OpenAIProvider(api_key=settings.openai_api_key))
        registered.append("openai")

    if settings.ollama_url:
        # Ollama doesn't require a key; if the URL is set we register and let
        # the call fail at request time if the server isn't reachable.
        gateway.register(OllamaProvider(base_url=settings.ollama_url))
        registered.append("ollama")

    logger.info("legalise.providers.registered", providers=registered)
    return registered


__all__ = ["register_providers", "AnthropicProvider", "OpenAIProvider", "OllamaProvider"]
