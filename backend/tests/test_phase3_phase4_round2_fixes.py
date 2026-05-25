"""Round-2 Reviewer fix tests (Phase 3 + Phase 4).

Four findings from the combined Phase 3+4 ratification review:

P1#1 — trust ceremony grant could skip straight to enabled
P1#2 — update diff missed advice-tier expansion in raw manifests
P1#3 — dependency resolver never called from install/update
P2#4 — duplicate persist on retried final grant

Each finding gets a focused regression test here.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.grants_lifecycle import detect_expansion, requires_reprompt
from app.core.trust_ceremony import (
    CeremonyState,
    InvalidCeremonyTransition,
    advance_ceremony,
    clear_ceremonies,
    start_ceremony,
)
from app.models import InstalledModule, User


def _verified_manifest(module_id="legalise.r2-test", version="1.0.0", **overrides) -> dict:
    m = {
        "schema_version": "2.0.0",
        "id": module_id,
        "name": "R2 Test",
        "version": version,
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
                "data_movement": {
                    "local_only": True,
                    "external_destinations": [],
                },
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


async def _make_user(db_session, *, is_superuser: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"r2-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=is_superuser,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ---------------------------------------------------------------------------
# P1#1 — grant can no longer skip the ceremony
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_grant_from_discovered_raises(db_session) -> None:
    """Round-2 P1#1: action=grant from DISCOVERED state must NOT
    advance to ENABLED; it must raise InvalidCeremonyTransition so
    the admin cannot skip the ceremony."""
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(),
        actor_user_id=user.id,
    )
    assert ceremony.state is CeremonyState.DISCOVERED

    with pytest.raises(InvalidCeremonyTransition):
        await advance_ceremony(
            db_session,
            ceremony_id=ceremony.id,
            action="grant",
            actor_user_id=user.id,
        )


@pytest.mark.asyncio
async def test_grant_from_publisher_checked_raises(db_session) -> None:
    """Round-2 P1#1: grant from mid-ceremony state also rejected."""
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(module_id="legalise.r2-mid"),
        actor_user_id=user.id,
    )
    # Advance into PUBLISHER_CHECKED on the fast path.
    await advance_ceremony(
        db_session, ceremony_id=ceremony.id, action="trust", actor_user_id=user.id
    )
    refreshed = await advance_ceremony(
        db_session,
        ceremony_id=ceremony.id,
        action="trust",
        actor_user_id=user.id,
    )
    # We're now in PERMISSIONS_REVIEWED — grant still not allowed.
    assert refreshed.state is not CeremonyState.GRANTED
    with pytest.raises(InvalidCeremonyTransition):
        await advance_ceremony(
            db_session,
            ceremony_id=ceremony.id,
            action="grant",
            actor_user_id=user.id,
        )


@pytest.mark.asyncio
async def test_grant_from_granted_succeeds(db_session) -> None:
    """Round-2 P1#1: grant IS allowed from GRANTED."""
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(module_id="legalise.r2-grant-ok"),
        actor_user_id=user.id,
    )
    # Fast path: 3 trusts to reach GRANTED.
    for _ in range(3):
        ceremony = await advance_ceremony(
            db_session,
            ceremony_id=ceremony.id,
            action="trust",
            actor_user_id=user.id,
        )
    assert ceremony.state is CeremonyState.GRANTED
    enabled = await advance_ceremony(
        db_session,
        ceremony_id=ceremony.id,
        action="grant",
        actor_user_id=user.id,
    )
    assert enabled.state is CeremonyState.ENABLED


# ---------------------------------------------------------------------------
# P1#2 — advice-tier expansion in raw manifests is now detected
# ---------------------------------------------------------------------------


def test_detect_expansion_picks_up_tier_increase_in_capabilities() -> None:
    """Round-2 P1#2: when the new snapshot is a raw v2 manifest (no
    top-level advice_tier_max key, only per-capability), the diff
    must still pick up the tier increase."""
    # Old snapshot is aggregated (built by build_permission_card).
    old = {
        "advice_tier_max": "draft_advice",
        "capabilities": [{"advice_tier_max": "draft_advice"}],
    }
    # New snapshot is the raw manifest shape — no top-level rollup.
    new = {
        "capabilities": [{"advice_tier_max": "supervised_legal_advice"}],
    }
    report = detect_expansion(old, new)
    assert report.tier_raised == ("draft_advice", "supervised_legal_advice")
    assert requires_reprompt(report)


def test_detect_expansion_handles_multi_capability_tier() -> None:
    """If any capability in the new manifest declares a higher tier
    than the old aggregate, it counts as expansion."""
    old = {
        "advice_tier_max": "factual_extraction",
        "capabilities": [{"advice_tier_max": "factual_extraction"}],
    }
    new = {
        "capabilities": [
            {"advice_tier_max": "factual_extraction"},
            {"advice_tier_max": "draft_advice"},
        ],
    }
    report = detect_expansion(old, new)
    assert report.tier_raised == ("factual_extraction", "draft_advice")


# ---------------------------------------------------------------------------
# P1#3 — install rejects manifests with missing dependencies
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_install_rejects_missing_dependency(client) -> None:
    """Round-2 P1#3: start_install_endpoint must run
    resolve_dependencies and reject when unsatisfied."""
    # Register an admin.
    email = f"r2-dep-{uuid.uuid4().hex[:8]}@example.com"
    password = "round2-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )

    # Flip to superuser via a fresh session.
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

    # Manifest declares a dependency that doesn't exist.
    manifest = _verified_manifest(module_id="legalise.needs-dep")
    manifest["requires"] = [
        {"module_id": "nowhere.module", "version": ">=1.0.0"}
    ]

    resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "dependencies_unsatisfied"
    assert detail["resolution"]["is_satisfied"] is False
    missing_ids = [m["module_id"] for m in detail["resolution"]["missing"]]
    assert "nowhere.module" in missing_ids


@pytest.mark.asyncio
async def test_update_rejects_missing_dependency(client) -> None:
    """Round-2 P1#3: update_module_endpoint also runs the resolver."""
    from app.core.trust_ceremony import clear_ceremonies

    clear_ceremonies()
    email = f"r2-updep-{uuid.uuid4().hex[:8]}@example.com"
    password = "round2-2026"
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

    # Install v1.0.0 (no deps).
    manifest_v1 = _verified_manifest(module_id="legalise.dep-update", version="1.0.0")
    install_start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest_v1},
    )
    assert install_start.status_code == 201, install_start.text
    ceremony_id = install_start.json()["ceremony_id"]
    for _ in range(3):
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200
    r = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert r.status_code == 200

    # Update to v1.1.0 with a missing dependency.
    manifest_v2 = _verified_manifest(module_id="legalise.dep-update", version="1.1.0")
    manifest_v2["requires"] = [
        {"module_id": "phantom.module", "version": ">=2.0.0"}
    ]
    resp = await client.post(
        "/api/modules/legalise.dep-update/update",
        json={"new_manifest": manifest_v2},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"]["error"] == "dependencies_unsatisfied"


# ---------------------------------------------------------------------------
# P2#4 — idempotent persist on retried final grant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_repeated_grant_does_not_double_insert(client) -> None:
    """Round-2 P2: the install endpoint persists InstalledModule ONLY
    on the transition INTO enabled. A retry/poll of the final grant
    must not attempt a second insert (which would 500 on the
    UNIQUE (module_id, version) constraint)."""
    from app.core.trust_ceremony import clear_ceremonies

    clear_ceremonies()
    email = f"r2-idemp-{uuid.uuid4().hex[:8]}@example.com"
    password = "round2-2026"
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

    manifest = _verified_manifest(module_id="legalise.idemp-test", version="1.0.0")
    install_start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    ceremony_id = install_start.json()["ceremony_id"]
    for _ in range(3):
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200
    # First grant — transitions to ENABLED + persists.
    r = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert r.status_code == 200
    assert r.json()["state"] == "enabled"

    # Second grant — must NOT 500. Ceremony is already terminal so
    # the state stays enabled, persist is skipped because of the
    # `persisted` flag.
    r2 = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["state"] == "enabled"

    # Verify exactly one InstalledModule row.
    async with factory() as session:
        rows = (
            await session.scalars(
                select(InstalledModule).where(
                    InstalledModule.module_id == "legalise.idemp-test"
                )
            )
        ).all()
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# P2 residual — invalid ceremony actions must be rejected, not silently
# treated as "trust"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_ceremony_action_rejected_at_api(client) -> None:
    """Round-2 residual P2: AdvanceCeremonyRequest.action is now a
    Literal. ``{"action":"banana"}`` must return 422 from FastAPI
    validation, never advance the ceremony as ``trust``."""
    clear_ceremonies()
    email = f"r2-action-{uuid.uuid4().hex[:8]}@example.com"
    password = "round2-2026"
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

    install_start = await client.post(
        "/api/modules/install",
        json={
            "source": "manifest",
            "manifest": _verified_manifest(module_id="legalise.banana"),
        },
    )
    assert install_start.status_code == 201
    ceremony_id = install_start.json()["ceremony_id"]
    initial_state = install_start.json()["state"]

    resp = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "banana"},
    )
    assert resp.status_code == 422, resp.text

    # Confirm the ceremony was NOT advanced.
    status = await client.get(f"/api/modules/install/{ceremony_id}")
    assert status.json()["state"] == initial_state


@pytest.mark.asyncio
async def test_unknown_ceremony_action_rejected_in_core(db_session) -> None:
    """Round-2 residual P2: even an internal caller that bypasses the
    Pydantic boundary cannot smuggle an unknown action through —
    ``advance_ceremony`` raises ``InvalidCeremonyTransition``."""
    clear_ceremonies()
    user = await _make_user(db_session)
    ceremony = await start_ceremony(
        db_session,
        manifest=_verified_manifest(module_id="legalise.core-banana"),
        actor_user_id=user.id,
    )
    with pytest.raises(InvalidCeremonyTransition):
        await advance_ceremony(
            db_session,
            ceremony_id=ceremony.id,
            action="banana",
            actor_user_id=user.id,
        )
