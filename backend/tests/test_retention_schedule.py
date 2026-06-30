"""Scheduled retention sweep — `app.worker.scheduled_retention_sweep`.

The cron is always registered but must be a no-op unless
LEGALISE_RETENTION_SWEEP_ENABLED is set; when enabled it applies the sweep
with the configured blast-radius limit. No DB needed — the sweep call is
stubbed; we assert the gate + the arguments.
"""

from __future__ import annotations

import contextlib

import pytest

import app.tools.retention_sweep as sweep_mod
from app.core.config import settings
from app.worker import scheduled_retention_sweep


def _fake_ctx():
    @contextlib.asynccontextmanager
    async def _factory():
        yield object()  # session sentinel — the stubbed sweep ignores it

    return {"session_factory": _factory}


@pytest.mark.asyncio
async def test_disabled_is_noop(monkeypatch) -> None:
    monkeypatch.setattr(settings, "retention_sweep_enabled", False, raising=False)
    called = False

    async def _stub(*a, **k):
        nonlocal called
        called = True
        return 0

    monkeypatch.setattr(sweep_mod, "run_retention_sweep", _stub)
    await scheduled_retention_sweep(_fake_ctx())
    assert called is False


@pytest.mark.asyncio
async def test_enabled_applies_with_limit(monkeypatch) -> None:
    monkeypatch.setattr(settings, "retention_sweep_enabled", True, raising=False)
    monkeypatch.setattr(settings, "retention_sweep_limit", 7, raising=False)
    seen: dict = {}

    async def _stub(session, *, apply, today, limit=None):
        seen.update(apply=apply, limit=limit)
        return 0

    monkeypatch.setattr(sweep_mod, "run_retention_sweep", _stub)
    await scheduled_retention_sweep(_fake_ctx())
    assert seen == {"apply": True, "limit": 7}
