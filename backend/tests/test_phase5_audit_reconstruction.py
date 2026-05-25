"""Phase 5 Step 4 + Step 5 — audit reconstruction core + API."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import select

from app.core.audit_cost import audit_emit_model_invoked
from app.core.audit_reconstruction import (
    SOURCE_ORDER,
    VALID_SOURCES,
    decode_cursor,
    encode_cursor,
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


async def _make_user(db_session, *, superuser: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p5-recon-{uuid.uuid4().hex[:8]}@example.com",
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
        slug=f"recon-{uuid.uuid4().hex[:8]}",
        title="Reconstruction Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


async def _emit_audit(db_session, *, matter, user, action: str) -> AuditEntry:
    row = AuditEntry(
        id=uuid.uuid4(),
        actor_id=user.id,
        matter_id=matter.id,
        action=action,
        module="test",
        payload={},
    )
    db_session.add(row)
    await db_session.flush()
    return row


# -------------------- cursor round-trip --------------------


def test_cursor_encode_decode_round_trip() -> None:
    from app.core.audit_reconstruction import TimelineEntry

    entry = TimelineEntry(
        source="audit",
        occurred_at=datetime(2026, 5, 26, 10, 0, 0, tzinfo=UTC),
        action="x.y.z",
        source_row_id=str(uuid.uuid4()),
    )
    cursor = encode_cursor(entry)
    decoded = decode_cursor(cursor)
    assert decoded["source"] == "audit"
    assert decoded["source_row_id"] == entry.source_row_id
    assert decoded["occurred_at"] == entry.occurred_at


def test_source_order_is_canonical() -> None:
    assert SOURCE_ORDER == {"audit": 0, "state_machine": 1, "advice_boundary": 2}
    assert set(VALID_SOURCES) == {"audit", "state_machine", "advice_boundary"}


# -------------------- single-source core --------------------


@pytest.mark.asyncio
async def test_reconstruct_returns_audit_rows_for_matter(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    await _emit_audit(db_session, matter=matter, user=user, action="a.one")
    await _emit_audit(db_session, matter=matter, user=user, action="a.two")
    await db_session.commit()

    page = await reconstruct(db_session, matter_id=matter.id)
    actions = [e.action for e in page.entries]
    assert "a.one" in actions
    assert "a.two" in actions
    assert all(e.source == "audit" for e in page.entries)
    assert all(e.matter_id == str(matter.id) for e in page.entries)


@pytest.mark.asyncio
async def test_reconstruct_filters_by_matter(db_session) -> None:
    """Audit rows from a different matter must NOT appear."""
    user = await _make_user(db_session)
    matter_a = await _make_matter(db_session, user)
    matter_b = await _make_matter(db_session, user)
    await _emit_audit(db_session, matter=matter_a, user=user, action="a.only")
    await _emit_audit(db_session, matter=matter_b, user=user, action="b.only")
    await db_session.commit()

    page = await reconstruct(db_session, matter_id=matter_a.id)
    actions = {e.action for e in page.entries}
    assert "a.only" in actions
    assert "b.only" not in actions


@pytest.mark.asyncio
async def test_reconstruct_time_window(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    await _emit_audit(db_session, matter=matter, user=user, action="window.test")
    await db_session.commit()

    # Future window — should be empty.
    future = datetime.now(UTC) + timedelta(days=1)
    page = await reconstruct(
        db_session,
        matter_id=matter.id,
        since=future,
    )
    assert page.entries == []


@pytest.mark.asyncio
async def test_reconstruct_source_filter(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    await _emit_audit(db_session, matter=matter, user=user, action="audit.only")
    await db_session.commit()

    # Ask for only state_machine — audit row should NOT appear.
    page = await reconstruct(
        db_session,
        matter_id=matter.id,
        sources={"state_machine"},
    )
    assert all(e.source == "state_machine" for e in page.entries)


@pytest.mark.asyncio
async def test_reconstruct_rejects_unknown_source(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    with pytest.raises(ValueError, match="unknown sources"):
        await reconstruct(
            db_session,
            matter_id=matter.id,
            sources={"banana"},
        )


@pytest.mark.asyncio
async def test_reconstruct_rejects_bad_limit(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    with pytest.raises(ValueError):
        await reconstruct(db_session, matter_id=matter.id, limit=0)
    with pytest.raises(ValueError):
        await reconstruct(db_session, matter_id=matter.id, limit=10_000)


# -------------------- multi-source merge --------------------


@pytest.mark.asyncio
async def test_reconstruct_merges_three_sources_in_order(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    # 1. Audit row.
    await _emit_audit(db_session, matter=matter, user=user, action="alpha")

    # 2. State machine definition + instance + transition.
    sm_def = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id="test",
        definition_key="testflow",
        version="1.0.0",
        states=["a", "b"],
        initial_state="a",
        terminal_states=[],
        transitions=[],
    )
    db_session.add(sm_def)
    await db_session.flush()
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=sm_def.id,
        definition_version="1.0.0",
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
        actor_id=user.id,
        status="completed",
        extra_metadata={},
        gate_state={},
    )
    db_session.add(transition)

    # 3. Advice-boundary decision scoped to matter via gate_state.
    abd = AdviceBoundaryDecision(
        id=uuid.uuid4(),
        output_id="out-1",
        from_tier=None,
        to_tier="draft_advice",
        actor_user_id=user.id,
        gate_state={"matter_id": str(matter.id)},
        status="approved",
    )
    db_session.add(abd)
    await db_session.commit()

    page = await reconstruct(db_session, matter_id=matter.id)
    sources = [e.source for e in page.entries]
    assert "audit" in sources
    assert "state_machine" in sources
    assert "advice_boundary" in sources
    # Order: timestamps ascending; ties broken by SOURCE_ORDER.
    for prev, nxt in zip(page.entries, page.entries[1:]):
        assert (prev.occurred_at, SOURCE_ORDER[prev.source]) <= (
            nxt.occurred_at,
            SOURCE_ORDER[nxt.source],
        )


@pytest.mark.asyncio
async def test_reconstruct_pagination_cursor(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    for i in range(5):
        await _emit_audit(db_session, matter=matter, user=user, action=f"page.{i}")
    await db_session.commit()

    # Page 1 — limit 2.
    page1 = await reconstruct(db_session, matter_id=matter.id, limit=2)
    assert len(page1.entries) == 2
    assert page1.next_cursor is not None

    # Page 2.
    page2 = await reconstruct(
        db_session, matter_id=matter.id, limit=2, cursor=page1.next_cursor
    )
    assert len(page2.entries) == 2
    # No overlap.
    page1_ids = {e.source_row_id for e in page1.entries}
    page2_ids = {e.source_row_id for e in page2.entries}
    assert page1_ids & page2_ids == set()


# -------------------- API authorisation --------------------


@pytest.mark.asyncio
async def test_api_strict_matter_access_owner_passes(client) -> None:
    email = f"p5-api-owner-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase5-recon-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"owner-{uuid.uuid4().hex[:8]}",
            title="Owner Matter",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.commit()
        slug = matter.slug

    resp = await client.get(f"/api/matters/{slug}/audit/reconstruction")
    assert resp.status_code == 200
    body = resp.json()
    assert "entries" in body
    assert "next_cursor" in body


@pytest.mark.asyncio
async def test_api_strict_matter_access_non_owner_404s(client) -> None:
    """A user who is NOT the owner and NOT superuser gets a 404 — same
    response cross-user to avoid leaking which matters exist."""
    # Owner creates the matter.
    owner_email = f"p5-owner-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase5-recon-2026"
    await client.post(
        "/auth/register", json={"email": owner_email, "password": password}
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"private-{uuid.uuid4().hex[:8]}",
            title="Owner Only",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(matter)
        await session.commit()
        slug = matter.slug

    # Stranger logs in.
    stranger_email = f"p5-stranger-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/auth/register", json={"email": stranger_email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": stranger_email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    resp = await client.get(f"/api/matters/{slug}/audit/reconstruction")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_api_emits_audit_reconstruction_viewed(client) -> None:
    """Every successful view writes audit.reconstruction.viewed."""
    email = f"p5-viewed-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase5-recon-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"viewed-{uuid.uuid4().hex[:8]}",
            title="Viewed Matter",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.commit()
        slug = matter.slug
        matter_id = matter.id

    resp = await client.get(f"/api/matters/{slug}/audit/reconstruction")
    assert resp.status_code == 200

    async with factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "audit.reconstruction.viewed",
                AuditEntry.matter_id == matter_id,
            )
        )
        assert row is not None
        assert row.payload["returned"] == len(resp.json()["entries"])


@pytest.mark.asyncio
async def test_api_rejects_unknown_source_with_422(client) -> None:
    email = f"p5-src-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase5-recon-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"src-{uuid.uuid4().hex[:8]}",
            title="x",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.commit()
        slug = matter.slug

    resp = await client.get(
        f"/api/matters/{slug}/audit/reconstruction?include=banana,audit"
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "unknown_source"
    assert "banana" in resp.json()["detail"]["unknown"]
