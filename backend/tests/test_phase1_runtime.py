"""Phase 1 runtime infrastructure tests.

Covers the shared substrate-primitive helpers in
``app.core.phase1_runtime``: BlockedReason enum, BlockedPayload
canonical shape, audit_phase1 emission, and check_or_block (both
success and denial paths including the dual-audit pattern).

DB-backed tests skip cleanly when Postgres at ``TEST_DATABASE_URL``
is unreachable (conftest handles this).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.phase1_runtime import (
    BlockedPayload,
    BlockedReason,
    Phase1Blocked,
    Phase1Failed,
    audit_phase1,
    check_or_block,
)
from app.models import AuditEntry, User


# ---------------------------------------------------------------------------
# Pure unit tests — no DB
# ---------------------------------------------------------------------------


def test_blocked_reason_enum_values() -> None:
    """The enum values are the canonical strings used in audit payloads
    and HTTP responses. Drift would silently break Phase 5 audit
    reconstruction filters."""
    assert BlockedReason.CAPABILITY_DENIED.value == "capability_denied"
    assert BlockedReason.GATE_BLOCKED.value == "gate_blocked"
    assert BlockedReason.INVALID_TRANSITION.value == "invalid_transition"
    assert BlockedReason.SCHEMA_VIOLATION.value == "schema_violation"
    assert BlockedReason.ROLE_DENIED.value == "role_denied"
    assert BlockedReason.MISSING_INPUT.value == "missing_input"
    assert BlockedReason.TIER_EXCEEDED.value == "tier_exceeded"
    assert BlockedReason.TIER_DISALLOWED.value == "tier_disallowed"


def test_blocked_payload_minimal_shape() -> None:
    """Required fields only: status + blocked_reason. No optional keys
    leak into the dict."""
    payload = BlockedPayload(blocked_reason=BlockedReason.INVALID_TRANSITION)
    got = payload.to_dict()
    assert got == {
        "status": "blocked",
        "blocked_reason": "invalid_transition",
    }
    assert "denied_capability" not in got
    assert "gate_state" not in got


def test_blocked_payload_with_capability() -> None:
    payload = BlockedPayload(
        blocked_reason=BlockedReason.CAPABILITY_DENIED,
        denied_capability="matter.context.legalise_memory.facts.write",
    )
    got = payload.to_dict()
    assert got == {
        "status": "blocked",
        "blocked_reason": "capability_denied",
        "denied_capability": "matter.context.legalise_memory.facts.write",
    }


def test_blocked_payload_with_gate_state() -> None:
    payload = BlockedPayload(
        blocked_reason=BlockedReason.GATE_BLOCKED,
        gate_state={"gate": "privilege_posture", "posture": "C_paused"},
    )
    got = payload.to_dict()
    assert got["status"] == "blocked"
    assert got["blocked_reason"] == "gate_blocked"
    assert got["gate_state"] == {
        "gate": "privilege_posture",
        "posture": "C_paused",
    }


def test_blocked_payload_with_all_fields() -> None:
    payload = BlockedPayload(
        blocked_reason=BlockedReason.TIER_EXCEEDED,
        denied_capability="advice_boundary.transition",
        gate_state={"requested_tier": "approved_final_advice", "declared_max": "draft_advice"},
    )
    got = payload.to_dict()
    assert set(got.keys()) == {"status", "blocked_reason", "denied_capability", "gate_state"}


def test_phase1_blocked_carries_payload() -> None:
    payload = BlockedPayload(
        blocked_reason=BlockedReason.SCHEMA_VIOLATION,
        denied_capability="matter.context.legalise_memory.facts.write",
    )
    err = Phase1Blocked(payload)
    assert err.payload is payload
    assert "schema_violation" in str(err)


def test_phase1_failed_carries_cause() -> None:
    cause = RuntimeError("DB unreachable")
    err = Phase1Failed("system error", cause=cause)
    assert err.cause is cause
    assert str(err) == "system error"


# ---------------------------------------------------------------------------
# DB-backed tests
# ---------------------------------------------------------------------------


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"phase1-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_audit_phase1_writes_row_with_canonical_shape(db_session) -> None:
    """audit_phase1 writes an AuditEntry row with the `module` column
    set to `core.<primitive>` and the payload carrying `module_id` +
    `capability_id` packed alongside the user-supplied payload."""
    user = await _make_user(db_session)
    matter_id = uuid.uuid4()
    await audit_phase1(
        db_session,
        action="matter_context.item.created",
        primitive="matter_context",
        actor_id=user.id,
        matter_id=matter_id,
        module_id="core",
        capability_id="matter.context.legalise_memory.facts.write",
        resource_type="matter_context_item",
        resource_id="some-item-id",
        payload={"namespace": "legalise_memory.facts", "schema_version": "1.0.0"},
    )
    await db_session.flush()

    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.item.created",
            AuditEntry.actor_id == user.id,
        )
    )
    assert row is not None
    assert row.module == "core.matter_context"
    assert row.resource_type == "matter_context_item"
    assert row.resource_id == "some-item-id"
    # Composed payload carries user fields + module_id + capability_id.
    assert row.payload["namespace"] == "legalise_memory.facts"
    assert row.payload["schema_version"] == "1.0.0"
    assert row.payload["module_id"] == "core"
    assert (
        row.payload["capability_id"]
        == "matter.context.legalise_memory.facts.write"
    )


@pytest.mark.asyncio
async def test_audit_phase1_blocked_payload_merges(db_session) -> None:
    """When a BlockedPayload is supplied, it merges into the audit row's
    payload alongside module_id + capability_id."""
    user = await _make_user(db_session)
    blocked = BlockedPayload(
        blocked_reason=BlockedReason.INVALID_TRANSITION,
        gate_state={"from_state": "draft", "to_state": "approved"},
    )
    await audit_phase1(
        db_session,
        action="state_machine.transition.blocked",
        primitive="state_machine",
        actor_id=user.id,
        module_id="core",
        capability_id="matter.state.intake.transition",
        payload={"instance_id": "sm-123"},
        blocked=blocked,
    )
    await db_session.flush()

    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "state_machine.transition.blocked",
            AuditEntry.actor_id == user.id,
        )
    )
    assert row is not None
    assert row.module == "core.state_machine"
    assert row.payload["status"] == "blocked"
    assert row.payload["blocked_reason"] == "invalid_transition"
    assert row.payload["gate_state"] == {
        "from_state": "draft",
        "to_state": "approved",
    }
    assert row.payload["module_id"] == "core"
    assert row.payload["capability_id"] == "matter.state.intake.transition"
    assert row.payload["instance_id"] == "sm-123"


@pytest.mark.asyncio
async def test_audit_phase1_blocked_overrides_status(db_session) -> None:
    """If caller supplies `status` in payload AND a BlockedPayload, the
    BlockedPayload's status="blocked" wins. Audit reconstruction relies
    on this — the status key must always be canonical when blocked is
    supplied."""
    user = await _make_user(db_session)
    await audit_phase1(
        db_session,
        action="matter_context.write.blocked",
        primitive="matter_context",
        actor_id=user.id,
        payload={"status": "this should be overridden"},
        blocked=BlockedPayload(blocked_reason=BlockedReason.SCHEMA_VIOLATION),
    )
    await db_session.flush()
    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.write.blocked",
            AuditEntry.actor_id == user.id,
        )
    )
    assert row is not None
    assert row.payload["status"] == "blocked"


@pytest.mark.asyncio
async def test_check_or_block_success_returns_none(db_session) -> None:
    """When the user holds the capability, check_or_block returns None
    without writing any audit row beyond what the underlying grant
    lookup does (which is none on success)."""
    from app.core.capabilities import grant

    user = await _make_user(db_session)
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="matter_context",
        capability="matter.context.legalise_memory.facts.write",
    )
    await db_session.flush()

    # Should not raise.
    result = await check_or_block(
        db_session,
        user_id=user.id,
        capability="matter.context.legalise_memory.facts.write",
        primitive="matter_context",
        block_action="matter_context.write.blocked",
    )
    assert result is None

    # No blocked audit rows should exist for this user.
    rows = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.actor_id == user.id,
                AuditEntry.action == "matter_context.write.blocked",
            )
        )
    ).all()
    assert rows == []


@pytest.mark.asyncio
async def test_check_or_block_denied_writes_dual_audit_and_raises(
    db_session, db_connection
) -> None:
    """Denial path: BOTH audit rows must exist after the call, and
    Phase1Blocked carries the BlockedPayload with CAPABILITY_DENIED
    + the requested capability string.

    Per architectural decision #2 in PHASE_1_BUILD_PLAN.md:
    - `module.capability.denied` written by require_capability
      (existing behaviour)
    - `<block_action>` written by check_or_block via audit_failure
      (Phase 1 canonical row, survives rollback)
    """
    user = await _make_user(db_session)
    # Do NOT grant the capability.

    capability = "matter.context.legalise_memory.facts.write"
    with pytest.raises(Phase1Blocked) as exc_info:
        await check_or_block(
            db_session,
            user_id=user.id,
            capability=capability,
            primitive="matter_context",
            block_action="matter_context.write.blocked",
        )

    # Phase1Blocked carries the canonical payload.
    err = exc_info.value
    assert err.payload.blocked_reason == BlockedReason.CAPABILITY_DENIED
    assert err.payload.denied_capability == capability

    # Both audit rows must be queryable. The legacy
    # `module.capability.denied` row is on the db_session because
    # require_capability commits it through the request session. The
    # Phase 1 `*.blocked` row was written via audit_failure on a
    # separate session, so we have to query it through a different
    # session bound to the same outer transaction.
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    factory = async_sessionmaker(
        bind=db_connection,
        class_=AsyncSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    async with factory() as verify_session:
        legacy_row = await verify_session.scalar(
            select(AuditEntry).where(
                AuditEntry.actor_id == user.id,
                AuditEntry.action == "module.capability.denied",
            )
        )
        assert legacy_row is not None, "legacy module.capability.denied row missing"
        assert legacy_row.payload["capability"] == capability

        phase1_row = await verify_session.scalar(
            select(AuditEntry).where(
                AuditEntry.actor_id == user.id,
                AuditEntry.action == "matter_context.write.blocked",
            )
        )
        assert phase1_row is not None, (
            "phase 1 canonical *.blocked row missing — check_or_block "
            "must always emit this in addition to the legacy row"
        )
        assert phase1_row.module == "core.matter_context"
        assert phase1_row.payload["status"] == "blocked"
        assert phase1_row.payload["blocked_reason"] == "capability_denied"
        assert phase1_row.payload["denied_capability"] == capability
        assert phase1_row.payload["module_id"] == "core"
        assert phase1_row.payload["capability_id"] == capability


@pytest.mark.asyncio
async def test_check_or_block_default_skill_falls_back_to_primitive(
    db_session,
) -> None:
    """When `skill` is omitted, check_or_block uses `primitive` as the
    skill. This keeps substrate call sites compact for the common
    case."""
    from app.core.capabilities import grant

    user = await _make_user(db_session)
    # Grant under skill="state_machine" (the primitive default).
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="state_machine",
        capability="matter.state.intake.transition",
    )
    await db_session.flush()

    # Call without explicit skill — should resolve to skill="state_machine"
    # and find the grant.
    await check_or_block(
        db_session,
        user_id=user.id,
        capability="matter.state.intake.transition",
        primitive="state_machine",
        block_action="state_machine.transition.blocked",
    )
    # No exception = success.
