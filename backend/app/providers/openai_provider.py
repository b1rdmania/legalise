"""OpenAI provider.

Wraps the `openai` SDK behind the gateway's `ModelProvider` protocol.
Used when the matter's `default_model_id` is an OpenAI model and the
posture allows frontier calls.
"""

from __future__ import annotations

import structlog
from openai import AsyncOpenAI

logger = structlog.get_logger()


DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_MAX_TOKENS = 2048


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str | None, default_model: str = DEFAULT_MODEL):
        self._fallback_key = api_key
        self._default_model = default_model

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        model = kwargs.get("model") or self._default_model
        max_tokens = kwargs.get("max_tokens", DEFAULT_MAX_TOKENS)
        api_key = kwargs.get("api_key") or self._fallback_key
        if not api_key:
            raise RuntimeError("openai: no api_key supplied")
        client = AsyncOpenAI(api_key=api_key)

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            response = await client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=messages,
            )
        except Exception:
            logger.exception("legalise.provider.openai.error", model=model)
            raise

        text = response.choices[0].message.content or ""
        usage = response.usage
        tokens = (usage.prompt_tokens + usage.completion_tokens) if usage else 0
        return text, tokens
