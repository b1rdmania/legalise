"""Token streaming for chat answers.

Covers the four invariants of the streaming path:

- what streams is what persists — the `model.delta` events assemble to the
  exact `content` the assistant row stores (display never forks from record);
- usage is still recorded — streaming providers report tokens at stream end
  and the gateway's ModelResult/audit row carries them;
- truncation still fires — stop_reason/finish_reason arrive at stream end
  and raise `provider_truncated` exactly as the non-streaming path does;
- providers that can't stream fall back silently — no deltas, same reply;
- a client disconnect mid-stream never cancels the turn — the detached
  task persists the message and its audit row anyway (the Case A pin the
  chat Stop control rests on).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.model_gateway import ModelGateway, ModelResult, PrivilegePosture
from app.core.user_keys import ProviderUpstreamError
from app.modules.assistant.pipeline import (
    _EnvelopeContentStreamer,
    _partial_envelope_content,
    run_assistant_turn,
)
from app.modules.assistant.schemas import AssistantPostRequest

from tests.test_assistant_pipeline import (
    _AssistantSession,
    _make_matter,
)


# ---------------------------------------------------------------------------
# Envelope content extraction — raw JSON deltas in, user-visible text out
# ---------------------------------------------------------------------------


class TestPartialEnvelopeContent:
    def test_extracts_complete_content(self) -> None:
        raw = json.dumps({"content": "The dismissal was on 10 March.", "suggested_actions": []})
        assert _partial_envelope_content(raw) == "The dismissal was on 10 March."

    def test_extracts_prefix_of_unterminated_string(self) -> None:
        assert _partial_envelope_content('{"content": "The dism') == "The dism"

    def test_no_content_field_yields_nothing(self) -> None:
        assert _partial_envelope_content('{"suggested_act') == ""
        assert _partial_envelope_content("") == ""

    def test_unescapes_json_escapes(self) -> None:
        raw = '{"content": "line one\\nline \\"two\\" and \\\\ back"'
        assert _partial_envelope_content(raw) == 'line one\nline "two" and \\ back'

    def test_holds_back_incomplete_escape(self) -> None:
        assert _partial_envelope_content('{"content": "end\\') == "end"
        assert _partial_envelope_content('{"content": "end\\u26') == "end"

    def test_unicode_escape_and_surrogate_pair(self) -> None:
        assert _partial_envelope_content('{"content": "\\u00a3500"') == "£500"
        assert _partial_envelope_content('{"content": "\\ud83d\\ude00 done"') == "😀 done"
        # High surrogate still waiting for its pair is held back.
        assert _partial_envelope_content('{"content": "hi \\ud83d') == "hi "

    def test_fenced_envelope(self) -> None:
        raw = '```json\n{"content": "Fenced answer"'
        assert _partial_envelope_content(raw) == "Fenced answer"


class TestEnvelopeContentStreamer:
    @pytest.mark.asyncio
    async def test_deltas_assemble_to_content_across_arbitrary_splits(self) -> None:
        envelope = json.dumps(
            {
                "content": 'Khan was dismissed on 10 March 2026.\nSee "the letter" — £500 due. 😀',
                "suggested_actions": [{"type": "view_audit", "label": "Open", "params": {}}],
            }
        )
        for size in (1, 3, 7, len(envelope)):
            events: list[tuple[str, dict[str, Any]]] = []

            async def _capture(name: str, payload: dict[str, Any]) -> None:
                events.append((name, payload))

            streamer = _EnvelopeContentStreamer(_capture)
            for i in range(0, len(envelope), size):
                await streamer.feed(envelope[i : i + size])

            assert all(name == "model.delta" for name, _ in events)
            assembled = "".join(payload["text"] for _, payload in events)
            assert assembled == json.loads(envelope)["content"]

    @pytest.mark.asyncio
    async def test_emits_nothing_for_non_envelope_text(self) -> None:
        events: list[Any] = []

        async def _capture(name: str, payload: dict[str, Any]) -> None:
            events.append((name, payload))

        streamer = _EnvelopeContentStreamer(_capture)
        await streamer.feed("[stub-echo] plain text, no envelope")
        assert events == []


# ---------------------------------------------------------------------------
# Pipeline — streamed deltas equal the persisted reply; fallback stays silent
# ---------------------------------------------------------------------------


_STREAMED_ENVELOPE = {
    "content": "Khan was dismissed without notice on 10 March 2026.",
    "suggested_actions": [],
}


class _StreamingFakeGateway:
    """Feeds the envelope through on_delta in chunks, then returns it whole —
    the shape of a real streaming provider behind the gateway."""

    def __init__(self, envelope: dict[str, Any] | None = None) -> None:
        self.envelope = envelope or _STREAMED_ENVELOPE
        self.calls: list[dict[str, Any]] = []

    async def call(self, *, on_delta=None, **kwargs) -> ModelResult:
        self.calls.append({**kwargs, "on_delta": on_delta})
        text = json.dumps(self.envelope)
        if on_delta is not None:
            for i in range(0, len(text), 9):
                await on_delta(text[i : i + 9])
        return ModelResult(
            text=text,
            model_used="claude-opus-4-7",
            prompt_hash="ph",
            response_hash=hashlib.sha256(text.encode()).hexdigest(),
            token_count=63,
            latency_ms=5,
            provider="anthropic",
            tokens_in=42,
            tokens_out=21,
        )


class TestPipelineStreaming:
    @pytest.mark.asyncio
    async def test_deltas_assemble_to_the_persisted_reply(self) -> None:
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _StreamingFakeGateway()
        events: list[tuple[str, dict[str, Any]]] = []

        async def _capture(name: str, payload: dict[str, Any]) -> None:
            events.append((name, payload))

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="When was Khan dismissed?"),
            gateway=gateway,
            on_event=_capture,
        )

        deltas = [p["text"] for name, p in events if name == "model.delta"]
        assert deltas, "streaming turn emitted no model.delta events"
        assert "".join(deltas) == assistant_row.content
        assert assistant_row.content == _STREAMED_ENVELOPE["content"]
        # Usage from stream end still lands on the persisted row.
        assert assistant_row.token_count == 63
        # Delta events sit between model.start and turn.end.
        names = [name for name, _ in events]
        assert names.index("model.start") < names.index("model.delta")
        assert names.index("model.delta") < names.index("turn.end")

    @pytest.mark.asyncio
    async def test_non_sse_turn_requests_no_streaming(self) -> None:
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _StreamingFakeGateway()

        await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="When was Khan dismissed?"),
            gateway=gateway,
            on_event=None,
        )

        assert gateway.calls[0]["on_delta"] is None

    @pytest.mark.asyncio
    async def test_stub_echo_matter_falls_back_without_deltas(self) -> None:
        matter = _make_matter()
        matter.default_model_id = "stub-echo"
        session = _AssistantSession(matter)
        gateway = _StreamingFakeGateway()
        events: list[tuple[str, dict[str, Any]]] = []

        async def _capture(name: str, payload: dict[str, Any]) -> None:
            events.append((name, payload))

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Hello"),
            gateway=gateway,
            on_event=_capture,
        )

        assert gateway.calls[0]["on_delta"] is None
        assert all(name != "model.delta" for name, _ in events)
        assert assistant_row.content


# ---------------------------------------------------------------------------
# Gateway — on_delta reaches the provider; keyless providers ignore it
# ---------------------------------------------------------------------------


class _StreamingFakeProvider:
    name = "stream-fake"
    default_model = "stream-fake"

    async def call(self, prompt: str, *, system=None, **kwargs):
        on_delta = kwargs.get("on_delta")
        text = "streamed answer"
        if on_delta is not None:
            for piece in ("stream", "ed ", "answer"):
                await on_delta(piece)
        return text, 11, 4


class TestGatewayStreaming:
    @pytest.mark.asyncio
    async def test_result_matches_streamed_deltas_and_records_usage(self) -> None:
        gw = ModelGateway({"stream-fake": _StreamingFakeProvider()})
        deltas: list[str] = []

        async def _on_delta(text: str) -> None:
            deltas.append(text)

        with patch("app.core.api.audit") as fake_audit:
            fake_audit.log = AsyncMock()
            result = await gw.call(
                session=MagicMock(),
                matter_id=None,
                actor_id=None,
                prompt="q",
                model="stream-fake",
                posture=PrivilegePosture.A_CLEARED,
                on_delta=_on_delta,
            )

        assert "".join(deltas) == "streamed answer"
        assert result.text == "streamed answer"
        assert result.response_hash == hashlib.sha256(b"streamed answer").hexdigest()
        assert (result.tokens_in, result.tokens_out) == (11, 4)
        assert fake_audit.log.await_count == 1
        audit_kwargs = fake_audit.log.await_args.kwargs
        assert audit_kwargs["response_hash"] == result.response_hash
        assert audit_kwargs["tokens_in"] == 11
        assert audit_kwargs["tokens_out"] == 4

    @pytest.mark.asyncio
    async def test_stub_provider_ignores_on_delta(self) -> None:
        gw = ModelGateway()
        deltas: list[str] = []

        async def _on_delta(text: str) -> None:
            deltas.append(text)

        with patch("app.core.api.audit") as fake_audit:
            fake_audit.log = AsyncMock()
            result = await gw.call(
                session=MagicMock(),
                matter_id=None,
                actor_id=None,
                prompt="hello",
                model="stub-echo",
                posture=PrivilegePosture.A_CLEARED,
                on_delta=_on_delta,
            )

        assert deltas == []
        assert result.text.startswith("[stub-echo]")


# ---------------------------------------------------------------------------
# Anthropic provider — streaming path
# ---------------------------------------------------------------------------


class _FakeAnthropicStream:
    def __init__(self, deltas: list[str], final: Any) -> None:
        self._deltas = deltas
        self._final = final

    async def __aenter__(self) -> "_FakeAnthropicStream":
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        return None

    @property
    def text_stream(self):
        async def _gen():
            for d in self._deltas:
                yield d

        return _gen()

    async def get_final_message(self) -> Any:
        return self._final


class TestAnthropicStreaming:
    @pytest.mark.asyncio
    async def test_streams_deltas_and_returns_final_usage(self) -> None:
        from app.providers.anthropic_provider import AnthropicProvider

        final = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="complete body")],
            usage=SimpleNamespace(input_tokens=10, output_tokens=20),
        )
        client = MagicMock()
        client.messages.stream = MagicMock(
            return_value=_FakeAnthropicStream(["complete ", "body"], final)
        )
        deltas: list[str] = []

        async def _on_delta(text: str) -> None:
            deltas.append(text)

        provider = AnthropicProvider(api_key="sk-test", default_model="claude-haiku-4-5")
        with patch(
            "app.providers.anthropic_provider.AsyncAnthropic", return_value=client
        ):
            text, tokens_in, tokens_out = await provider.call(
                "question", on_delta=_on_delta
            )

        assert deltas == ["complete ", "body"]
        assert text == "".join(deltas) == "complete body"
        assert (tokens_in, tokens_out) == (10, 20)
        client.messages.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_streaming_truncation_still_raises(self) -> None:
        from app.providers.anthropic_provider import AnthropicProvider

        final = SimpleNamespace(
            stop_reason="max_tokens",
            content=[SimpleNamespace(type="text", text="truncated…")],
            usage=SimpleNamespace(input_tokens=10, output_tokens=2048),
        )
        client = MagicMock()
        client.messages.stream = MagicMock(
            return_value=_FakeAnthropicStream(["truncated…"], final)
        )

        async def _on_delta(_text: str) -> None:
            return None

        provider = AnthropicProvider(api_key="sk-test", default_model="claude-haiku-4-5")
        with patch(
            "app.providers.anthropic_provider.AsyncAnthropic", return_value=client
        ):
            with pytest.raises(ProviderUpstreamError) as excinfo:
                await provider.call("long question", on_delta=_on_delta)

        assert excinfo.value.code == "provider_truncated"

    @pytest.mark.asyncio
    async def test_without_on_delta_uses_create(self) -> None:
        from app.providers.anthropic_provider import AnthropicProvider

        message = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="whole body")],
            usage=SimpleNamespace(input_tokens=5, output_tokens=6),
        )
        client = MagicMock()
        client.messages.create = AsyncMock(return_value=message)

        provider = AnthropicProvider(api_key="sk-test", default_model="claude-haiku-4-5")
        with patch(
            "app.providers.anthropic_provider.AsyncAnthropic", return_value=client
        ):
            text, _, _ = await provider.call("question")

        assert text == "whole body"
        client.messages.stream.assert_not_called()


# ---------------------------------------------------------------------------
# OpenAI provider — streaming path
# ---------------------------------------------------------------------------


def _openai_chunk(content: str | None = None, finish_reason: str | None = None, usage=None):
    choices = []
    if content is not None or finish_reason is not None:
        choices.append(
            SimpleNamespace(
                delta=SimpleNamespace(content=content),
                finish_reason=finish_reason,
            )
        )
    return SimpleNamespace(choices=choices, usage=usage)


async def _openai_stream(chunks):
    for c in chunks:
        yield c


class TestOpenAIStreaming:
    @pytest.mark.asyncio
    async def test_streams_deltas_and_captures_usage_from_final_chunk(self) -> None:
        from app.providers.openai_provider import OpenAIProvider

        chunks = [
            _openai_chunk("complete "),
            _openai_chunk("body"),
            _openai_chunk(finish_reason="stop"),
            _openai_chunk(usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20)),
        ]
        client = MagicMock()
        client.chat.completions.create = AsyncMock(return_value=_openai_stream(chunks))
        deltas: list[str] = []

        async def _on_delta(text: str) -> None:
            deltas.append(text)

        provider = OpenAIProvider(api_key="sk-test", default_model="gpt-4o-mini")
        with patch(
            "app.providers.openai_provider.AsyncOpenAI", return_value=client
        ):
            text, tokens_in, tokens_out = await provider.call(
                "question", on_delta=_on_delta
            )

        assert deltas == ["complete ", "body"]
        assert text == "complete body"
        assert (tokens_in, tokens_out) == (10, 20)
        create_kwargs = client.chat.completions.create.call_args.kwargs
        assert create_kwargs["stream"] is True
        assert create_kwargs["stream_options"] == {"include_usage": True}

    @pytest.mark.asyncio
    async def test_streaming_truncation_still_raises(self) -> None:
        from app.providers.openai_provider import OpenAIProvider

        chunks = [
            _openai_chunk("truncated…"),
            _openai_chunk(finish_reason="length"),
            _openai_chunk(usage=SimpleNamespace(prompt_tokens=10, completion_tokens=2048)),
        ]
        client = MagicMock()
        client.chat.completions.create = AsyncMock(return_value=_openai_stream(chunks))

        async def _on_delta(_text: str) -> None:
            return None

        provider = OpenAIProvider(api_key="sk-test", default_model="gpt-4o-mini")
        with patch(
            "app.providers.openai_provider.AsyncOpenAI", return_value=client
        ):
            with pytest.raises(ProviderUpstreamError) as excinfo:
                await provider.call("long question", on_delta=_on_delta)

        assert excinfo.value.code == "provider_truncated"


# ---------------------------------------------------------------------------
# SSE endpoint — client disconnect never cancels the turn (the Case A pin)
# ---------------------------------------------------------------------------


class TestStreamDisconnectPersistence:
    @pytest.mark.asyncio
    async def test_client_drop_mid_stream_still_persists_message_and_audit(self) -> None:
        """Pins the guarantee the chat Stop control rests on: the stream
        endpoint runs the turn in a detached task with its own session, so
        dropping the SSE client mid-stream (which closes only the relay
        generator) leaves the turn running to completion — the assistant
        message row and the module.assistant.message audit row still land.
        """
        from types import SimpleNamespace as _NS

        from app.models import AuditEntry
        from app.models.assistant import AssistantMessage as AssistantMessageRow
        from app.modules.assistant import router as assistant_router
        from app.modules.assistant.schemas import AssistantPostRequest

        from tests.test_assistant_pipeline import _UserStub

        matter = _make_matter()
        session = _AssistantSession(matter)
        user = _UserStub()
        user.id = matter.created_by_id

        delta_seen = asyncio.Event()
        client_gone = asyncio.Event()

        class _HeldGateway:
            """Streams a first delta, then holds the turn open until the
            test has dropped the client, then finishes normally."""

            async def call(self, *, on_delta=None, **kwargs) -> ModelResult:
                text = json.dumps(_STREAMED_ENVELOPE)
                if on_delta is not None:
                    await on_delta(text[:24])
                    delta_seen.set()
                await client_gone.wait()
                if on_delta is not None:
                    await on_delta(text[24:])
                return ModelResult(
                    text=text,
                    model_used="claude-opus-4-7",
                    prompt_hash="ph",
                    response_hash=hashlib.sha256(text.encode()).hexdigest(),
                    token_count=63,
                    latency_ms=5,
                    provider="anthropic",
                    tokens_in=42,
                    tokens_out=21,
                )

        class _SessionFactory:
            def __call__(self):
                return self

            async def __aenter__(self):
                return session

            async def __aexit__(self, *_exc):
                return None

        request = _NS(app=_NS(state=_NS(session_factory=_SessionFactory())))

        # Inject the held gateway through the real pipeline: the route does
        # not take a gateway parameter, so wrap run_assistant_turn.
        real_run = assistant_router.run_assistant_turn
        gateway = _HeldGateway()

        async def _run_with_held_gateway(**kwargs):
            return await real_run(gateway=gateway, **kwargs)

        with patch.object(
            assistant_router, "run_assistant_turn", _run_with_held_gateway
        ):
            resp = await assistant_router.post_message_stream(
                matter.slug,
                AssistantPostRequest(content="When was Khan dismissed?"),
                request,
                user,
            )
            iterator = resp.body_iterator
            saw_delta_frame = False
            async for chunk in iterator:
                frame = chunk if isinstance(chunk, str) else chunk.decode()
                if "model.delta" in frame:
                    saw_delta_frame = True
                    break
            assert saw_delta_frame, "stream never reached a model.delta frame"

            # The client goes away mid-stream. Closing the relay generator
            # is exactly what an ASGI disconnect does; the detached turn
            # task must be untouched by it.
            await iterator.aclose()
            client_gone.set()

            async def _wait_for_persisted_reply() -> None:
                while not any(
                    isinstance(o, AssistantMessageRow) and o.role == "assistant"
                    for o in session.added
                ):
                    await asyncio.sleep(0.01)

            await asyncio.wait_for(_wait_for_persisted_reply(), timeout=5)

        assert delta_seen.is_set()
        user_rows = [
            o
            for o in session.added
            if isinstance(o, AssistantMessageRow) and o.role == "user"
        ]
        assistant_rows = [
            o
            for o in session.added
            if isinstance(o, AssistantMessageRow) and o.role == "assistant"
        ]
        assert len(user_rows) == 1
        assert len(assistant_rows) == 1
        assert assistant_rows[0].content == _STREAMED_ENVELOPE["content"]
        message_audits = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.action == "module.assistant.message"
        ]
        assert len(message_audits) == 1
