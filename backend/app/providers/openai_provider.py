"""OpenAI provider.

Wraps the `openai` SDK behind the gateway's `ModelProvider` protocol.
Used when the matter's `default_model_id` is an OpenAI model and the
posture allows frontier calls.
"""

from __future__ import annotations

import structlog
from openai import APIConnectionError, APIStatusError, AsyncOpenAI

from app.core.user_keys import ProviderUpstreamError

logger = structlog.get_logger()


DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_MAX_TOKENS = 2048


def _translate_status_error(provider: str, exc: APIStatusError) -> ProviderUpstreamError:
    """Map an OpenAI SDK `APIStatusError` to a `ProviderUpstreamError`.

    Same four-code contract as the Anthropic provider, kept inline to
    avoid a circular import via `app.core.model_gateway`.
    """
    status = getattr(exc, "status_code", None)
    if status in (401, 403):
        code = "provider_invalid_key"
    elif status == 429:
        code = "provider_rate_limited"
    elif status in (503, 529):
        code = "provider_overloaded"
    else:
        code = "provider_error"
    return ProviderUpstreamError(
        provider=provider,
        code=code,
        upstream_status=status,
        message=f"{provider}: upstream {status}: {exc}",
    )


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str | None, default_model: str = DEFAULT_MODEL):
        self._fallback_key = api_key
        # Public: the gateway reads this to record the model actually run
        # when the caller didn't pass one.
        self.default_model = default_model

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        model = kwargs.get("model") or self.default_model
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
        except APIStatusError as exc:
            logger.exception(
                "legalise.provider.openai.error",
                model=model,
                upstream_status=exc.status_code,
            )
            raise _translate_status_error("openai", exc) from exc
        except APIConnectionError as exc:
            logger.exception("legalise.provider.openai.connection_error", model=model)
            raise ProviderUpstreamError(
                provider="openai",
                code="provider_error",
                upstream_status=None,
                message=f"openai: connection error: {exc}",
            ) from exc
        except Exception as exc:
            logger.exception("legalise.provider.openai.error", model=model)
            raise ProviderUpstreamError(
                provider="openai",
                code="provider_error",
                upstream_status=None,
                message=f"openai: {type(exc).__name__}: {exc}",
            ) from exc

        text = response.choices[0].message.content or ""
        usage = response.usage
        tokens = (usage.prompt_tokens + usage.completion_tokens) if usage else 0
        return text, tokens
