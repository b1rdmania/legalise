"""Tests for the optional, env-gated Sentry error-tracking hook.

These tests never touch the network: `sentry_sdk.init` is monkeypatched to
record its call args, and the DSN is monkeypatched onto `settings`.
"""

from __future__ import annotations

import sys

import pytest

from app.core import observability
from app.core.config import settings


class _InitRecorder:
    """Records calls to a stand-in for ``sentry_sdk.init``."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def __call__(self, *args, **kwargs) -> None:
        self.calls.append(kwargs)


def test_init_error_tracking_noop_when_dsn_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """With no DSN, init_error_tracking must NOT call sentry_sdk.init."""
    monkeypatch.setattr(settings, "sentry_dsn", None, raising=False)

    recorder = _InitRecorder()
    # If sentry_sdk is importable, patch its init; otherwise inject a stub
    # module so the (never-taken) import path would still be observable.
    stub = type(sys)("sentry_sdk")
    stub.init = recorder  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sentry_sdk", stub)

    observability.init_error_tracking()

    assert recorder.calls == []


def test_init_error_tracking_inits_with_pii_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With a DSN set, init_error_tracking calls sentry_sdk.init once with
    send_default_pii=False (privacy guarantee) and the configured DSN."""
    dsn = "https://examplePublicKey@o0.ingest.sentry.io/0"
    monkeypatch.setattr(settings, "sentry_dsn", dsn, raising=False)
    monkeypatch.setattr(settings, "sentry_traces_sample_rate", 0.0, raising=False)

    recorder = _InitRecorder()
    stub = type(sys)("sentry_sdk")
    stub.init = recorder  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sentry_sdk", stub)

    observability.init_error_tracking()

    assert len(recorder.calls) == 1
    call = recorder.calls[0]
    assert call["dsn"] == dsn
    assert call["send_default_pii"] is False
    assert call["environment"] == settings.environment
