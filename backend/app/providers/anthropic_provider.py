"""Anthropic provider.

Wraps the `anthropic` SDK behind the gateway's `ModelProvider` protocol.
The provider's `name` is `"anthropic"`; the gateway routes by name when
`select_provider` is asked for an Anthropic model.

Defaults to the workspace's configured model id; callers can override via
`model=` in kwargs.
"""

from __future__ import annotations

import structlog
from anthropic import AsyncAnthropic

from app.core.config import settings

logger = structlog.get_logger()


# Default max tokens for v0.1 calls. Plugins that need more set max_tokens
# in their inputs payload.
DEFAULT_MAX_TOKENS = 2048


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, default_model: str | None = None):
        self._client = AsyncAnthropic(api_key=api_key)
        self._default_model = default_model or settings.default_model_id

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        model = kwargs.get("model") or self._default_model
        max_tokens = kwargs.get("max_tokens", DEFAULT_MAX_TOKENS)

        try:
            message = await self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system or "You are a UK legal AI assistant. Draft for solicitor review.",
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception:
            logger.exception("legalise.provider.anthropic.error", model=model)
            raise

        # Concatenate text blocks; v0.1 ignores tool_use blocks.
        text_parts: list[str] = []
        for block in message.content:
            if getattr(block, "type", None) == "text":
                text_parts.append(block.text)
        text = "".join(text_parts)

        usage = message.usage
        tokens = (usage.input_tokens or 0) + (usage.output_tokens or 0)

        return text, tokens
