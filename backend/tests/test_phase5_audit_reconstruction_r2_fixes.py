"""Phase 5 R2 — reviewer-found fixes.

[P1] Pagination must not silently skip rows from non-cursor sources.
[P2] Malformed cursors must return 422, not 500.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import select

from app.core.audit_reconstruction import decode_cursor, reconstruct
from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    StateMachineDefinition,
    StateMachineInstance,
    StateMachineTransition,
    User,
)


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p5-r2-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"r2-{uuid.uuid4().hex[:8]}",
        title="R2 Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


# -------------------- P1 — non-cursor source row preservation --------------------


@pytest.mark.asyncio
async def test_pagination_does_not_skip_non_cursor_source_rows(db_session) -> None:
    """Regression for Reviewer Phase 5 R2 P1.

    Setup: 30 state_machine rows ALL OLDER than 5 audit rows. With
    limit=3, the cursor lands on a state_machine row early on. The
    pre-fix bug: subsequent pages re-pulled audit from window start
    with LIMIT N — those audit rows came LATER in time than the
    cursor so they survived; but the bug shape is the inverse:
    non-cursor source has many rows AFTER the cursor that LIMIT N
    on each call would have already capped.

    The real load-bearing assertion is: after fully paginating, the
    UNION of all entries returned across all pages equals the full
    set of rows in the window. No row is silently dropped.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    # Definition + instance once.
    sm_def = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id="test",
        definition_key="r2flow",
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

    base = datetime.now(UTC) - timedelta(hours=2)

    # 30 state_machine transitions early in the window.
    sm_ids: set[str] = set()
    for i in range(30):
        t = StateMachineTransition(
            id=uuid.uuid4(),
            instance_id=instance.id,
            from_state="a",
            to_state="b",
            actor_id=user.id,
            status="completed",
            extra_metadata={},
            gate_state={},
            occurred_at=base + timedelta(seconds=i),
        )
        db_session.add(t)
        sm_ids.add(str(t.id))

    # 5 audit rows after every state_machine row.
    audit_ids: set[str] = set()
    for i in range(5):
        a = AuditEntry(
            id=uuid.uuid4(),
            actor_id=user.id,
            matter_id=matter.id,
            action=f"audit.{i}",
            module="test",
            payload={},
            timestamp=base + timedelta(seconds=100 + i),
        )
        db_session.add(a)
        audit_ids.add(str(a.id))
    await db_session.commit()

    # Paginate all the way through with limit=3.
    seen_sm: set[str] = set()
    seen_audit: set[str] = set()
    cursor: str | None = None
    pages = 0
    while True:
        pages += 1
        assert pages < 50, "runaway pagination — guard for hung test"
        page = await reconstruct(
            db_session,
            matter_id=matter.id,
            cursor=cursor,
            limit=3,
        )
        for e in page.entries:
            if e.source == "state_machine":
                seen_sm.add(e.source_row_id)
            elif e.source == "audit":
                seen_audit.add(e.source_row_id)
        if page.next_cursor is None:
            break
        cursor = page.next_cursor

    # The load-bearing assertion: zero rows silently dropped.
    missing_sm = sm_ids - seen_sm
    missing_audit = audit_ids - seen_audit
    assert not missing_sm, f"state_machine rows skipped: {sorted(missing_sm)[:5]}..."
    assert not missing_audit, f"audit rows skipped: {sorted(missing_audit)[:5]}..."


@pytest.mark.asyncio
async def test_cursor_filter_applies_to_all_sources(db_session) -> None:
    """When the cursor lands on source X, sources Y and Z must also
    apply the cursor key in SQL — not just re-query from the window
    start.

    Builds a window with audit rows interleaved with state_machine
    rows so that page-1's cursor lands on audit but later
    state_machine rows are AFTER the cursor. With the pre-fix bug,
    when the cursor was an audit row, state_machine's SQL had no
    cursor and re-pulled limit+1 from the window start — meaning if
    there were many older state_machine rows, the later ones could
    be missed.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    sm_def = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id="test",
        definition_key="r2cursor",
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

    base = datetime.now(UTC) - timedelta(hours=1)

    # 10 sm rows at t=0..9
    for i in range(10):
        t = StateMachineTransition(
            id=uuid.uuid4(),
            instance_id=instance.id,
            from_state="a",
            to_state="b",
            actor_id=user.id,
            status="completed",
            extra_metadata={},
            gate_state={},
            occurred_at=base + timedelta(seconds=i),
        )
        db_session.add(t)

    # Audit rows at t=5..14 (interleaving + going past the sm rows).
    for i in range(10):
        a = AuditEntry(
            id=uuid.uuid4(),
            actor_id=user.id,
            matter_id=matter.id,
            action=f"audit.{i}",
            module="test",
            payload={},
            timestamp=base + timedelta(seconds=5 + i),
        )
        db_session.add(a)
    await db_session.commit()

    # Page 1 with limit=2 — should be the two oldest sm rows.
    page1 = await reconstruct(db_session, matter_id=matter.id, limit=2)
    assert len(page1.entries) == 2
    assert page1.next_cursor is not None

    # Page 2 — cursor is an sm row. Verify audit rows >= cursor_ts
    # appear in subsequent pages.
    next_cursor = page1.next_cursor
    all_seen_audit: set[str] = set()
    all_seen_sm: set[str] = set()
    for e in page1.entries:
        (all_seen_audit if e.source == "audit" else all_seen_sm).add(
            e.source_row_id
        )
    pages = 1
    while next_cursor is not None:
        pages += 1
        assert pages < 30
        page = await reconstruct(
            db_session, matter_id=matter.id, limit=2, cursor=next_cursor
        )
        for e in page.entries:
            if e.source == "audit":
                all_seen_audit.add(e.source_row_id)
            elif e.source == "state_machine":
                all_seen_sm.add(e.source_row_id)
        next_cursor = page.next_cursor

    # All 10 sm + 10 audit rows must surface.
    assert len(all_seen_sm) == 10, (
        f"state_machine rows seen: {len(all_seen_sm)}/10 — non-cursor "
        f"source pagination is dropping rows"
    )
    assert len(all_seen_audit) == 10, (
        f"audit rows seen: {len(all_seen_audit)}/10 — non-cursor "
        f"source pagination is dropping rows"
    )


# -------------------- P2 — malformed cursor → 422 --------------------


def test_decode_cursor_rejects_non_base64() -> None:
    with pytest.raises(ValueError, match="base64"):
        decode_cursor("not a cursor!@#$%")


def test_decode_cursor_rejects_non_json_payload() -> None:
    import base64 as b64

    bad = b64.urlsafe_b64encode(b"not json").decode("ascii")
    with pytest.raises(ValueError, match="JSON"):
        decode_cursor(bad)


def test_decode_cursor_rejects_missing_keys() -> None:
    import base64 as b64
    import json

    bad = b64.urlsafe_b64encode(
        json.dumps({"source": "audit"}).encode()
    ).decode("ascii")
    with pytest.raises(ValueError, match="missing required key"):
        decode_cursor(bad)


def test_decode_cursor_rejects_bad_timestamp() -> None:
    import base64 as b64
    import json

    bad = b64.urlsafe_b64encode(
        json.dumps(
            {
                "source": "audit",
                "occurred_at": "not a date",
                "source_row_id": str(uuid.uuid4()),
            }
        ).encode()
    ).decode("ascii")
    with pytest.raises(ValueError, match="ISO-8601"):
        decode_cursor(bad)


def test_decode_cursor_rejects_non_uuid_row_id() -> None:
    import base64 as b64
    import json

    bad = b64.urlsafe_b64encode(
        json.dumps(
            {
                "source": "audit",
                "occurred_at": datetime.now(UTC).isoformat(),
                "source_row_id": "not-a-uuid",
            }
        ).encode()
    ).decode("ascii")
    with pytest.raises(ValueError, match="UUID"):
        decode_cursor(bad)


def test_decode_cursor_rejects_non_dict_payload() -> None:
    import base64 as b64
    import json

    bad = b64.urlsafe_b64encode(json.dumps([1, 2, 3]).encode()).decode("ascii")
    with pytest.raises(ValueError, match="object"):
        decode_cursor(bad)


@pytest.mark.asyncio
async def test_api_returns_422_on_malformed_cursor(client) -> None:
    """The API translates ValueError from decode_cursor to HTTP 422
    — never 500."""
    email = f"p5-r2-cursor-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase5-r2-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
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
            slug=f"r2-cursor-{uuid.uuid4().hex[:8]}",
            title="R2 cursor test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.commit()
        slug = matter.slug

    bad_cursors = [
        "garbage!@#$",
        "Tm90SnNvbg==",  # base64 of "NotJson"
        "eyJzb3VyY2UiOiJhdWRpdCJ9",  # missing keys
    ]
    for bad in bad_cursors:
        resp = await client.get(
            f"/api/matters/{slug}/audit/reconstruction?cursor={bad}"
        )
        assert resp.status_code == 422, (
            f"cursor={bad!r} returned {resp.status_code} (expected 422)"
        )
        body = resp.json()
        assert body["detail"]["error"] == "invalid_request"
