"""Audit reconstruction — core merge, cursor/pagination, filters, API.

Merged from test_phase5_audit_reconstruction.py,
test_phase5_audit_reconstruction_r2_fixes.py and
test_phase14_5_a_reconstruction_filters.py (test-slim Phase 3).

Covers:
- cursor encode/decode round trip + every malformed-cursor rejection
- single-source core: matter scoping, time window, source filter, limits
- three-source merge ordering (timestamp asc, ties by SOURCE_ORDER)
- pagination: no-overlap between pages; no row silently dropped across
  sources when paginating with a cursor (Phase 5 R2 P1 regression)
- server-side filters (invocation_id, action) applied BEFORE pagination
- API: strict matter access (owner 200 / stranger 404), 422 envelopes,
  audit.reconstruction.viewed emission with the unified payload shape
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import select

from app.core.audit_reconstruction import (
    DEFAULT_LIMIT,
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


# ---------------------------------------------------------------------------
# Shared fixture helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session, *, superuser: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"recon-{uuid.uuid4().hex[:8]}@example.com",
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


async def _make_sm_instance(
    db_session, matter, *, key: str | None = None
) -> StateMachineInstance:
    """One state-machine definition + instance owned by `matter`."""
    sm_def = StateMachineDefinition(
        id=uuid.uuid4(),
        module_id="test",
        definition_key=key or f"flow-{uuid.uuid4().hex[:6]}",
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
    return instance


async def _make_owned_matter_via_api(client, *, title: str = "Owner Matter") -> str:
    """Register + login a fresh user and create a matter they own.
    Returns the matter slug."""
    email = f"recon-api-{uuid.uuid4().hex[:8]}@example.com"
    password = "recon-api-2026"
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
            title=title,
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.commit()
        return matter.slug


# ---------------------------------------------------------------------------
# Cursor round-trip + canonical source order
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Malformed cursor rejection (Phase 5 R2 P2)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Single-source core
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Multi-source merge
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconstruct_merges_three_sources_in_order(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    # 1. Audit row.
    await _emit_audit(db_session, matter=matter, user=user, action="alpha")

    # 2. State machine instance + transition.
    instance = await _make_sm_instance(db_session, matter, key="testflow")
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


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconstruct_pagination_cursor(db_session) -> None:
    """Basic cursor pagination: no overlap between consecutive pages."""
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


@pytest.mark.asyncio
async def test_pagination_does_not_skip_non_cursor_source_rows(db_session) -> None:
    """Regression for Reviewer Phase 5 R2 P1.

    When the cursor lands on source X, the other sources must also
    apply the cursor key in SQL — not just re-query from the window
    start with LIMIT N (which silently capped rows). The load-bearing
    assertion: after fully paginating, the UNION of all entries
    returned across all pages equals the full set of rows in the
    window. No row is silently dropped from any source.
    """
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    instance = await _make_sm_instance(db_session, matter, key="r2flow")

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


# ---------------------------------------------------------------------------
# Server-side filters (Phase 14.5 A) — applied BEFORE pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invocation_id_filter_returns_target_on_page_one_through_dense_noise(
    db_session,
):
    """The original UX hole this filter closes.

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
    instance = await _make_sm_instance(db_session, matter)
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
    instance = await _make_sm_instance(db_session, matter)
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


# ---------------------------------------------------------------------------
# API authorisation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_strict_matter_access_owner_passes(client) -> None:
    slug = await _make_owned_matter_via_api(client)
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
    slug = await _make_owned_matter_via_api(client, title="Owner Only")

    # Stranger logs in.
    stranger_email = f"recon-stranger-{uuid.uuid4().hex[:8]}@example.com"
    password = "recon-api-2026"
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
async def test_api_rejects_unknown_source_with_422(client) -> None:
    slug = await _make_owned_matter_via_api(client)
    resp = await client.get(
        f"/api/matters/{slug}/audit/reconstruction?include=banana,audit"
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "unknown_source"
    assert "banana" in resp.json()["detail"]["unknown"]


@pytest.mark.asyncio
async def test_endpoint_invalid_invocation_id_422(client, db_session):
    """The endpoint validates invocation_id as a UUID before calling
    into the substrate. Junk strings get a structured 422, not a
    database cast error.
    """
    # Register a user + matter via the test client's normal flow.
    email = f"recon-422-{uuid.uuid4().hex[:8]}@example.com"
    pw = "recon-api-2026"
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


@pytest.mark.asyncio
async def test_api_returns_422_on_malformed_cursor(client) -> None:
    """The API translates ValueError from decode_cursor to HTTP 422
    — never 500."""
    slug = await _make_owned_matter_via_api(client, title="R2 cursor test")

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


# ---------------------------------------------------------------------------
# Audit emission — every successful view writes audit.reconstruction.viewed
# with the unified payload shape (scope + matter_id + filters + returned)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_endpoint_emits_unified_payload_shape(client, db_session):
    """The endpoint's `audit.reconstruction.viewed` row carries the
    Phase 14.5 A-locked payload shape: scope + matter_id + filters.
    The workspace/admin endpoint uses the same shape with
    scope='workspace' (see test_admin_api.py)."""
    email = f"recon-emit-{uuid.uuid4().hex[:8]}@example.com"
    pw = "recon-api-2026"
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
    assert payload["returned"] == len(resp.json()["entries"])
    filters = payload["filters"]
    assert filters["invocation_id"] == inv
    assert filters["action"] == "model.call"
    assert filters["since"] is None
    assert filters["until"] is None
    assert set(filters["sources"]) == {"audit", "state_machine", "advice_boundary"}
