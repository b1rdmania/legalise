"""OpenRouter provider.

OpenRouter speaks the OpenAI chat-completions wire format, so this is a
thin parameterisation of `OpenAIProvider`: same SDK, different base_url,
attribution headers, and one non-negotiable request-body pin.

Privacy pin (governance default, not user-configurable in v1): every
request body carries `"provider": {"data_collection": "deny"}`, which
restricts OpenRouter's routing to upstream endpoints that do not train
on or retain prompts. Matter content must never reach a
training/retention endpoint.

Model ids are OpenRouter's slash form ("anthropic/claude-sonnet-5").
The response's `model` and `provider` fields (the model actually served
and the upstream provider that served it) are captured through the
shared `meta_out` mechanism so the gateway can stamp them onto the
audit row.
"""

from __future__ import annotations

from openai import AsyncOpenAI

from app.providers.openai_provider import OpenAIProvider

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

DEFAULT_MODEL = "anthropic/claude-sonnet-5"

# App attribution headers OpenRouter uses for rankings/analytics.
ATTRIBUTION_HEADERS = {
    "HTTP-Referer": "https://legalise.dev",
    "X-Title": "Legalise",
}

# Routing pin: only serve from endpoints that neither train on nor
# retain prompts. Sent on EVERY request; there is deliberately no code
# path that omits it.
PRIVACY_PIN = {"provider": {"data_collection": "deny"}}


class OpenRouterProvider(OpenAIProvider):
    name = "openrouter"

    def __init__(self, api_key: str | None, default_model: str = DEFAULT_MODEL):
        super().__init__(api_key, default_model=default_model)

    def _make_client(self, api_key: str) -> AsyncOpenAI:
        return AsyncOpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            default_headers=dict(ATTRIBUTION_HEADERS),
        )

    def _request_extras(self) -> dict:
        # `extra_body` is the OpenAI SDK's escape hatch for
        # provider-specific body fields; it merges into the JSON body.
        return {"extra_body": dict(PRIVACY_PIN)}
