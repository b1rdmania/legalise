"""Ollama provider.

Talks to a local Ollama server over its HTTP API. v0.1 uses the `/api/chat`
endpoint with `stream=false` for simplicity; streaming lands in v0.2 when
the workspace UI grows live-progress affordances.

The provider name is `"ollama"`. Privilege posture B_mixed prefers this
provider when it's registered — that's the local-first guarantee.
"""

from __future__ import annotations

import structlog
import httpx

from app.core.user_keys import ProviderUpstreamError

logger = structlog.get_logger()


def _translate_http_status_error(exc: httpx.HTTPStatusError) -> ProviderUpstreamError:
    """Map an Ollama HTTP status error into the four-code contract.

    Ollama is keyless, so `provider_invalid_key` rarely applies, but we
    keep the mapping symmetric across providers so the UI surface can
    stay uniform.
    """
    status = exc.response.status_code
    if status in (401, 403):
        code = "provider_invalid_key"
    elif status == 429:
        code = "provider_rate_limited"
    elif status in (503, 529):
        code = "provider_overloaded"
    else:
        code = "provider_error"
    return ProviderUpstreamError(
        provider="ollama",
        code=code,
        upstream_status=status,
        message=f"ollama: upstream {status}: {exc}",
    )


DEFAULT_MODEL = "llama3.1:70b"
DEFAULT_TIMEOUT_SECONDS = 120


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, default_model: str = DEFAULT_MODEL):
        self._base_url = base_url.rstrip("/")
        # Public: the gateway reads this to record the model actually run
        # when the caller didn't pass one.
        self.default_model = default_model
        self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS)

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        model = kwargs.get("model") or self.default_model
        # Strip an `ollama/` prefix if the caller passed a fully-qualified id.
        if model.startswith("ollama/"):
            model = model[len("ollama/") :]

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            response = await self._client.post(
                f"{self._base_url}/api/chat",
                json={"model": model, "messages": messages, "stream": False},
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.exception(
                "legalise.provider.ollama.error",
                model=model,
                base_url=self._base_url,
                upstream_status=exc.response.status_code,
            )
            raise _translate_http_status_error(exc) from exc
        except httpx.HTTPError as exc:
            logger.exception(
                "legalise.provider.ollama.connection_error",
                model=model,
                base_url=self._base_url,
            )
            raise ProviderUpstreamError(
                provider="ollama",
                code="provider_error",
                upstream_status=None,
                message=f"ollama: connection error: {exc}",
            ) from exc
        except Exception as exc:
            logger.exception("legalise.provider.ollama.error", model=model, base_url=self._base_url)
            raise ProviderUpstreamError(
                provider="ollama",
                code="provider_error",
                upstream_status=None,
                message=f"ollama: {type(exc).__name__}: {exc}",
            ) from exc

        data = response.json()
        text = (data.get("message") or {}).get("content", "")
        # Ollama returns eval_count for the response tokens; prompt_eval_count for the prompt.
        tokens = int(data.get("eval_count", 0)) + int(data.get("prompt_eval_count", 0))
        return text, tokens

    async def aclose(self) -> None:
        await self._client.aclose()
