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
from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
)


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


async def _make_matter(db_session, user) -> Matter:
    """Real ``Matter`` row so audit rows referencing ``matter_id``
    satisfy the FK constraint on ``audit_entries.matter_id``. Round-3
    Reviewer fix — earlier tests passed a phantom UUID which real
    Postgres correctly rejected."""
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"matter-{uuid.uuid4().hex[:8]}",
        title="Phase1 Runtime Test Matter",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


@pytest.mark.asyncio
async def test_audit_phase1_writes_row_with_canonical_shape(db_session) -> None:
    """audit_phase1 writes an AuditEntry row with the `module` column
    set to `core.<primitive>` and the payload carrying `module_id` +
    `capability_id` packed alongside the user-supplied payload.

    Uses a real ``Matter`` so the audit row's ``matter_id`` FK
    constraint is satisfied (round-3 Reviewer fix).
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    await audit_phase1(
        db_session,
        action="matter_context.item.created",
        primitive="matter_context",
        actor_id=user.id,
        matter_id=matter.id,
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
    db_session, monkeypatch
) -> None:
    """Denial path:

    1. ``require_capability`` writes the legacy
       ``module.capability.denied`` row through the request session
       (visible inside the test transaction once savepoint releases).
    2. ``check_or_block`` catches ``CapabilityDenied`` and calls
       ``audit_failure`` with the canonical ``*.blocked`` action +
       ``BlockedPayload``.
    3. ``check_or_block`` re-raises ``Phase1Blocked`` with the
       canonical payload.

    Round-4 Reviewer fix: ``audit_failure`` is mocked here rather than
    invoked against a real fresh-pool connection. The production path
    writes to a fresh connection that commits independently; in the
    conftest SAVEPOINT pattern that fresh connection cannot see the
    test's uncommitted user, so the ``audit_entries.actor_id`` FK
    fails. Mocking matches the existing codebase pattern for
    audit-failure tests (see ``test_provider_audit_completeness.py``).

    The mock both records the invocation and writes the row via the
    request session so the canonical-shape assertion still runs
    against a real ``AuditEntry`` row.
    """
    user = await _make_user(db_session)
    capability = "matter.context.legalise_memory.facts.write"

    # Mock audit_failure: write to the request session (visible in the
    # test's outer transaction) and record the call args.
    captured_calls: list[dict] = []

    async def _fake_audit_failure(
        request_session,
        action,
        **kwargs,
    ):
        captured_calls.append({"action": action, **kwargs})
        # Mirror the row that audit_failure would have written, but
        # via the request session so the row lives inside the test's
        # outer transaction and the FK check resolves.
        from app.core.api import audit

        await audit.log(
            request_session,
            action,
            actor_id=kwargs.get("actor_id"),
            matter_id=kwargs.get("matter_id"),
            module=kwargs.get("module"),
            resource_type=kwargs.get("resource_type"),
            resource_id=kwargs.get("resource_id"),
            payload=kwargs.get("payload"),
        )

    monkeypatch.setattr(
        "app.core.phase1_runtime.capability_check.audit_failure",
        _fake_audit_failure,
    )

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

    # audit_failure was invoked exactly once with the canonical action
    # and a payload carrying the BlockedPayload + module_id + capability_id.
    assert len(captured_calls) == 1
    call = captured_calls[0]
    assert call["action"] == "matter_context.write.blocked"
    assert call["module"] == "core.matter_context"
    assert call["actor_id"] == user.id
    payload = call["payload"]
    assert payload["status"] == "blocked"
    assert payload["blocked_reason"] == "capability_denied"
    assert payload["denied_capability"] == capability
    assert payload["module_id"] == "core"
    assert payload["capability_id"] == capability

    # The legacy row (from require_capability via the request session)
    # is queryable on db_session.
    await db_session.flush()
    legacy_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.actor_id == user.id,
            AuditEntry.action == "module.capability.denied",
        )
    )
    assert legacy_row is not None
    assert legacy_row.payload["capability"] == capability

    # The mirrored *.blocked row (written by our mock via session) is
    # queryable on the same session.
    phase1_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.actor_id == user.id,
            AuditEntry.action == "matter_context.write.blocked",
        )
    )
    assert phase1_row is not None
    assert phase1_row.module == "core.matter_context"
    assert phase1_row.payload["status"] == "blocked"
    assert phase1_row.payload["blocked_reason"] == "capability_denied"


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
