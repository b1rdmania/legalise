"""Audit hash-chain tests.

The chain is written by a database trigger, not by application call sites.
These tests exercise the DB property directly and verify that the Python
verifier's canonical hash recipe stays aligned with the PL/pgSQL recipe.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.core.audit_chain import verify_audit_chain
from app.models import (
    AUDIT_CHAIN_SCOPE_MATTER,
    AUDIT_CHAIN_SCOPE_SYSTEM,
    AuditChainEntry,
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
)


def _row(*, action: str = "chain.test", matter_id: uuid.UUID | None = None) -> dict:
    return {
        "id": uuid.uuid4(),
        "timestamp": datetime.now(tz=UTC),
        "actor_id": None,
        "matter_id": matter_id,
        "action": action,
        "module": "test",
        "resource_type": "probe",
        "resource_id": uuid.uuid4().hex,
        "model_used": None,
        "prompt_hash": None,
        "response_hash": None,
        "token_count": None,
        "latency_ms": None,
        "tokens_in": None,
        "tokens_out": None,
        "cost_micros": None,
        "currency": None,
        "provider": None,
        "model_id": None,
        "payload": '{"kind":"chain_test","n":1}',
    }


async def _insert_audit_raw(conn: AsyncConnection, row: dict) -> uuid.UUID:
    await conn.execute(
        text(
            """
            INSERT INTO audit_entries
                (id, timestamp, actor_id, matter_id, action, module,
                 resource_type, resource_id, model_used, prompt_hash,
                 response_hash, token_count, latency_ms, tokens_in, tokens_out,
                 cost_micros, currency, provider, model_id, payload)
            VALUES
                (:id, :timestamp, :actor_id, :matter_id, :action, :module,
                 :resource_type, :resource_id, :model_used, :prompt_hash,
                 :response_hash, :token_count, :latency_ms, :tokens_in, :tokens_out,
                 :cost_micros, :currency, :provider, :model_id, CAST(:payload AS jsonb))
            """
        ),
        {**row, "id": str(row["id"]), "matter_id": str(row["matter_id"]) if row["matter_id"] else None},
    )
    return row["id"]


async def _make_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"audit-chain-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session: AsyncSession, user: User) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"audit-chain-{uuid.uuid4().hex[:8]}",
        title="Audit Chain Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


@pytest.mark.asyncio
async def test_audit_insert_creates_system_chain_link(db_connection: AsyncConnection) -> None:
    row_id = await _insert_audit_raw(db_connection, _row(action="chain.system"))

    chain = (
        await db_connection.execute(
            text(
                """
                SELECT scope_type, matter_id, scope_sequence, previous_chain_hash,
                       entry_hash, chain_hash, chain_version
                  FROM audit_chain
                 WHERE audit_entry_id = :id
                """
            ),
            {"id": str(row_id)},
        )
    ).mappings().one()

    assert chain["scope_type"] == AUDIT_CHAIN_SCOPE_SYSTEM
    assert chain["matter_id"] is None
    assert chain["scope_sequence"] >= 1
    assert chain["chain_version"] == 1
    assert len(chain["entry_hash"]) == 64
    assert len(chain["chain_hash"]) == 64


@pytest.mark.asyncio
async def test_rollback_removes_audit_row_and_chain_link(db_connection: AsyncConnection) -> None:
    nested = await db_connection.begin_nested()
    row_id = await _insert_audit_raw(db_connection, _row(action="chain.rollback"))
    await nested.rollback()

    audit_count = await db_connection.scalar(
        text("SELECT count(*) FROM audit_entries WHERE id = :id"),
        {"id": str(row_id)},
    )
    chain_count = await db_connection.scalar(
        text("SELECT count(*) FROM audit_chain WHERE audit_entry_id = :id"),
        {"id": str(row_id)},
    )

    assert audit_count == 0
    assert chain_count == 0


@pytest.mark.asyncio
async def test_matter_and_system_chains_are_scoped_independently(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    system_row = AuditEntry(action="chain.system.scope", module="test", payload={"scope": "system"})
    matter_row = AuditEntry(
        action="chain.matter.scope",
        module="test",
        matter_id=matter.id,
        payload={"scope": "matter"},
    )
    db_session.add_all([system_row, matter_row])
    await db_session.flush()

    system_chain = await db_session.scalar(
        select(AuditChainEntry).where(AuditChainEntry.audit_entry_id == system_row.id)
    )
    matter_chain = await db_session.scalar(
        select(AuditChainEntry).where(AuditChainEntry.audit_entry_id == matter_row.id)
    )

    assert system_chain is not None
    assert matter_chain is not None
    assert system_chain.scope_type == AUDIT_CHAIN_SCOPE_SYSTEM
    assert system_chain.matter_id is None
    assert matter_chain.scope_type == AUDIT_CHAIN_SCOPE_MATTER
    assert matter_chain.matter_id == matter.id


@pytest.mark.asyncio
async def test_audit_chain_is_worm_protected(db_connection: AsyncConnection) -> None:
    row_id = await _insert_audit_raw(db_connection, _row(action="chain.worm"))

    with pytest.raises(DBAPIError, match="append-only"):
        await db_connection.execute(
            text(
                """
                UPDATE audit_chain
                   SET chain_hash = repeat('0', 64)
                 WHERE audit_entry_id = :id
                """
            ),
            {"id": str(row_id)},
        )


@pytest.mark.asyncio
async def test_python_verifier_matches_database_hash_recipe(db_session: AsyncSession) -> None:
    row = AuditEntry(
        action="chain.recipe",
        module="test",
        resource_type="probe",
        resource_id="recipe",
        payload={"z": 1, "a": {"nested": True}},
    )
    db_session.add(row)
    await db_session.flush()

    db_entry_hash = await db_session.scalar(
        text("SELECT audit_chain_entry_hash(ae) FROM audit_entries ae WHERE ae.id = :id"),
        {"id": str(row.id)},
    )
    stored_entry_hash = await db_session.scalar(
        select(AuditChainEntry.entry_hash).where(AuditChainEntry.audit_entry_id == row.id)
    )

    verification = await verify_audit_chain(db_session)

    assert db_entry_hash == stored_entry_hash
    assert verification.ok, verification.issues
    assert verification.audit_entry_count == verification.chain_entry_count
