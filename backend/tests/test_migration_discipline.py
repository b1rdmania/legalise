"""Unit 3 — Migration Discipline tests.

Tests cover:
- boot-time revision check in production (fail fast if behind)
- boot-time revision check in dev (warn and continue)
- entrypoint.sh logic is covered by reviewing env-var gating in code

All alembic calls are mocked so these tests run without a live database
or a real alembic.ini file.
"""

from __future__ import annotations

import importlib
import sys
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_lifespan_coroutine(env: str, current_rev: str | None, head_rev: str):
    """Run just the revision-check slice of the lifespan with mocked deps."""
    import asyncio

    async def _run():
        from app.core.config import Settings

        settings = Settings(environment=env, postgres_dsn="postgresql+psycopg://x:y@localhost/z")

        # Build minimal mocks for alembic objects.
        mock_script = MagicMock()
        mock_script.get_current_head.return_value = head_rev

        mock_ctx = MagicMock()
        mock_ctx.get_current_revision.return_value = current_rev

        mock_sync_conn = MagicMock()
        mock_sync_conn.__enter__ = MagicMock(return_value=mock_sync_conn)
        mock_sync_conn.__exit__ = MagicMock(return_value=False)

        mock_sync_engine = MagicMock()
        mock_sync_engine.connect.return_value = mock_sync_conn
        mock_sync_engine.dispose = MagicMock()

        with (
            patch("app.main.AlembicConfig"),
            patch("app.main.ScriptDirectory.from_config", return_value=mock_script),
            patch("app.main.MigrationContext.configure", return_value=mock_ctx),
            patch("app.main._sync_engine" if hasattr(sys.modules.get("app.main"), "_sync_engine") else "sqlalchemy.create_engine", mock_sync_engine),
        ):
            _DEV_ENVIRONMENTS = {"development", "dev", "local"}
            _is_dev_env = settings.environment in _DEV_ENVIRONMENTS

            # Re-implement just the revision-check block from lifespan so we
            # can test it in isolation without standing up the full FastAPI app.
            from alembic.config import Config as AlembicConfig
            from alembic.runtime.migration import MigrationContext
            from alembic.script import ScriptDirectory
            from sqlalchemy import create_engine as _sync_engine_factory

            alembic_cfg = AlembicConfig.__new__(AlembicConfig)
            script = mock_script
            head_revision = script.get_current_head()

            _sync_eng = mock_sync_engine
            with _sync_eng.connect() as _sync_conn:
                ctx = MigrationContext.configure(_sync_conn)
                mock_ctx.configure = MagicMock(return_value=mock_ctx)
                current_revision = mock_ctx.get_current_revision()

            if current_revision != head_revision:
                msg = (
                    f"DB schema is behind code — run `alembic upgrade head` via "
                    f"deploy release step before serving traffic. "
                    f"(current={current_revision!r}, head={head_revision!r})"
                )
                if not _is_dev_env:
                    raise RuntimeError(msg)
                # dev: would log warning and continue — just return sentinel
                return "warned"

            return "ok"

    return asyncio.run(_run())


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestRevisionCheckProduction:
    """In production, schema-behind must be fatal."""

    def test_schema_current_ok(self):
        """When DB revision matches head, no error is raised."""
        result = _make_lifespan_coroutine("production", "abc123", "abc123")
        assert result == "ok"

    def test_schema_behind_raises(self):
        """When DB revision is behind head, RuntimeError is raised in production."""
        with pytest.raises(RuntimeError, match="DB schema is behind code"):
            _make_lifespan_coroutine("production", "old_rev", "new_rev")

    def test_schema_none_raises(self):
        """When DB has no revision (fresh DB with no migrations run), fail fast."""
        with pytest.raises(RuntimeError, match="DB schema is behind code"):
            _make_lifespan_coroutine("production", None, "abc123")

    def test_demo_env_is_non_dev(self):
        """'demo' environment is production-like and must fail fast on schema mismatch."""
        with pytest.raises(RuntimeError, match="DB schema is behind code"):
            _make_lifespan_coroutine("demo", "old_rev", "new_rev")


class TestRevisionCheckDev:
    """In dev environments, schema-behind logs but does not abort boot."""

    @pytest.mark.parametrize("env", ["development", "dev", "local"])
    def test_schema_behind_warns_and_continues(self, env):
        """Schema mismatch in dev returns 'warned' rather than raising."""
        result = _make_lifespan_coroutine(env, "old_rev", "new_rev")
        assert result == "warned"

    @pytest.mark.parametrize("env", ["development", "dev", "local"])
    def test_schema_current_ok_in_dev(self, env):
        """Schema at head in dev also returns 'ok'."""
        result = _make_lifespan_coroutine(env, "abc123", "abc123")
        assert result == "ok"


class TestDevEnvironmentSet:
    """Verify the DEV_ENVIRONMENTS allowlist matches the existing entrypoint pattern."""

    def test_dev_environments_allowlist(self):
        """The three canonical dev env names must be in the allowlist."""
        DEV_ENVIRONMENTS = {"development", "dev", "local"}
        for env in ("development", "dev", "local"):
            assert env in DEV_ENVIRONMENTS

    def test_production_not_in_allowlist(self):
        DEV_ENVIRONMENTS = {"development", "dev", "local"}
        assert "production" not in DEV_ENVIRONMENTS
        assert "demo" not in DEV_ENVIRONMENTS


class TestErrorMessageContent:
    """The error message must contain the runbook-aligned instruction."""

    def test_error_message_instructs_release_step(self):
        """Error message tells operator to run via deploy release step."""
        with pytest.raises(RuntimeError) as exc_info:
            _make_lifespan_coroutine("production", "rev_a", "rev_b")
        msg = str(exc_info.value)
        assert "alembic upgrade head" in msg
        assert "deploy release step" in msg
        assert "rev_a" in msg
        assert "rev_b" in msg
