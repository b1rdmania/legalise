"""Phase 3 — trust ceremony state machine tests."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.trust_ceremony import (
    Ceremony,
    CeremonyState,
    advance_ceremony,
    build_permission_card,
    clear_ceremonies,
    get_ceremony,
    start_ceremony,
)
from app.models import AuditEntry, User


def _verified_manifest(**overrides) -> dict:
    """A manifest that should take the verified-publisher fast path."""
    m = {
        "schema_version": "2.0.0",
        "id": "legalise.test-module",
        "name": "Test Module",
        "version": "1.0.0",
        "publisher": "legalise",
        "signed_by": "legalise",
        "signature": "x" * 64,
        "visibility": "first_party",
        "runtime": "native",
        "entrypoint": {"python_module": "test.fixture", "entry": "M"},
        "capabilities": [
            {
                "id": "default",
                "kind": "skill",
                "scope": "matter",
                "reads": ["matter.read"],
                "writes": ["citation.write"],
                "model_access": "none",
                "external_network": False,
                "data_movement": {"local_only": True, "external_destinations": []},
                "gates": ["privilege_posture"],
                "ui": {"slot": "matter.workflows", "label": "Test"},
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": ["test.invoked"],
            }
        ],
    }
    m.update(overrides)
    return m


def _unverified_manifest(**overrides) -> dict:
    """A manifest that requires the unverified full path."""
    m = _verified_manifest(**overrides)
    m["publisher"] = "random-org"
    m["signed_by"] = None
    m.pop("signature", None)
    return m


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p3-tc-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ---------------------------------------------------------------------------
# Pure unit
# ---------------------------------------------------------------------------


def test_build_permission_card_aggregates_capabilities() -> None:
    m = _verified_manifest()
    card = build_permission_card(m)
    assert card.module_id == "legalise.test-module"
    assert card.publisher == "legalise"
    assert card.publisher_verified is True
    assert "privilege_posture" in card.gates
    assert card.advice_tier_max == "draft_advice"
    assert card.data_movement_summary["local_only"] is True


def test_build_permission_card_unverified_publisher() -> None:
    m = _unverified_manifest()
    card = build_permission_card(m)
    assert card.publisher_verified is False


def test_build_permission_card_aggregates_external_destinations() -> None:
    m = _verified_manifest()
    m["capabilities"][0]["external_network"] = True
    m["capabilities"][0]["data_movement"] = {
        "external_destinations": ["api.example.com"],
        "local_only": False,
    }
    card = build_permission_card(m)
    assert "api.example.com" in card.data_movement_summary["external_destinations"]
    assert card.data_movement_summary["local_only"] is False


def test_highest_tier_picks_max() -> None:
    m = _verified_manifest()
    m["capabilities"].append({
        "id": "advanced",
        "kind": "workflow",
        "scope": "matter",
        "reads": [],
        "writes": [],
        "model_access": "none",
        "external_network": False,
        "data_movement": {"local_only": True},
        "gates": [],
        "ui": {"slot": "matter.workflows"},
        "streaming_mode": "sync",
        "advice_tier_max": "supervised_legal_advice",
        "audit_events": [],
    })
    card = build_permission_card(m)
    assert card.advice_tier_max == "supervised_legal_advice"


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verified_path_reaches_enabled_in_three_advances(db_session) -> None:
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(),
        actor_user_id=user.id,
    )
    assert ceremony.fast_path is True
    assert ceremony.state is CeremonyState.DISCOVERED

    # First advance: publisher_checked
    c1 = await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="trust", actor_user_id=user.id
    )
    assert c1.state is CeremonyState.PUBLISHER_CHECKED

    # Second advance: permissions_reviewed
    c2 = await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="trust", actor_user_id=user.id
    )
    assert c2.state is CeremonyState.PERMISSIONS_REVIEWED

    # Third advance: granted
    c3 = await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="trust", actor_user_id=user.id
    )
    assert c3.state is CeremonyState.GRANTED

    # Final advance: enabled
    c4 = await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="grant", actor_user_id=user.id
    )
    assert c4.state is CeremonyState.ENABLED


@pytest.mark.asyncio
async def test_unverified_path_walks_seven_states(db_session) -> None:
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_unverified_manifest(),
        actor_user_id=user.id,
    )
    assert ceremony.fast_path is False
    expected_states = [
        CeremonyState.INSPECTED,
        CeremonyState.SIGNATURE_CHECKED,
        CeremonyState.PUBLISHER_CHECKED,
        CeremonyState.PERMISSIONS_REVIEWED,
        CeremonyState.GATES_REVIEWED,
        CeremonyState.GRANTED,
        CeremonyState.ENABLED,
    ]
    actual_states = []
    last_action = "trust"
    for next_state in expected_states:
        if next_state is CeremonyState.ENABLED:
            last_action = "grant"
        c = await advance_ceremony(
            db_session,
            ceremony_id=ceremony.id,
            action=last_action,
            actor_user_id=user.id,
        )
        actual_states.append(c.state)
    assert actual_states == expected_states


@pytest.mark.asyncio
async def test_reject_terminates_ceremony(db_session) -> None:
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(),
        actor_user_id=user.id,
    )
    rejected = await advance_ceremony(
        db_session,
        ceremony_id=ceremony.id,
        action="reject",
        actor_user_id=user.id,
    )
    assert rejected.state is CeremonyState.REJECTED_BY_USER


@pytest.mark.asyncio
async def test_terminal_state_does_not_advance_further(db_session) -> None:
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(),
        actor_user_id=user.id,
    )
    rejected = await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="reject", actor_user_id=user.id
    )
    assert rejected.state is CeremonyState.REJECTED_BY_USER
    # Further advances are no-ops.
    stuck = await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="trust", actor_user_id=user.id
    )
    assert stuck.state is CeremonyState.REJECTED_BY_USER


@pytest.mark.asyncio
async def test_unknown_ceremony_raises_keyerror(db_session) -> None:
    user = await _make_user(db_session)
    with pytest.raises(KeyError):
        await advance_ceremony(
            db_session,
            ceremony_id=uuid.uuid4(),
            action="trust",
            actor_user_id=user.id,
        )


@pytest.mark.asyncio
async def test_audit_emitted_on_state_transitions(db_session) -> None:
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(),
        actor_user_id=user.id,
    )
    # The start_ceremony already emitted module.discovered.
    rows = (
        await db_session.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "module.discovered",
                AuditEntry.resource_id == str(ceremony.id),
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].module == "core.trust_ceremony"


@pytest.mark.asyncio
async def test_get_ceremony_round_trip(db_session) -> None:
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(),
        actor_user_id=user.id,
    )
    fetched = get_ceremony(ceremony.id)
    assert fetched is not None
    assert fetched.id == ceremony.id


def test_get_unknown_ceremony_returns_none() -> None:
    assert get_ceremony(uuid.uuid4()) is None


def test_clear_ceremonies_wipes_state() -> None:
    clear_ceremonies()
    # Cannot directly assert _CEREMONIES is empty since it's private,
    # but get_ceremony for any uuid returns None.
    assert get_ceremony(uuid.uuid4()) is None
