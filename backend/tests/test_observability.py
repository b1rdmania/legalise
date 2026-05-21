"""Unit 8 — Observability with Scrubbing.

Tests cover:
  1. scrub_dict redacts prompt / response / api_key / filename and nested keys.
  2. scrub() redacts Bearer tokens and long opaque token strings.
  3. The global exception handler does NOT include prompt/response in the
     operational log payload.
  4. A simulated provider failure triggers a log event with provider name
     and code but NOT the request body or prompt text.
  5. record_* helpers emit structlog events with correct keys.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from app.core.observability import (
    _REDACTED,
    record_job_failure,
    record_key_missing,
    record_provider_error,
    record_request_error,
    record_storage_failure,
    scrub,
    scrub_dict,
)


# ---------------------------------------------------------------------------
# scrub_dict — redaction correctness
# ---------------------------------------------------------------------------

class TestScrubDict:
    def test_redacts_prompt(self):
        d = {"prompt": "summarise this contract clause", "model": "claude-opus-4-7"}
        out = scrub_dict(d)
        assert out["prompt"] == _REDACTED
        assert out["model"] == "claude-opus-4-7"

    def test_redacts_response(self):
        d = {"response": "The clause provides for unlimited liability."}
        out = scrub_dict(d)
        assert out["response"] == _REDACTED

    def test_redacts_api_key(self):
        d = {"api_key": "sk-ant-api03-AAABBBCCC", "provider": "anthropic"}
        out = scrub_dict(d)
        assert out["api_key"] == _REDACTED
        assert out["provider"] == "anthropic"

    def test_redacts_filename(self):
        d = {"filename": "khan_v_acme_claim.pdf", "size": 42000}
        out = scrub_dict(d)
        assert out["filename"] == _REDACTED
        assert out["size"] == 42000

    def test_redacts_key_and_secret(self):
        d = {"key": "somekey", "secret": "topsecret", "ok": "fine"}
        out = scrub_dict(d)
        assert out["key"] == _REDACTED
        assert out["secret"] == _REDACTED
        assert out["ok"] == "fine"

    def test_redacts_body_and_text_and_content(self):
        d = {"body": "doc text here", "text": "more text", "content": "raw content"}
        out = scrub_dict(d)
        assert out["body"] == _REDACTED
        assert out["text"] == _REDACTED
        assert out["content"] == _REDACTED

    def test_nested_dict_redaction(self):
        d = {
            "meta": {"prompt": "nested prompt", "model": "claude"},
            "top_level": "safe",
        }
        out = scrub_dict(d)
        assert out["meta"]["prompt"] == _REDACTED
        assert out["meta"]["model"] == "claude"
        assert out["top_level"] == "safe"

    def test_does_not_mutate_original(self):
        d = {"prompt": "original prompt"}
        _ = scrub_dict(d)
        assert d["prompt"] == "original prompt"

    def test_non_string_sensitive_value_redacted(self):
        d = {"prompt": ["a", "b", "c"], "other": 123}
        out = scrub_dict(d)
        assert out["prompt"] == _REDACTED
        assert out["other"] == 123

    def test_key_case_insensitive(self):
        d = {"PROMPT": "should not redact (case-sensitive key)"}
        # Keys are lowercased for comparison — upper-case PROMPT matches.
        out = scrub_dict(d)
        assert out["PROMPT"] == _REDACTED


# ---------------------------------------------------------------------------
# scrub — value-level redaction
# ---------------------------------------------------------------------------

class TestScrub:
    def test_bearer_token_redacted(self):
        result = scrub("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")
        assert result == _REDACTED

    def test_bearer_case_insensitive(self):
        result = scrub("bearer sk-ant-xyz123456789abcdefghij")
        assert result == _REDACTED

    def test_long_hex_token_redacted(self):
        token = "a" * 32
        assert scrub(token) == _REDACTED

    def test_short_string_not_redacted(self):
        assert scrub("anthropic") == "anthropic"
        assert scrub("claude-opus-4-7") == "claude-opus-4-7"

    def test_non_string_passthrough(self):
        assert scrub(42) == 42
        assert scrub(None) is None
        assert scrub(["list"]) == ["list"]


# ---------------------------------------------------------------------------
# Exception handler — no matter content in log
# ---------------------------------------------------------------------------

class TestExceptionHandlerNoPIILeak:
    """The global exception handler must not log prompt or response."""

    @pytest.mark.asyncio
    async def test_handler_does_not_log_prompt_or_response(self):
        """Simulate an unhandled exception; assert log event has no
        prompt/response keys and returns 500."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.core.observability import init_observability

        test_app = FastAPI()
        init_observability(test_app)

        logged_events: list[dict] = []

        import structlog

        def _capture_processor(logger, method, event_dict):
            logged_events.append(dict(event_dict))
            raise structlog.DropEvent()

        # Prepend a capturing processor so we catch the log event before it
        # is rendered/emitted.
        structlog.configure(
            processors=[_capture_processor],
            wrapper_class=structlog.make_filtering_bound_logger(0),
            logger_factory=structlog.PrintLoggerFactory(),
        )

        @test_app.get("/boom")
        async def _boom():
            raise RuntimeError("Something went wrong with prompt=secret_prompt")

        client = TestClient(test_app, raise_server_exceptions=False)
        resp = client.get("/boom")

        assert resp.status_code == 500
        body = resp.json()
        assert body["error"] == "internal_server_error"

        # Verify no captured event contains raw prompt or response values
        # (they should never even be present as keys).
        for event in logged_events:
            assert "prompt" not in event, f"'prompt' leaked into log: {event}"
            assert "response" not in event, f"'response' leaked into log: {event}"


# ---------------------------------------------------------------------------
# Provider failure — only provider name and code logged, no request body
# ---------------------------------------------------------------------------

class TestProviderErrorLogging:
    """record_provider_error emits provider/code/upstream_status only."""

    def test_provider_error_event_has_no_body(self, capsys):
        """Emit a provider error event and verify no body/prompt in the output."""
        import structlog
        from app.core import observability as obs

        captured: list[dict] = []

        def _capture(logger, method, event_dict):
            captured.append(dict(event_dict))
            raise structlog.DropEvent()

        structlog.configure(
            processors=[_capture],
            wrapper_class=structlog.make_filtering_bound_logger(0),
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=False,
        )
        obs._obs_logger = structlog.get_logger("legalise.observability")

        record_provider_error(
            provider="anthropic",
            code="provider_rate_limited",
            upstream_status=429,
        )

        assert len(captured) >= 1
        evt = captured[-1]
        assert evt["provider"] == "anthropic"
        assert evt["code"] == "provider_rate_limited"
        assert evt["upstream_status"] == 429
        # No matter content
        assert "prompt" not in evt
        assert "response" not in evt
        assert "body" not in evt
        assert "text" not in evt


# ---------------------------------------------------------------------------
# Counter / event helpers — basic smoke
# ---------------------------------------------------------------------------

class TestRecordHelpers:
    def _capture_events(self):
        import structlog
        from app.core import observability as obs
        captured: list[dict] = []

        def _proc(logger, method, event_dict):
            captured.append(dict(event_dict))
            raise structlog.DropEvent()

        structlog.configure(
            processors=[_proc],
            wrapper_class=structlog.make_filtering_bound_logger(0),
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=False,
        )
        # Module-level logger is cached at import. Rebind so the helpers
        # write through the capture processor.
        obs._obs_logger = structlog.get_logger("legalise.observability")
        return captured

    def test_record_request_error(self):
        captured = self._capture_events()
        record_request_error(status_code=500, path="/api/foo", method="GET", error_type="ValueError")
        assert any(e.get("status_code") == 500 for e in captured)

    def test_record_job_failure(self):
        captured = self._capture_events()
        record_job_failure(job_id="abc123", kind="pre_motion", error_code="timeout")
        assert any(e.get("job_id") == "abc123" for e in captured)

    def test_record_key_missing(self):
        captured = self._capture_events()
        record_key_missing(provider="openai")
        assert any(e.get("provider") == "openai" for e in captured)

    def test_record_storage_failure(self):
        captured = self._capture_events()
        record_storage_failure(operation="put_bytes", error_type="ConnectionError")
        assert any(e.get("operation") == "put_bytes" for e in captured)
