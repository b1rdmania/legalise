"""Anthropic provider.

Wraps the `anthropic` SDK behind the gateway's `ModelProvider` protocol.
The provider's `name` is `"anthropic"`; the gateway routes by name when
`select_provider` is asked for an Anthropic model.

Defaults to the workspace's configured model id; callers can override via
`model=` in kwargs.
"""

from __future__ import annotations

import structlog
from anthropic import AsyncAnthropic, APIStatusError, APIConnectionError

from app.core.config import settings
from app.core.user_keys import ProviderUpstreamError

logger = structlog.get_logger()


# Default max tokens for v0.1 calls. Plugins that need more set max_tokens
# in their inputs payload.
DEFAULT_MAX_TOKENS = 2048


def _translate_status_error(provider: str, exc: APIStatusError) -> ProviderUpstreamError:
    """Map an SDK `APIStatusError` to a structured `ProviderUpstreamError`.

    Status code mapping follows the gateway's four-code contract:
      401 / 403 -> provider_invalid_key
      429       -> provider_rate_limited
      503 / 529 -> provider_overloaded
      anything  -> provider_error
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


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str | None, default_model: str | None = None):
        # Optional fallback key — used only when LEGALISE_ALLOW_SERVER_KEY_FALLBACK
        # is true in a dev environment. Production gateway refuses to fall
        # back even if this is set.
        self._fallback_key = api_key
        # Public: the gateway reads this to record the model actually run
        # when the caller didn't pass one.
        self.default_model = default_model or settings.default_model_id

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        model = kwargs.get("model") or self.default_model
        max_tokens = kwargs.get("max_tokens", DEFAULT_MAX_TOKENS)
        api_key = kwargs.get("api_key") or self._fallback_key
        if not api_key:
            raise RuntimeError("anthropic: no api_key supplied")
        client = AsyncAnthropic(api_key=api_key)

        try:
            message = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system or "You are a UK legal AI assistant. Draft for solicitor review.",
                messages=[{"role": "user", "content": prompt}],
            )
        except APIStatusError as exc:
            logger.exception(
                "legalise.provider.anthropic.error",
                model=model,
                upstream_status=exc.status_code,
            )
            raise _translate_status_error("anthropic", exc) from exc
        except APIConnectionError as exc:
            logger.exception("legalise.provider.anthropic.connection_error", model=model)
            raise ProviderUpstreamError(
                provider="anthropic",
                code="provider_error",
                upstream_status=None,
                message=f"anthropic: connection error: {exc}",
            ) from exc
        except Exception as exc:
            logger.exception("legalise.provider.anthropic.error", model=model)
            raise ProviderUpstreamError(
                provider="anthropic",
                code="provider_error",
                upstream_status=None,
                message=f"anthropic: {type(exc).__name__}: {exc}",
            ) from exc

        # A hard stop at the output cap means the response is incomplete —
        # surfacing the truncation honestly beats handing the caller a
        # half-written body that fails its JSON-envelope parse downstream.
        if getattr(message, "stop_reason", None) == "max_tokens":
            logger.warning(
                "legalise.provider.anthropic.truncated",
                model=model,
                max_tokens=max_tokens,
            )
            raise ProviderUpstreamError(
                provider="anthropic",
                code="provider_truncated",
                upstream_status=None,
                message=(
                    "anthropic: response truncated at the output limit — "
                    "try a narrower question"
                ),
            )

        # Concatenate text blocks; v0.1 ignores tool_use blocks.
        text_parts: list[str] = []
        for block in message.content:
            if getattr(block, "type", None) == "text":
                text_parts.append(block.text)
        text = "".join(text_parts)

        usage = message.usage
        # Summed: the ModelProvider protocol returns one count and the
        # audit plumbing carries one token_count column. Splitting
        # input/output ripples through ModelResult, AssistantMessage and
        # AuditEntry — not worth it for v0.1.
        tokens = (usage.input_tokens or 0) + (usage.output_tokens or 0)

        return text, tokens
