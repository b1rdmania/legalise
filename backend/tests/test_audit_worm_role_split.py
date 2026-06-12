"""Audit WORM — role-split (REVOKE) layer verification (R2 hardening #7).

``test_audit_worm.py`` proves the *trigger* layer: any role attempting
UPDATE/DELETE on ``audit_entries`` gets an "append-only" exception. This
module proves the *second*, independent layer: when the database is run with
the production role split (``infra/postgres-roles.sql``), the application role
physically lacks UPDATE/DELETE privilege and is refused at the access-control
check — SQLSTATE ``42501`` (insufficient_privilege) — *before* the trigger
even fires. That guarantee survives a future migration accidentally dropping
the trigger.

This suite runs only when ``TEST_APP_ROLE_DATABASE_URL`` points at a Postgres
connection authenticated as the unprivileged ``legalise_app`` role against a
database where 0011 + the role split have been applied. CI provisions exactly
that (the backend job creates ``legalise_app`` before migrations and applies
``infra/postgres-roles.sql`` after them), so these tests run for real on every
CI build. Local single-role dev leaves the var unset and the tests skip
cleanly — the local posture is unchanged.

Stand a local harness up with ``infra/verify-worm-role-split.sh`` (disposable
mode), or point the var at any role-split DB.
"""

from __future__ import annotations

import os
import socket
import uuid
from urllib.parse import urlparse

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine


APP_ROLE_DSN = os.environ.get("TEST_APP_ROLE_DATABASE_URL")


def _reachable(dsn: str) -> bool:
    parsed = urlparse(dsn.replace("+asyncpg", "").replace("+psycopg", ""))
    try:
        with socket.create_connection(
            (parsed.hostname or "localhost", parsed.port or 5432), timeout=1
        ):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not APP_ROLE_DSN or not _reachable(APP_ROLE_DSN),
    reason=(
        "Role-split WORM tests need TEST_APP_ROLE_DATABASE_URL pointing at a "
        "reachable legalise_app-role connection. See infra/verify-worm-role-split.sh."
    ),
)


def _probe_row() -> dict:
    return {
        "id": str(uuid.uuid4()),
        "action": "worm.rolesplit.probe",
        "module": "test",
    }


async def _app_engine():
    return create_async_engine(APP_ROLE_DSN, echo=False, future=True)


@pytest.mark.asyncio
async def test_app_role_can_insert_audit_row() -> None:
    """The app role must still be able to APPEND audit rows."""
    engine = await _app_engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(
                sa.text(
                    "INSERT INTO audit_entries (id, action, module, payload) "
                    "VALUES (:id, :action, :module, CAST('{}' AS jsonb))"
                ),
                _probe_row(),
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_app_role_can_select_audit_rows() -> None:
    """The app role must still be able to READ the audit trail."""
    engine = await _app_engine()
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                sa.text("SELECT count(*) FROM audit_entries")
            )
            assert result.scalar_one() >= 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_app_role_update_denied_by_privilege() -> None:
    """UPDATE must be refused by the privilege check (SQLSTATE 42501),
    independently of the trigger."""
    engine = await _app_engine()
    try:
        with pytest.raises(DBAPIError) as exc:
            async with engine.begin() as conn:
                await conn.execute(
                    sa.text("UPDATE audit_entries SET action = 'tampered'")
                )
        assert _sqlstate(exc.value) == "42501", (
            f"expected insufficient_privilege (42501), got {_sqlstate(exc.value)}: "
            f"{exc.value}"
        )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_app_role_delete_denied_by_privilege() -> None:
    """DELETE must be refused by the privilege check (SQLSTATE 42501)."""
    engine = await _app_engine()
    try:
        with pytest.raises(DBAPIError) as exc:
            async with engine.begin() as conn:
                await conn.execute(sa.text("DELETE FROM audit_entries"))
        assert _sqlstate(exc.value) == "42501", (
            f"expected insufficient_privilege (42501), got {_sqlstate(exc.value)}: "
            f"{exc.value}"
        )
    finally:
        await engine.dispose()


def _sqlstate(err: DBAPIError) -> str | None:
    """Pull the Postgres SQLSTATE off the wrapped DBAPI exception.

    asyncpg surfaces it as ``.sqlstate``; psycopg as ``.pgcode``.
    """
    orig = getattr(err, "orig", None)
    return (
        getattr(orig, "sqlstate", None)
        or getattr(orig, "pgcode", None)
    )
