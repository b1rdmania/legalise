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

logger = structlog.get_logger()


DEFAULT_MODEL = "llama3.1:70b"
DEFAULT_TIMEOUT_SECONDS = 120


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, default_model: str = DEFAULT_MODEL):
        self._base_url = base_url.rstrip("/")
        self._default_model = default_model
        self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS)

    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> tuple[str, int]:
        model = kwargs.get("model") or self._default_model
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
        except Exception:
            logger.exception("legalise.provider.ollama.error", model=model, base_url=self._base_url)
            raise

        data = response.json()
        text = (data.get("message") or {}).get("content", "")
        # Ollama returns eval_count for the response tokens; prompt_eval_count for the prompt.
        tokens = int(data.get("eval_count", 0)) + int(data.get("prompt_eval_count", 0))
        return text, tokens

    async def aclose(self) -> None:
        await self._client.aclose()
