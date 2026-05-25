"""Phase 5 Step 1 + Step 2 — audit cost columns + helper tests."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, text

from app.core.audit_cost import audit_emit_model_invoked
from app.models import AuditEntry, User


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p5-cost-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_helper_populates_columns_and_payload(db_session) -> None:
    """audit_emit_model_invoked writes to BOTH new columns AND payload."""
    user = await _make_user(db_session)
    await audit_emit_model_invoked(
        db_session,
        matter_id=None,
        actor_user_id=user.id,
        module_id="examples.test",
        capability_id="matter.test.write",
        model_id="claude-opus-4-7",
        provider="anthropic",
        tokens_in=1000,
        tokens_out=500,
        cost_micros=12_345_000,
        currency="GBP",
    )
    await db_session.commit()

    row = await db_session.scalar(
        select(AuditEntry).where(AuditEntry.action == "model.invoked")
    )
    assert row is not None
    # Columns populated
    assert row.tokens_in == 1000
    assert row.tokens_out == 500
    assert row.cost_micros == 12_345_000
    assert row.currency == "GBP"
    assert row.provider == "anthropic"
    assert row.model_id == "claude-opus-4-7"
    # Payload mirrors for forward-compat
    assert row.payload["cost_micros"] == 12_345_000
    assert row.payload["currency"] == "GBP"
    assert row.payload["tokens_in"] == 1000


@pytest.mark.asyncio
async def test_helper_rejects_unpaired_cost_currency(db_session) -> None:
    """cost_micros + currency must be both NULL or both set."""
    user = await _make_user(db_session)
    with pytest.raises(ValueError, match="must both be set or both be None"):
        await audit_emit_model_invoked(
            db_session,
            matter_id=None,
            actor_user_id=user.id,
            module_id="examples.test",
            capability_id="matter.test.write",
            model_id="claude-opus-4-7",
            provider="anthropic",
            tokens_in=100,
            tokens_out=50,
            cost_micros=1000,
            currency=None,  # unpaired!
        )


@pytest.mark.asyncio
async def test_helper_rejects_negative_cost(db_session) -> None:
    user = await _make_user(db_session)
    with pytest.raises(ValueError, match="non-negative"):
        await audit_emit_model_invoked(
            db_session,
            matter_id=None,
            actor_user_id=user.id,
            module_id="examples.test",
            capability_id="matter.test.write",
            model_id="m",
            provider="p",
            tokens_in=0,
            tokens_out=0,
            cost_micros=-1,
            currency="GBP",
        )


@pytest.mark.asyncio
async def test_helper_rejects_unknown_currency(db_session) -> None:
    user = await _make_user(db_session)
    with pytest.raises(ValueError, match="allow-list"):
        await audit_emit_model_invoked(
            db_session,
            matter_id=None,
            actor_user_id=user.id,
            module_id="examples.test",
            capability_id="matter.test.write",
            model_id="m",
            provider="p",
            tokens_in=0,
            tokens_out=0,
            cost_micros=1000,
            currency="XYZ",
        )


@pytest.mark.asyncio
async def test_check_constraint_at_db_level(db_session) -> None:
    """The (cost_micros NULL) = (currency NULL) check constraint
    must reject malformed rows even if the helper is bypassed."""
    # Bypass the helper. Try to insert a row with currency but no cost.
    user = await _make_user(db_session)
    row = AuditEntry(
        actor_id=user.id,
        action="test.bypass",
        currency="GBP",  # set
        cost_micros=None,  # unset — should violate check
        payload={},
    )
    db_session.add(row)
    with pytest.raises(Exception):  # IntegrityError from psycopg
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_worm_trigger_still_rejects_update(db_session) -> None:
    """Migration 0017 added columns but did not relax the WORM trigger."""
    user = await _make_user(db_session)
    await audit_emit_model_invoked(
        db_session,
        matter_id=None,
        actor_user_id=user.id,
        module_id="examples.test",
        capability_id="matter.test.write",
        model_id="m",
        provider="p",
        tokens_in=100,
        tokens_out=50,
        cost_micros=1000,
        currency="GBP",
    )
    await db_session.commit()

    row = await db_session.scalar(
        select(AuditEntry).where(AuditEntry.action == "model.invoked")
    )
    assert row is not None
    # Attempt UPDATE — should be blocked by WORM trigger.
    with pytest.raises(Exception):
        await db_session.execute(
            text("UPDATE audit_entries SET cost_micros = 999 WHERE id = :rid"),
            {"rid": row.id},
        )
        await db_session.commit()
    await db_session.rollback()
