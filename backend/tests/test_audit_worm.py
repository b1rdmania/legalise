"""Audit WORM enforcement tests.

These tests verify that UPDATE and DELETE on ``audit_entries`` are blocked
at the Postgres trigger layer. They require a live Postgres connection with
the 0011 migration applied.

Skip condition: TEST_DATABASE_URL unreachable (same pattern as conftest.py).

Two coverage paths:
1.  Raw SQL via psycopg / asyncpg — exercises the trigger directly,
    independent of the ORM. This is the primary WORM verification.
2.  ORM path via SQLAlchemy — belt-and-braces; confirms the trigger fires
    regardless of how the statement reaches Postgres.

Both paths expect ``sqlalchemy.exc.DBAPIError`` (or a subclass such as
``ProgrammingError`` / ``InternalError``) with "append-only" in the message,
which is what the trigger raises.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from app.models.audit import AuditEntry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_row() -> dict:
    return {
        "id": uuid.uuid4(),
        "timestamp": datetime.now(tz=timezone.utc),
        "actor_id": None,
        "matter_id": None,
        "action": "worm.test.probe",
        "module": "test",
        "resource_type": None,
        "resource_id": None,
        "model_used": None,
        "prompt_hash": None,
        "response_hash": None,
        "token_count": None,
        "latency_ms": None,
        "payload": {"kind": "worm_test"},
    }


async def _insert_row(conn: AsyncConnection, row: dict) -> uuid.UUID:
    """Insert a raw audit row and return its id."""
    await conn.execute(
        text(
            """
            INSERT INTO audit_entries
                (id, timestamp, actor_id, matter_id, action, module,
                 resource_type, resource_id, model_used, prompt_hash,
                 response_hash, token_count, latency_ms, payload)
            VALUES
                (:id, :timestamp, :actor_id, :matter_id, :action, :module,
                 :resource_type, :resource_id, :model_used, :prompt_hash,
                 :response_hash, :token_count, :latency_ms, CAST(:payload AS jsonb))
            """
        ),
        {**row, "id": str(row["id"]), "payload": '{"kind": "worm_test"}'},
    )
    return row["id"]


# ---------------------------------------------------------------------------
# Tests — raw SQL path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_audit_entry_is_blocked_by_trigger(
    db_connection: AsyncConnection,
) -> None:
    """UPDATE on audit_entries must raise an exception with 'append-only'."""
    row = _seed_row()
    row_id = await _insert_row(db_connection, row)

    with pytest.raises(DBAPIError, match="append-only"):
        await db_connection.execute(
            text(
                "UPDATE audit_entries SET action = 'tampered' WHERE id = :id"
            ),
            {"id": str(row_id)},
        )


@pytest.mark.asyncio
async def test_delete_audit_entry_is_blocked_by_trigger(
    db_connection: AsyncConnection,
) -> None:
    """DELETE on audit_entries must raise an exception with 'append-only'."""
    row = _seed_row()
    row_id = await _insert_row(db_connection, row)

    with pytest.raises(DBAPIError, match="append-only"):
        await db_connection.execute(
            text("DELETE FROM audit_entries WHERE id = :id"),
            {"id": str(row_id)},
        )


@pytest.mark.asyncio
async def test_insert_audit_entry_succeeds(
    db_connection: AsyncConnection,
) -> None:
    """INSERT must still work — trigger must NOT block writes."""
    row = _seed_row()
    # Should not raise
    row_id = await _insert_row(db_connection, row)

    result = await db_connection.execute(
        text("SELECT id FROM audit_entries WHERE id = :id"),
        {"id": str(row_id)},
    )
    assert result.fetchone() is not None, "inserted row not found"


# ---------------------------------------------------------------------------
# Tests — ORM path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orm_update_blocked(db_session: AsyncSession) -> None:
    """ORM flush of a modified AuditEntry must be blocked by the trigger."""
    entry = AuditEntry(
        action="worm.orm.probe",
        module="test",
        payload={"kind": "worm_test"},
    )
    db_session.add(entry)
    await db_session.flush()

    # Mutate a field — this issues an UPDATE on flush
    entry.action = "tampered"

    with pytest.raises(DBAPIError, match="append-only"):
        await db_session.flush()
