"""Server-side reconstruction filters.

Pins `invocation_id` and `action` query params on
`GET /api/matters/{slug}/audit/reconstruction`. The load-bearing
invariant is **filters apply BEFORE pagination**: a target row at the
tail of a dense non-matching window must enter the first page response,
not require the caller to chase `next_cursor` through irrelevant prefix
rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import select

from app.core.audit_reconstruction import (
    DEFAULT_LIMIT,
    reconstruct,
)
from app.models import (
    AdviceBoundaryDecision,
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    StateMachineDefinition,
    StateMachineInstance,
    StateMachineTransition,
    User,
)


# ---------------------------------------------------------------------------
# Local fixture helpers (parallel to test_phase5_audit_reconstruction.py)
# ---------------------------------------------------------------------------


async def _make_user(db_session, *, superuser: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p145a-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=superuser,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"p145a-{uuid.uuid4().hex[:8]}",
        title="Phase 14.5 A regression",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


def _ts(seconds_from_epoch: int) -> datetime:
    return datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=seconds_from_epoch)


async def _insert_audit(
    db_session,
    matter_id: uuid.UUID,
    *,
    action: str,
    seconds: int,
    payload: dict | None = None,
) -> AuditEntry:
    row = AuditEntry(
        id=uuid.uuid4(),
        timestamp=_ts(seconds),
        actor_id=None,
        matter_id=matter_id,
        action=action,
        module="test",
        resource_type="matter",
        resource_id=str(matter_id),
        payload=payload or {},
    )
    db_session.add(row)
    return row


# ---------------------------------------------------------------------------
# P1 — load-bearing: filter applies BEFORE pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invocation_id_filter_returns_target_on_page_one_through_dense_noise(
    db_session,
):
    """The original UX hole this phase closes.

    Insert N > DEFAULT_LIMIT non-matching rows ordered FIRST by
    occurred_at, then exactly ONE matching row at the tail. Request
    with `?invocation_id=<target>` and the default page limit MUST
    return that one row on page one. If the substrate is filtering
    after slicing, the target row gets paginated past and the
    response is empty — that's the regression this test catches.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    target_inv = str(uuid.uuid4())

    # 250 rows > DEFAULT_LIMIT (200), all with a different invocation_id.
    for i in range(250):
        await _insert_audit(
            db_session,
            matter.id,
            action="model.call",
            seconds=i,
            payload={"invocation_id": str(uuid.uuid4())},
        )
    # One matching row at the tail.
    await _insert_audit(
        db_session,
        matter.id,
        action="model.call",
        seconds=10_000,
        payload={"invocation_id": target_inv},
    )
    await db_session.flush()

    page = await reconstruct(
        session=db_session,
        matter_id=matter.id,
        invocation_id=target_inv,
        limit=DEFAULT_LIMIT,
    )

    # MUST return the one match on page one.
    assert len(page.entries) == 1, (
        f"expected 1 matching row in first-page response, got "
        f"{len(page.entries)}; filter-before-pagination contract broken"
    )
    assert page.entries[0].payload.get("invocation_id") == target_inv
    # No more pages — only one row matches.
    assert page.next_cursor is None


# ---------------------------------------------------------------------------
# invocation_id filter mechanics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invocation_id_filter_no_filter_returns_all(db_session):
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    for i in range(3):
        await _insert_audit(
            db_session,
            matter.id,
            action="x",
            seconds=i,
            payload={"invocation_id": str(uuid.uuid4())},
        )
    await db_session.flush()
    page = await reconstruct(session=db_session, matter_id=matter.id)
    assert len(page.entries) == 3


@pytest.mark.asyncio
async def test_invocation_id_filter_match_only(db_session):
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    target = str(uuid.uuid4())
    await _insert_audit(
        db_session, matter.id, action="x", seconds=1,
        payload={"invocation_id": target},
    )
    await _insert_audit(
        db_session, matter.id, action="x", seconds=2,
        payload={"invocation_id": str(uuid.uuid4())},
    )
    await db_session.flush()
    page = await reconstruct(
        session=db_session, matter_id=matter.id, invocation_id=target,
    )
    assert len(page.entries) == 1
    assert page.entries[0].payload["invocation_id"] == target


@pytest.mark.asyncio
async def test_invocation_id_filter_state_machine_returns_empty(db_session):
    """State machine transitions don't carry invocation_id as a
    deterministic column. The plan's source-semantics lock: this
    source returns empty under the filter.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    # Create a state machine instance + transition on this matter.
    definition = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id="test",
        definition_key=f"def-{uuid.uuid4().hex[:6]}",
        version="1.0",
        states=["a", "b"],
        initial_state="a",
        terminal_states=["b"],
        transitions=[{"from": "a", "to": "b"}],
    )
    db_session.add(definition)
    await db_session.flush()
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=definition.id,
        definition_version="1.0",
        owner_scope="matter",
        owner_id=str(matter.id),
        current_state="b",
    )
    db_session.add(instance)
    await db_session.flush()
    transition = StateMachineTransition(
        id=uuid.uuid4(),
        instance_id=instance.id,
        from_state="a",
        to_state="b",
        status="completed",
        occurred_at=_ts(1),
        actor_id=None,
        reason=None,
        extra_metadata={},
        gate_state={},
    )
    db_session.add(transition)
    await db_session.flush()

    # Without filter — state_machine row appears.
    no_filter = await reconstruct(
        session=db_session, matter_id=matter.id,
        sources=frozenset({"state_machine"}),
    )
    assert len(no_filter.entries) == 1
    # With invocation_id filter — empty.
    with_filter = await reconstruct(
        session=db_session, matter_id=matter.id,
        sources=frozenset({"state_machine"}),
        invocation_id=str(uuid.uuid4()),
    )
    assert with_filter.entries == []


@pytest.mark.asyncio
async def test_invocation_id_filter_advice_boundary_uses_output_id(db_session):
    """AdviceBoundaryDecision.output_id is the substrate's
    invocation_id carrier (Phase 9 convention). Filter must match
    against that column.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    target_inv = str(uuid.uuid4())
    other_inv = str(uuid.uuid4())

    def _abd(output_id: str, seconds: int) -> AdviceBoundaryDecision:
        return AdviceBoundaryDecision(
            id=uuid.uuid4(),
            decided_at=_ts(seconds),
            output_id=output_id,
            status="completed",
            from_tier="factual_extraction",
            to_tier="draft_advice",
            declared_tier_max="draft_advice",
            actor_user_id=None,
            actor_role=None,
            module_id="test",
            capability_id="test",
            gate_state={"matter_id": str(matter.id)},
        )

    db_session.add(_abd(target_inv, 1))
    db_session.add(_abd(other_inv, 2))
    await db_session.flush()

    page = await reconstruct(
        session=db_session, matter_id=matter.id,
        sources=frozenset({"advice_boundary"}),
        invocation_id=target_inv,
    )
    assert len(page.entries) == 1
    assert page.entries[0].payload["output_id"] == target_inv


# ---------------------------------------------------------------------------
# action filter mechanics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_action_filter_audit_exact_match(db_session):
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    await _insert_audit(db_session, matter.id, action="model.call", seconds=1)
    await _insert_audit(db_session, matter.id, action="model.invoked", seconds=2)
    await _insert_audit(db_session, matter.id, action="document.upload", seconds=3)
    await db_session.flush()

    page = await reconstruct(
        session=db_session, matter_id=matter.id, action="model.call",
    )
    assert len(page.entries) == 1
    assert page.entries[0].action == "model.call"


@pytest.mark.asyncio
async def test_action_filter_state_machine_status_pushdown(db_session):
    """`action=state_machine.transition.completed` → SQL filter on
    StateMachineTransition.status = "completed".
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    definition = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id="test",
        definition_key=f"def-{uuid.uuid4().hex[:6]}",
        version="1.0",
        states=["a", "b", "c"],
        initial_state="a",
        terminal_states=["c"],
        transitions=[],
    )
    db_session.add(definition)
    await db_session.flush()
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=definition.id,
        definition_version="1.0",
        owner_scope="matter",
        owner_id=str(matter.id),
        current_state="c",
    )
    db_session.add(instance)
    await db_session.flush()
    db_session.add(StateMachineTransition(
        id=uuid.uuid4(), instance_id=instance.id,
        from_state="a", to_state="b", status="completed",
        occurred_at=_ts(1), gate_state={},
    ))
    db_session.add(StateMachineTransition(
        id=uuid.uuid4(), instance_id=instance.id,
        from_state="b", to_state="c", status="rejected",
        occurred_at=_ts(2), gate_state={},
    ))
    await db_session.flush()

    page = await reconstruct(
        session=db_session, matter_id=matter.id,
        sources=frozenset({"state_machine"}),
        action="state_machine.transition.completed",
    )
    assert len(page.entries) == 1
    assert page.entries[0].payload["status"] == "completed"


@pytest.mark.asyncio
async def test_action_filter_no_prefix_match_returns_empty_for_synthesised_sources(
    db_session,
):
    """`action=model.call` only matches audit rows. State machine
    and advice boundary sources return empty cleanly.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    page = await reconstruct(
        session=db_session, matter_id=matter.id,
        sources=frozenset({"state_machine", "advice_boundary"}),
        action="model.call",
    )
    assert page.entries == []


# ---------------------------------------------------------------------------
# Composition: filters AND together with each other + existing params
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filters_compose_AND(db_session):
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    target_inv = str(uuid.uuid4())
    # Two rows with the target invocation_id but different actions.
    await _insert_audit(
        db_session, matter.id, action="model.call", seconds=1,
        payload={"invocation_id": target_inv},
    )
    await _insert_audit(
        db_session, matter.id, action="module.capability.invoked", seconds=2,
        payload={"invocation_id": target_inv},
    )
    # And a row with the wrong invocation_id but matching action.
    await _insert_audit(
        db_session, matter.id, action="model.call", seconds=3,
        payload={"invocation_id": str(uuid.uuid4())},
    )
    await db_session.flush()

    page = await reconstruct(
        session=db_session, matter_id=matter.id,
        invocation_id=target_inv, action="model.call",
    )
    assert len(page.entries) == 1
    row = page.entries[0]
    assert row.action == "model.call"
    assert row.payload["invocation_id"] == target_inv


# ---------------------------------------------------------------------------
# Endpoint surface — invalid invocation_id → 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_endpoint_invalid_invocation_id_422(client, db_session):
    """The endpoint validates invocation_id as a UUID before calling
    into the substrate. Junk strings get a structured 422, not a
    database cast error.
    """
    # Register a user + matter via the test client's normal flow.
    email = f"p145a-{uuid.uuid4().hex[:8]}@example.com"
    pw = "p145a-pwd-2026"
    await client.post("/auth/register", json={"email": email, "password": pw})
    await client.post(
        "/auth/login",
        data={"username": email, "password": pw},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    # Find that user's auto-seeded Khan matter.
    matter = await db_session.scalar(
        select(Matter).where(Matter.created_by_id == (
            await db_session.scalar(select(User.id).where(User.email == email))
        ))
    )
    assert matter is not None, "auto-seed should have created Khan for this user"

    resp = await client.get(
        f"/api/matters/{matter.slug}/audit/reconstruction"
        f"?invocation_id=not-a-uuid"
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["error"] == "invalid_invocation_id"
    assert body["detail"]["supplied"] == "not-a-uuid"


# ---------------------------------------------------------------------------
# Audit emission shape — unified payload across matter + workspace
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_endpoint_emits_unified_payload_shape(client, db_session):
    """The endpoint's `audit.reconstruction.viewed` row carries the
    Phase 14.5 A-locked payload shape: scope + matter_id + filters.
    Phase 14.5 C will use the same shape with scope='workspace'.
    """
    email = f"p145a-emit-{uuid.uuid4().hex[:8]}@example.com"
    pw = "p145a-pwd-2026"
    await client.post("/auth/register", json={"email": email, "password": pw})
    await client.post(
        "/auth/login",
        data={"username": email, "password": pw},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    matter = await db_session.scalar(
        select(Matter).where(Matter.created_by_id == (
            await db_session.scalar(select(User.id).where(User.email == email))
        ))
    )
    inv = str(uuid.uuid4())
    resp = await client.get(
        f"/api/matters/{matter.slug}/audit/reconstruction"
        f"?invocation_id={inv}&action=model.call"
    )
    assert resp.status_code == 200

    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "audit.reconstruction.viewed",
            AuditEntry.matter_id == matter.id,
        ).order_by(AuditEntry.timestamp.desc()).limit(1)
    )
    assert row is not None
    payload = row.payload or {}
    assert payload["scope"] == "matter"
    assert payload["matter_id"] == str(matter.id)
    filters = payload["filters"]
    assert filters["invocation_id"] == inv
    assert filters["action"] == "model.call"
    assert filters["since"] is None
    assert filters["until"] is None
    assert set(filters["sources"]) == {"audit", "state_machine", "advice_boundary"}


# ---------------------------------------------------------------------------
# Backwards compatibility — no filters means existing behaviour
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_filters_is_backwards_compatible(db_session):
    """Sanity check: the function signature added optional kwargs;
    calls that omit them must behave exactly as before."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    for i in range(5):
        await _insert_audit(db_session, matter.id, action=f"a-{i}", seconds=i)
    await db_session.flush()

    page = await reconstruct(session=db_session, matter_id=matter.id)
    assert len(page.entries) == 5
