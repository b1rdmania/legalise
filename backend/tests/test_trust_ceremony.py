"""Trust ceremony — state machine, rejection audit, dead-state pins.

Merged from test_phase3_trust_ceremony.py +
test_phase5_ceremony_rejection_audit.py + test_phase5_carryover_tidy.py
(the carryover file's app-wide hygiene greps moved to
test_migration_discipline.py).
"""

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
        email=f"tc-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ---------------------------------------------------------------------------
# Pure unit — permission card
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
async def test_terminal_state_does_not_advance_further(db_session) -> None:
    """reject terminates the ceremony; further advances are no-ops."""
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


# ---------------------------------------------------------------------------
# module.ceremony.rejected audit emission (HTTP-level)
#
# Two paths must emit the audit row:
# 1. InvalidCeremonyTransition raised inside advance_ceremony and
#    translated to HTTP 409 by api.modules.advance_install_endpoint.
# 2. Pydantic RequestValidationError raised when the request body
#    carries an action that isn't in Literal["trust","reject","grant"],
#    translated to HTTP 422 by the global handler in main.py.
# ---------------------------------------------------------------------------


@pytest.fixture
def captured_audit_failures(monkeypatch):
    """Capture every audit_failure call without writing to DB.

    Reason: audit_failure opens an independent committed session for
    production durability through rollback. In tests, the user only
    exists inside the outer SAVEPOINT — the independent session
    cannot see it. Pattern matches
    test_storage_failure_envelopes.py.

    Returns a list that the test reads to assert on emissions.
    """
    from app.core import api as api_module

    captured: list[dict] = []

    async def _capture(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capture)
    return captured


async def _login_admin(client) -> tuple[str, str]:
    email = f"tc-rejaudit-{uuid.uuid4().hex[:8]}@example.com"
    password = "trust-ceremony-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email, password


@pytest.mark.asyncio
async def test_invalid_ceremony_transition_emits_audit_row(
    client, captured_audit_failures
) -> None:
    """grant from DISCOVERED → 409 + module.ceremony.rejected row."""
    clear_ceremonies()
    email, _ = await _login_admin(client)

    install = await client.post(
        "/api/modules/install",
        json={
            "source": "manifest",
            "manifest": _verified_manifest(id="legalise.r2-rejaudit"),
        },
    )
    assert install.status_code == 201, install.text
    ceremony_id = install.json()["ceremony_id"]

    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert resp.status_code == 409

    # The endpoint's InvalidCeremonyTransition branch routes through
    # the captured audit_failure helper. Exactly one row should land
    # with the canonical shape.
    rejected = [
        c for c in captured_audit_failures
        if c["action"] == "module.ceremony.rejected"
    ]
    assert len(rejected) == 1
    payload = rejected[0]["payload"]
    assert payload["ceremony_id"] == ceremony_id
    assert payload["requested_action"] == "grant"
    assert payload["reason"] == "invalid_transition"


@pytest.mark.asyncio
async def test_unknown_action_emits_audit_row(
    client, captured_audit_failures
) -> None:
    """{"action":"banana"} → 422 + module.ceremony.rejected row via the
    global RequestValidationError handler."""
    clear_ceremonies()
    email, _ = await _login_admin(client)

    install = await client.post(
        "/api/modules/install",
        json={
            "source": "manifest",
            "manifest": _verified_manifest(id="legalise.r2-banana"),
        },
    )
    assert install.status_code == 201
    ceremony_id = install.json()["ceremony_id"]

    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "banana"},
    )
    assert resp.status_code == 422

    rejected = [
        c for c in captured_audit_failures
        if c["action"] == "module.ceremony.rejected"
    ]
    assert len(rejected) == 1
    payload = rejected[0]["payload"]
    assert payload["reason"] == "schema_validation_failed"
    assert payload["ceremony_id"] == ceremony_id


# ---------------------------------------------------------------------------
# Dead-state pins (Phase 5 Step 0 carryover)
# ---------------------------------------------------------------------------


def test_dependency_missing_removed_from_enum() -> None:
    """CeremonyState no longer carries DEPENDENCY_MISSING."""
    members = {m.name for m in CeremonyState}
    assert "DEPENDENCY_MISSING" not in members, (
        "DEPENDENCY_MISSING was removed in Phase 5 Step 0 — see "
        "PHASE_5_BUILD_PLAN_V3.md. Phase 4 returns 422 BEFORE start_ceremony, "
        "so the state machine has no path to this terminal."
    )
    values = {m.value for m in CeremonyState}
    assert "dependency_missing" not in values


def test_dependency_missing_not_in_terminal_failures() -> None:
    """The terminal-failures frozenset does not carry the dead state."""
    from app.core.trust_ceremony import _TERMINAL_FAILURES

    assert all(
        m.value != "dependency_missing" for m in _TERMINAL_FAILURES
    )
