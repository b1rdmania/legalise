"""Phase 1 state machine primitive — runtime + registry tests.

Covers the five canonical scenarios from the HANDOVER_PHASE_1_START
acceptance bar:

1. Valid path — register definition, create instance, transition through
   states, assert state updates + transition rows + audit emission.
2. Denied capability — transition without holding required capability,
   assert state unchanged + blocked row + dual audit.
3. Invalid transition — transition not declared in definition, assert
   state unchanged + blocked row + audit.
4. Gate-blocked transition — gate handler raises Phase1Blocked, assert
   state unchanged + blocked row + audit with gate_state.
5. Audit emission on every path.

Plus registry validation tests.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.capabilities import grant
from app.core.phase1_runtime import (
    BlockedPayload,
    BlockedReason,
    Phase1Blocked,
    Phase1Failed,
)
from app.core.state_machine import (
    DefinitionNotFoundError,
    InvalidDefinitionError,
    create_instance,
    list_definitions,
    load_definition,
    read_history,
    read_instance,
    register_definition,
    register_gate,
    request_transition,
)
from app.core.state_machine.runtime import unregister_gate
from app.models import (
    AuditEntry,
    StateMachineDefinition,
    StateMachineInstance,
    StateMachineTransition,
    TRANSITION_STATUS_BLOCKED,
    TRANSITION_STATUS_COMPLETED,
    User,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"sm-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _register_intake_definition(db_session, *, version: str = "1.0.0") -> StateMachineDefinition:
    """Register a sample intake-style definition used by multiple tests."""
    return await register_definition(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version=version,
        states=[
            "prospect",
            "conflict_check",
            "scope_check",
            "client_verified",
            "matter_opened",
            "declined",
        ],
        initial_state="prospect",
        terminal_states=["matter_opened", "declined"],
        transitions=[
            {"from": "prospect", "to": "conflict_check"},
            {"from": "conflict_check", "to": "scope_check"},
            {"from": "scope_check", "to": "client_verified"},
            {
                "from": "client_verified",
                "to": "matter_opened",
                "required_capabilities": ["workspace.intake.matter_opened.write"],
            },
            {"from": "prospect", "to": "declined"},
        ],
    )


# ---------------------------------------------------------------------------
# Registry — pure / structural tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_definition_validates_states(db_session) -> None:
    with pytest.raises(InvalidDefinitionError, match="non-empty"):
        await register_definition(
            db_session,
            module_id="m",
            definition_key="k",
            version="1.0.0",
            states=[],
            initial_state="x",
        )


@pytest.mark.asyncio
async def test_register_definition_rejects_initial_state_not_in_states(
    db_session,
) -> None:
    with pytest.raises(InvalidDefinitionError, match="initial_state"):
        await register_definition(
            db_session,
            module_id="m",
            definition_key="k",
            version="1.0.0",
            states=["a", "b"],
            initial_state="c",
        )


@pytest.mark.asyncio
async def test_register_definition_rejects_transition_with_unknown_state(
    db_session,
) -> None:
    with pytest.raises(InvalidDefinitionError, match="not in `states`"):
        await register_definition(
            db_session,
            module_id="m",
            definition_key="k",
            version="1.0.0",
            states=["a", "b"],
            initial_state="a",
            transitions=[{"from": "a", "to": "z"}],
        )


@pytest.mark.asyncio
async def test_register_definition_rejects_transition_from_terminal(
    db_session,
) -> None:
    with pytest.raises(InvalidDefinitionError, match="terminal"):
        await register_definition(
            db_session,
            module_id="m",
            definition_key="k",
            version="1.0.0",
            states=["a", "b"],
            initial_state="a",
            terminal_states=["b"],
            transitions=[{"from": "b", "to": "a"}],
        )


@pytest.mark.asyncio
async def test_register_definition_is_idempotent_on_triple(db_session) -> None:
    d1 = await _register_intake_definition(db_session)
    d2 = await _register_intake_definition(db_session)
    assert d1.id == d2.id


@pytest.mark.asyncio
async def test_load_definition_by_id(db_session) -> None:
    d = await _register_intake_definition(db_session)
    got = await load_definition(db_session, definition_id=d.id)
    assert got.id == d.id


@pytest.mark.asyncio
async def test_load_definition_by_tuple(db_session) -> None:
    d = await _register_intake_definition(db_session)
    got = await load_definition(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
    )
    assert got.id == d.id


@pytest.mark.asyncio
async def test_load_definition_not_found(db_session) -> None:
    with pytest.raises(DefinitionNotFoundError):
        await load_definition(db_session, definition_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_list_definitions_filters(db_session) -> None:
    await _register_intake_definition(db_session, version="1.0.0")
    await _register_intake_definition(db_session, version="1.1.0")
    rows = await list_definitions(db_session, module_id="legalise-intake")
    assert len(rows) == 2


# ---------------------------------------------------------------------------
# Canonical scenario 1: valid path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_valid_path(db_session, db_connection) -> None:
    """Register definition → create instance → run two transitions →
    verify state updates, transition rows, audit rows."""
    user = await _make_user(db_session)
    await _register_intake_definition(db_session)

    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    assert instance.current_state == "prospect"

    # First transition: prospect -> conflict_check (no caps required).
    transition_row, updated = await request_transition(
        db_session,
        instance_id=instance.id,
        to_state="conflict_check",
        user_id=user.id,
    )
    assert transition_row.status == TRANSITION_STATUS_COMPLETED
    assert updated.current_state == "conflict_check"

    # Second transition.
    _, updated = await request_transition(
        db_session,
        instance_id=instance.id,
        to_state="scope_check",
        user_id=user.id,
    )
    assert updated.current_state == "scope_check"

    # History: two completed rows.
    history = await read_history(db_session, instance_id=instance.id)
    assert len(history) == 2
    assert all(r.status == TRANSITION_STATUS_COMPLETED for r in history)

    # Audit: one instance.created + two transition.completed.
    created_rows = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "state_machine.instance.created",
                AuditEntry.resource_id == str(instance.id),
            )
        )
    ).all()
    assert len(created_rows) == 1

    completed_rows = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "state_machine.transition.completed",
            )
        )
    ).all()
    assert len(completed_rows) == 2
    for row in completed_rows:
        assert row.module == "core.state_machine"
        assert "instance_id" in row.payload
        assert "from_state" in row.payload
        assert "to_state" in row.payload


# ---------------------------------------------------------------------------
# Canonical scenario 2: denied capability
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_denied_capability(
    db_session, db_connection, monkeypatch
) -> None:
    """Transition requiring a capability the user does NOT hold.
    Expect: state unchanged + blocked transition row +
    dual audit rows (legacy module.capability.denied + Phase 1
    state_machine.transition.blocked).

    Round-4 Reviewer fix: ``audit_failure`` is patched to write via
    the request session instead of a fresh pool connection. The
    production path commits independently; in the conftest SAVEPOINT
    pattern that independent commit cannot see the test's uncommitted
    user and FK-violates. Mirrors the existing codebase pattern from
    ``test_provider_audit_completeness.py``.
    """
    # Mock audit_failure to write via the request session.
    async def _fake_audit_failure(request_session, action, **kwargs):
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

    user = await _make_user(db_session)
    await _register_intake_definition(db_session)
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    # Walk to client_verified (no caps required up to that point).
    for next_state in ("conflict_check", "scope_check", "client_verified"):
        await request_transition(
            db_session, instance_id=instance.id, to_state=next_state, user_id=user.id
        )
    # Do NOT grant workspace.intake.matter_opened.write.
    with pytest.raises(Phase1Blocked) as exc_info:
        await request_transition(
            db_session,
            instance_id=instance.id,
            to_state="matter_opened",
            user_id=user.id,
        )
    err = exc_info.value
    assert err.payload.blocked_reason == BlockedReason.CAPABILITY_DENIED
    assert err.payload.denied_capability == "workspace.intake.matter_opened.write"

    # Verify the instance.current_state did NOT advance.
    refreshed = await db_session.scalar(
        select(StateMachineInstance).where(StateMachineInstance.id == instance.id)
    )
    assert refreshed.current_state == "client_verified"

    # Verify a blocked transition row was appended.
    blocked_rows = (
        await db_session.scalars(
            select(StateMachineTransition).where(
                StateMachineTransition.instance_id == instance.id,
                StateMachineTransition.status == TRANSITION_STATUS_BLOCKED,
            )
        )
    ).all()
    assert len(blocked_rows) == 1
    assert blocked_rows[0].gate_state["blocked_reason"] == "capability_denied"
    assert blocked_rows[0].capability_id == "workspace.intake.matter_opened.write"

    # Both audit rows must exist. The Phase 1 row was written via
    # audit_failure (independent session) — query on a separate session.
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
        assert legacy_row is not None

        phase1_row = await verify_session.scalar(
            select(AuditEntry).where(
                AuditEntry.actor_id == user.id,
                AuditEntry.action == "state_machine.transition.blocked",
            )
        )
        assert phase1_row is not None
        assert phase1_row.payload["blocked_reason"] == "capability_denied"
        assert (
            phase1_row.payload["denied_capability"]
            == "workspace.intake.matter_opened.write"
        )


# ---------------------------------------------------------------------------
# Canonical scenario 3: invalid transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_invalid_transition(db_session) -> None:
    """Transition not in the definition's allowed set. Expect: state
    unchanged + blocked row with INVALID_TRANSITION + blocked audit."""
    user = await _make_user(db_session)
    await _register_intake_definition(db_session)
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    # Attempt prospect -> matter_opened directly (skip all intermediate states).
    with pytest.raises(Phase1Blocked) as exc_info:
        await request_transition(
            db_session,
            instance_id=instance.id,
            to_state="matter_opened",
            user_id=user.id,
        )
    err = exc_info.value
    assert err.payload.blocked_reason == BlockedReason.INVALID_TRANSITION

    # State unchanged.
    refreshed = await db_session.scalar(
        select(StateMachineInstance).where(StateMachineInstance.id == instance.id)
    )
    assert refreshed.current_state == "prospect"

    # Blocked row written.
    blocked_row = await db_session.scalar(
        select(StateMachineTransition).where(
            StateMachineTransition.instance_id == instance.id,
            StateMachineTransition.status == TRANSITION_STATUS_BLOCKED,
        )
    )
    assert blocked_row is not None
    assert blocked_row.gate_state["blocked_reason"] == "invalid_transition"

    # Audit row written.
    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "state_machine.transition.blocked",
            AuditEntry.resource_id == str(blocked_row.id),
        )
    )
    assert audit_row is not None


# ---------------------------------------------------------------------------
# Canonical scenario 4: gate-blocked transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_gate_blocked_transition(db_session) -> None:
    """Gate handler raises Phase1Blocked. Expect: state unchanged +
    blocked row + audit with gate_state."""
    user = await _make_user(db_session)

    # Register a test gate that always blocks with a specific payload.
    async def _test_gate(session, instance, transition_def, request_context):
        raise Phase1Blocked(
            BlockedPayload(
                blocked_reason=BlockedReason.GATE_BLOCKED,
                gate_state={"gate": "test_gate", "reason": "always blocks for test"},
            )
        )

    register_gate("test_gate", _test_gate)
    try:
        # Register a definition that uses the test gate.
        await register_definition(
            db_session,
            module_id="test-gate-module",
            definition_key="default",
            version="1.0.0",
            states=["start", "end"],
            initial_state="start",
            transitions=[
                {"from": "start", "to": "end", "gates": ["test_gate"]},
            ],
        )
        instance = await create_instance(
            db_session,
            module_id="test-gate-module",
            definition_key="default",
            version="1.0.0",
            owner_scope="workspace",
            owner_id=str(user.id),
            actor_id=user.id,
        )
        with pytest.raises(Phase1Blocked) as exc_info:
            await request_transition(
                db_session,
                instance_id=instance.id,
                to_state="end",
                user_id=user.id,
            )
        err = exc_info.value
        assert err.payload.blocked_reason == BlockedReason.GATE_BLOCKED
        assert err.payload.gate_state["gate"] == "test_gate"

        refreshed = await db_session.scalar(
            select(StateMachineInstance).where(StateMachineInstance.id == instance.id)
        )
        assert refreshed.current_state == "start"

        blocked_row = await db_session.scalar(
            select(StateMachineTransition).where(
                StateMachineTransition.instance_id == instance.id,
                StateMachineTransition.status == TRANSITION_STATUS_BLOCKED,
            )
        )
        assert blocked_row is not None
        assert blocked_row.gate_state["blocked_reason"] == "gate_blocked"

        audit_row = await db_session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "state_machine.transition.blocked",
                AuditEntry.resource_id == str(blocked_row.id),
            )
        )
        assert audit_row is not None
        assert audit_row.payload["gate_state"]["gate"] == "test_gate"
    finally:
        unregister_gate("test_gate")


@pytest.mark.asyncio
async def test_unknown_gate_fails_closed(db_session) -> None:
    """A definition that references an un-registered gate id must block
    (fail closed), not silently allow the transition."""
    user = await _make_user(db_session)
    await register_definition(
        db_session,
        module_id="ghost-gate-module",
        definition_key="default",
        version="1.0.0",
        states=["a", "b"],
        initial_state="a",
        transitions=[
            {"from": "a", "to": "b", "gates": ["never_registered"]},
        ],
    )
    instance = await create_instance(
        db_session,
        module_id="ghost-gate-module",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    with pytest.raises(Phase1Blocked) as exc_info:
        await request_transition(
            db_session,
            instance_id=instance.id,
            to_state="b",
            user_id=user.id,
        )
    assert exc_info.value.payload.blocked_reason == BlockedReason.GATE_BLOCKED
    assert exc_info.value.payload.gate_state["error"] == "gate_not_registered"


# ---------------------------------------------------------------------------
# Granted capability allows the transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_granted_capability_allows_transition(db_session) -> None:
    """When the user holds the required capability, the transition
    succeeds and state updates."""
    user = await _make_user(db_session)
    await _register_intake_definition(db_session)
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    # Walk to client_verified.
    for next_state in ("conflict_check", "scope_check", "client_verified"):
        await request_transition(
            db_session, instance_id=instance.id, to_state=next_state, user_id=user.id
        )
    # Grant the gating capability under the plugin="core" convention
    # (architectural decision #1 — substrate uses plugin="core").
    # NOTE: this is the same capability string the runtime checks; the
    # plugin/skill tuple is the substrate convention.
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="state_machine",
        capability="workspace.intake.matter_opened.write",
    )
    await db_session.flush()

    _, updated = await request_transition(
        db_session,
        instance_id=instance.id,
        to_state="matter_opened",
        user_id=user.id,
    )
    assert updated.current_state == "matter_opened"


# ---------------------------------------------------------------------------
# Read endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_instance_returns_available_transitions(db_session) -> None:
    user = await _make_user(db_session)
    await _register_intake_definition(db_session)
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    result = await read_instance(db_session, instance_id=instance.id)
    assert result["instance"].id == instance.id
    # From "prospect" we can go to conflict_check or declined.
    targets = {t["to"] for t in result["available_transitions"]}
    assert targets == {"conflict_check", "declined"}


@pytest.mark.asyncio
async def test_read_history_returns_newest_first(db_session) -> None:
    user = await _make_user(db_session)
    await _register_intake_definition(db_session)
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    await request_transition(
        db_session, instance_id=instance.id, to_state="conflict_check", user_id=user.id
    )
    await request_transition(
        db_session, instance_id=instance.id, to_state="scope_check", user_id=user.id
    )
    history = await read_history(db_session, instance_id=instance.id)
    assert len(history) == 2
    # Newest first.
    assert history[0].to_state == "scope_check"
    assert history[1].to_state == "conflict_check"


# ---------------------------------------------------------------------------
# WORM enforcement smoke test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_row_cannot_be_updated(db_session) -> None:
    """The WORM trigger on state_machine_transitions blocks UPDATE."""
    user = await _make_user(db_session)
    await _register_intake_definition(db_session)
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="default",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )
    transition_row, _ = await request_transition(
        db_session, instance_id=instance.id, to_state="conflict_check", user_id=user.id
    )
    await db_session.commit()

    # Now try to mutate the row via raw SQL.
    from sqlalchemy import text

    with pytest.raises(Exception, match="append-only"):
        await db_session.execute(
            text(
                "UPDATE state_machine_transitions SET status='completed' "
                "WHERE id = :id"
            ),
            {"id": str(transition_row.id)},
        )
        await db_session.commit()
