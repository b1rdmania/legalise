"""OpenRouter provider + gateway routing.

Pins the OpenRouter contract:

  - client is built against the OpenRouter base_url with the app
    attribution headers (HTTP-Referer / X-Title)
  - EVERY request body carries the privacy pin
    `"provider": {"data_collection": "deny"}` (governance default;
    not user-disableable) - streaming and non-streaming alike
  - the response's `model` (served model) and `provider` (upstream
    provider) fields are captured into the gateway-supplied `meta_out`
    so the audit row records what actually served the call
  - finish_reason "length" -> provider_truncated, matching the OpenAI
    provider contract
  - slash-form model ids ("anthropic/claude-sonnet-5") route to the
    "openrouter" provider; bare claude-*/gpt-* ids keep routing direct
  - OpenRouter is BYO-key: no user key -> ProviderKeyMissing

All network is mocked - there is no OpenRouter key in CI.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core import model_gateway as gw_module
from app.core.model_catalog import model_catalog
from app.core.model_gateway import ModelGateway, PrivilegePosture, provider_for_model
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.providers.openrouter_provider import (
    ATTRIBUTION_HEADERS,
    OPENROUTER_BASE_URL,
    OpenRouterProvider,
)


def _response(
    content: str = "answer body",
    finish_reason: str = "stop",
    model: str | None = "anthropic/claude-sonnet-5",
    provider: str | None = "Anthropic",
):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason=finish_reason,
                message=SimpleNamespace(content=content),
            )
        ],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20),
        model=model,
        provider=provider,
    )


def _patched_client(response=None):
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response or _response())
    return client


# ---------------------------------------------------------------------------
# Provider unit tests - non-streaming
# ---------------------------------------------------------------------------


class TestOpenRouterProvider:
    @pytest.mark.asyncio
    async def test_client_built_with_base_url_and_attribution_headers(self) -> None:
        client = _patched_client()
        provider = OpenRouterProvider(api_key="sk-or-test")
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ) as ctor:
            await provider.call("question")

        ctor_kwargs = ctor.call_args.kwargs
        assert ctor_kwargs["base_url"] == OPENROUTER_BASE_URL
        assert ctor_kwargs["default_headers"] == ATTRIBUTION_HEADERS
        assert ctor_kwargs["api_key"] == "sk-or-test"

    @pytest.mark.asyncio
    async def test_every_request_carries_data_collection_deny(self) -> None:
        client = _patched_client()
        provider = OpenRouterProvider(api_key="sk-or-test")
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ):
            await provider.call("question", model="anthropic/claude-sonnet-5")

        create_kwargs = client.chat.completions.create.call_args.kwargs
        assert create_kwargs["extra_body"] == {
            "provider": {"data_collection": "deny"}
        }
        assert create_kwargs["model"] == "anthropic/claude-sonnet-5"

    @pytest.mark.asyncio
    async def test_served_model_and_upstream_provider_captured(self) -> None:
        client = _patched_client(
            _response(model="anthropic/claude-sonnet-5", provider="Google Vertex")
        )
        provider = OpenRouterProvider(api_key="sk-or-test")
        meta: dict = {}
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ):
            text, tokens_in, tokens_out = await provider.call(
                "question", meta_out=meta
            )

        assert text == "answer body"
        assert (tokens_in, tokens_out) == (10, 20)
        assert meta["served_model"] == "anthropic/claude-sonnet-5"
        assert meta["upstream_provider"] == "Google Vertex"

    @pytest.mark.asyncio
    async def test_missing_meta_fields_are_omitted(self) -> None:
        client = _patched_client(_response(model=None, provider=None))
        provider = OpenRouterProvider(api_key="sk-or-test")
        meta: dict = {}
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ):
            await provider.call("question", meta_out=meta)

        assert "served_model" not in meta
        assert "upstream_provider" not in meta

    @pytest.mark.asyncio
    async def test_truncation_raises_provider_truncated(self) -> None:
        client = _patched_client(
            _response(content="truncated body", finish_reason="length")
        )
        provider = OpenRouterProvider(api_key="sk-or-test")
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ):
            with pytest.raises(ProviderUpstreamError) as excinfo:
                await provider.call("long question")

        assert excinfo.value.code == "provider_truncated"
        assert excinfo.value.provider == "openrouter"

    @pytest.mark.asyncio
    async def test_no_api_key_raises(self) -> None:
        provider = OpenRouterProvider(api_key=None)
        with pytest.raises(RuntimeError, match="openrouter: no api_key supplied"):
            await provider.call("question")


# ---------------------------------------------------------------------------
# Provider unit tests - streaming (mirrors TestOpenAIStreaming)
# ---------------------------------------------------------------------------


def _chunk(
    content: str | None = None,
    finish_reason: str | None = None,
    usage=None,
    model: str | None = None,
    provider: str | None = None,
):
    choices = []
    if content is not None or finish_reason is not None:
        choices.append(
            SimpleNamespace(
                delta=SimpleNamespace(content=content),
                finish_reason=finish_reason,
            )
        )
    return SimpleNamespace(
        choices=choices, usage=usage, model=model, provider=provider
    )


async def _stream(chunks):
    for c in chunks:
        yield c


class TestOpenRouterStreaming:
    @pytest.mark.asyncio
    async def test_streams_deltas_and_captures_usage_and_meta(self) -> None:
        chunks = [
            _chunk("complete ", model="anthropic/claude-sonnet-5", provider="Anthropic"),
            _chunk("body"),
            _chunk(finish_reason="stop"),
            _chunk(usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20)),
        ]
        client = MagicMock()
        client.chat.completions.create = AsyncMock(return_value=_stream(chunks))
        deltas: list[str] = []

        async def _on_delta(text: str) -> None:
            deltas.append(text)

        meta: dict = {}
        provider = OpenRouterProvider(api_key="sk-or-test")
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ):
            text, tokens_in, tokens_out = await provider.call(
                "question", on_delta=_on_delta, meta_out=meta
            )

        assert deltas == ["complete ", "body"]
        assert text == "complete body"
        assert (tokens_in, tokens_out) == (10, 20)
        assert meta["served_model"] == "anthropic/claude-sonnet-5"
        assert meta["upstream_provider"] == "Anthropic"
        create_kwargs = client.chat.completions.create.call_args.kwargs
        assert create_kwargs["stream"] is True
        assert create_kwargs["stream_options"] == {"include_usage": True}
        # The privacy pin is on the streaming request too.
        assert create_kwargs["extra_body"] == {
            "provider": {"data_collection": "deny"}
        }

    @pytest.mark.asyncio
    async def test_streaming_truncation_still_raises(self) -> None:
        chunks = [
            _chunk("truncated"),
            _chunk(finish_reason="length"),
            _chunk(usage=SimpleNamespace(prompt_tokens=10, completion_tokens=2048)),
        ]
        client = MagicMock()
        client.chat.completions.create = AsyncMock(return_value=_stream(chunks))

        async def _on_delta(_text: str) -> None:
            return None

        provider = OpenRouterProvider(api_key="sk-or-test")
        with patch(
            "app.providers.openrouter_provider.AsyncOpenAI", return_value=client
        ):
            with pytest.raises(ProviderUpstreamError) as excinfo:
                await provider.call("long question", on_delta=_on_delta)

        assert excinfo.value.code == "provider_truncated"
        assert excinfo.value.provider == "openrouter"


# ---------------------------------------------------------------------------
# Gateway routing
# ---------------------------------------------------------------------------


class TestProviderForModelRouting:
    def test_slash_ids_route_to_openrouter(self) -> None:
        assert provider_for_model("anthropic/claude-sonnet-5") == "openrouter"
        assert provider_for_model("openai/gpt-5") == "openrouter"
        assert provider_for_model("deepseek/deepseek-r1") == "openrouter"

    def test_direct_ids_unchanged(self) -> None:
        assert provider_for_model("claude-sonnet-5") == "anthropic"
        assert provider_for_model("claude-opus-4-8") == "anthropic"
        assert provider_for_model("gpt-5") == "openai"
        assert provider_for_model("stub-echo") is None
        assert provider_for_model("ollama") is None

    def test_catalog_providers_agree_with_gateway_routing(self) -> None:
        """The catalog's explicit provider and provider_for_model must not
        drift: for every keyed entry they agree; keyless entries map to
        no keyed provider."""
        keyed = {"anthropic", "openai", "openrouter"}
        for entry in model_catalog():
            routed = provider_for_model(entry.id)
            if entry.provider in keyed:
                assert routed == entry.provider, entry.id
                assert entry.requires_key, entry.id
            else:
                assert routed is None, entry.id
                assert not entry.requires_key, entry.id

    def test_catalog_reference_model_policy(self) -> None:
        by_id = {e.id: e for e in model_catalog()}
        # Sonnet 5 is the single recommended reference model.
        assert by_id["claude-sonnet-5"].recommended is True
        recommended = [e for e in model_catalog() if e.recommended]
        assert len(recommended) == 1
        # The previous default stays selectable but demoted.
        assert by_id["claude-sonnet-4-6"].recommended is False
        assert "superseded by Sonnet 5" in by_id["claude-sonnet-4-6"].note
        # Curated OpenRouter entries exist, including the reference model.
        assert by_id["anthropic/claude-sonnet-5"].provider == "openrouter"
        assert by_id["openai/gpt-5"].provider == "openrouter"
        assert by_id["deepseek/deepseek-r1"].provider == "openrouter"


class _OpenRouterStub:
    """Stand-in with name='openrouter' so the KEYED_PROVIDERS check
    fires. Fills meta_out the way the real provider does."""

    name = "openrouter"
    default_model = "anthropic/claude-sonnet-5"

    def __init__(self, served_model=None, upstream=None) -> None:
        self._served_model = served_model
        self._upstream = upstream
        self.last_kwargs: dict = {}

    async def call(self, prompt: str, *, system=None, **kwargs):  # noqa: ANN001
        self.last_kwargs = dict(kwargs)
        meta = kwargs.get("meta_out")
        if isinstance(meta, dict):
            if self._served_model:
                meta["served_model"] = self._served_model
            if self._upstream:
                meta["upstream_provider"] = self._upstream
        return ("ok", 3, 2)


class _StubSession:
    bind = None

    async def scalar(self, *args, **kwargs):  # noqa: ANN001, ANN002
        return None

    async def execute(self, *args, **kwargs):  # noqa: ANN001, ANN002
        class _Row:
            def first(self):
                return None

        return _Row()

    def add(self, *args, **kwargs):  # noqa: ANN001, ANN002
        pass


class _CapturingAudit:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def log(self, session, action, **kwargs):  # noqa: ANN001
        self.calls.append({"action": action, **kwargs})


@pytest.fixture
def actor_id() -> uuid.UUID:
    return uuid.uuid4()


class TestGatewayOpenRouter:
    @pytest.mark.asyncio
    @patch.object(gw_module, "mark_user_key_used")
    @patch.object(gw_module, "get_user_provider_key", return_value="sk-or-user")
    async def test_slash_model_served_via_openrouter_and_audited(
        self, _mock_lookup, _mock_mark, actor_id
    ) -> None:
        """A slash-form model id routes to the openrouter provider; the
        audit row records the served model, that openrouter served it,
        and the upstream provider name in the payload."""
        import app.core.api as api_module

        stub = _OpenRouterStub(
            served_model="anthropic/claude-sonnet-5", upstream="Anthropic"
        )
        g = ModelGateway()
        g.register(stub)
        fake_audit = _CapturingAudit()

        with patch.object(api_module, "audit", fake_audit):
            result = await g.call(
                session=_StubSession(),
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="anthropic/claude-sonnet-5",
                posture=PrivilegePosture.A_CLEARED,
            )

        assert stub.last_kwargs.get("api_key") == "sk-or-user"
        assert stub.last_kwargs.get("model") == "anthropic/claude-sonnet-5"
        assert result.provider == "openrouter"
        assert result.model_used == "anthropic/claude-sonnet-5"

        rows = [c for c in fake_audit.calls if c["action"] == "model.call"]
        assert len(rows) == 1
        row = rows[0]
        assert row["model_used"] == "anthropic/claude-sonnet-5"
        assert row["payload"]["provider"] == "openrouter"
        assert row["payload"]["requested_model"] == "anthropic/claude-sonnet-5"
        assert row["payload"]["upstream_provider"] == "Anthropic"

    @pytest.mark.asyncio
    @patch.object(gw_module, "mark_user_key_used")
    @patch.object(gw_module, "get_user_provider_key", return_value="sk-or-user")
    async def test_reported_served_model_wins_over_requested(
        self, _mock_lookup, _mock_mark, actor_id
    ) -> None:
        """If OpenRouter reports a different served model, the result and
        audit row record what actually ran; requested_model keeps the
        request legible."""
        import app.core.api as api_module

        stub = _OpenRouterStub(served_model="anthropic/claude-sonnet-5-1")
        g = ModelGateway()
        g.register(stub)
        fake_audit = _CapturingAudit()

        with patch.object(api_module, "audit", fake_audit):
            result = await g.call(
                session=_StubSession(),
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="anthropic/claude-sonnet-5",
                posture=PrivilegePosture.A_CLEARED,
            )

        assert result.model_used == "anthropic/claude-sonnet-5-1"
        row = [c for c in fake_audit.calls if c["action"] == "model.call"][0]
        assert row["model_used"] == "anthropic/claude-sonnet-5-1"
        assert row["payload"]["requested_model"] == "anthropic/claude-sonnet-5"

    @pytest.mark.asyncio
    @patch.object(gw_module, "get_user_provider_key", return_value=None)
    async def test_no_user_key_raises_provider_key_missing(
        self, _mock_lookup, actor_id
    ) -> None:
        stub = _OpenRouterStub()
        g = ModelGateway()
        g.register(stub)

        with patch.object(gw_module.settings, "environment", "demo"), patch.object(
            gw_module.settings, "allow_server_key_fallback", False
        ):
            with pytest.raises(ProviderKeyMissing) as excinfo:
                await g.call(
                    session=_StubSession(),
                    matter_id=None,
                    actor_id=actor_id,
                    prompt="hi",
                    model="anthropic/claude-sonnet-5",
                    posture=PrivilegePosture.A_CLEARED,
                )
        assert excinfo.value.provider == "openrouter"

    @pytest.mark.asyncio
    async def test_b_mixed_prefers_local_for_openrouter_models(self) -> None:
        """Privacy posture consistency: on a B_mixed matter with a local
        provider registered, an OpenRouter frontier id is served locally,
        exactly like bare claude-*/gpt-* ids."""

        class _LocalStub:
            name = "ollama"
            default_model = "local-model"

            async def call(self, prompt: str, *, system=None, **kwargs):  # noqa: ANN001
                return ("local ok", 1, 1)

        g = ModelGateway()
        g.register(_LocalStub())
        name = g.select_provider_name(
            "anthropic/claude-sonnet-5", PrivilegePosture.B_MIXED
        )
        assert name == "ollama"
