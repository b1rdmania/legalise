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

    def _make_client(self, api_key: str) -> AsyncOpenAI:
        """Build the SDK client. Subclasses (OpenRouter) override to set a
        different base_url and attribution headers."""
        return AsyncOpenAI(api_key=api_key)

    def _request_extras(self) -> dict:
        """Extra kwargs merged into every chat.completions.create call.

        Subclasses use this to pin request-body fields the wire format
        requires (OpenRouter's `provider.data_collection` routing pin).
        """
        return {}

    @staticmethod
    def _capture_meta(obj: object, meta: object) -> None:
        """Record served-model metadata from a response (or stream chunk)
        into the gateway-supplied `meta_out` dict, when one was passed.

        `model` is the model that actually served the call; `provider`
        (OpenRouter only) is the upstream provider name. Both are absent
        on plain OpenAI responses' chunks sometimes, so only truthy
        values are recorded.
        """
        if not isinstance(meta, dict):
            return
        served = getattr(obj, "model", None)
        if served:
            meta["served_model"] = served
        upstream = getattr(obj, "provider", None)
        if upstream and isinstance(upstream, str):
            meta["upstream_provider"] = upstream

    async def call(
        self, prompt: str, *, system: str | None = None, **kwargs
    ) -> tuple[str, int, int]:
        model = kwargs.get("model") or self.default_model
        max_tokens = kwargs.get("max_tokens", DEFAULT_MAX_TOKENS)
        api_key = kwargs.get("api_key") or self._fallback_key
        # Optional token-streaming callback: awaited with each content delta.
        # The returned text is the concatenation of exactly those deltas;
        # finish_reason and usage arrive on the stream's final chunks.
        on_delta = kwargs.get("on_delta")
        # Gateway-supplied out-param: filled with the served model (and,
        # for OpenRouter, the upstream provider) read off the response.
        meta_out = kwargs.get("meta_out")
        if not api_key:
            raise RuntimeError(f"{self.name}: no api_key supplied")
        client = self._make_client(api_key)

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            if on_delta is None:
                response = await client.chat.completions.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=messages,
                    **self._request_extras(),
                )
                choice = response.choices[0]
                finish_reason = getattr(choice, "finish_reason", None)
                text = choice.message.content or ""
                usage = response.usage
                self._capture_meta(response, meta_out)
            else:
                stream = await client.chat.completions.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=messages,
                    stream=True,
                    stream_options={"include_usage": True},
                    **self._request_extras(),
                )
                parts: list[str] = []
                finish_reason = None
                usage = None
                async for chunk in stream:
                    self._capture_meta(chunk, meta_out)
                    if chunk.choices:
                        chunk_choice = chunk.choices[0]
                        delta = getattr(chunk_choice, "delta", None)
                        content = getattr(delta, "content", None) if delta else None
                        if content:
                            parts.append(content)
                            await on_delta(content)
                        if getattr(chunk_choice, "finish_reason", None):
                            finish_reason = chunk_choice.finish_reason
                    if getattr(chunk, "usage", None):
                        usage = chunk.usage
                text = "".join(parts)
        except APIStatusError as exc:
            logger.exception(
                f"legalise.provider.{self.name}.error",
                model=model,
                upstream_status=exc.status_code,
            )
            raise _translate_status_error(self.name, exc) from exc
        except APIConnectionError as exc:
            logger.exception(f"legalise.provider.{self.name}.connection_error", model=model)
            raise ProviderUpstreamError(
                provider=self.name,
                code="provider_error",
                upstream_status=None,
                message=f"{self.name}: connection error: {exc}",
            ) from exc
        except Exception as exc:
            logger.exception(f"legalise.provider.{self.name}.error", model=model)
            raise ProviderUpstreamError(
                provider=self.name,
                code="provider_error",
                upstream_status=None,
                message=f"{self.name}: {type(exc).__name__}: {exc}",
            ) from exc

        # A hard stop at the output cap means the response is incomplete —
        # surfacing the truncation honestly beats handing the caller a
        # half-written body that fails its JSON-envelope parse downstream.
        if finish_reason == "length":
            logger.warning(
                f"legalise.provider.{self.name}.truncated",
                model=model,
                max_tokens=max_tokens,
            )
            raise ProviderUpstreamError(
                provider=self.name,
                code="provider_truncated",
                upstream_status=None,
                message=(
                    "The answer was cut off at the model's output limit. "
                    "Ask a narrower question."
                ),
            )

        tokens_in = usage.prompt_tokens if usage else 0
        tokens_out = usage.completion_tokens if usage else 0
        return text, tokens_in, tokens_out
