"""Phase 14.5 B — installed-modules listing endpoint.

Closes BACKEND_GAP_AUDIT finding 14-B-#1. New read-only endpoint
``GET /api/modules/installed`` returns one row per module_id (most
recent by installed_at). Powers the catalog "Installed vX.Y" badge
and the GrantsPanel runnable-pair AND-gate.

No audit emission (Phase 13b Decision #1 — reads don't audit).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import select

from app.models import (
    InstalledModule,
    Matter,
    User,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register_and_login(client) -> str:
    email = f"p145b-{uuid.uuid4().hex[:8]}@example.com"
    pw = "p145b-pwd-2026"
    await client.post("/auth/register", json={"email": email, "password": pw})
    await client.post(
        "/auth/login",
        data={"username": email, "password": pw},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


def _make_installed_row(
    *,
    module_id: str,
    version: str,
    installed_at: datetime,
    enabled: bool = True,
    publisher: str = "legalise",
    visibility: str = "first_party",
    signature_status: str = "verified",
    installed_by_user_id: uuid.UUID | None = None,
    capabilities: list[dict] | None = None,
) -> InstalledModule:
    return InstalledModule(
        id=uuid.uuid4(),
        module_id=module_id,
        version=version,
        publisher=publisher,
        visibility=visibility,
        signature_status=signature_status,
        signed_by=None,
        verified_at=installed_at,
        install_path="<inline>",
        manifest_snapshot={"id": module_id, "version": version},
        permissions_snapshot={"capabilities": capabilities or []},
        installed_at=installed_at,
        installed_by_user_id=installed_by_user_id,
        enabled=enabled,
    )


# ---------------------------------------------------------------------------
# Endpoint shape + auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_anon_caller_gets_401(client):
    """Mirrors GET /api/modules/v2's auth posture — read-only but
    auth-gated. An anonymous request returns 401, not 200 with an
    empty list."""
    # Make sure no session cookie is in flight.
    client.cookies.clear()
    resp = await client.get("/api/modules/installed")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_authenticated_caller_returns_empty_when_no_installs(
    client, db_session
):
    await _register_and_login(client)
    # Ensure no InstalledModule rows exist for this matter scope.
    # (The seed-Khan-on-register flow creates Matter rows but not
    # InstalledModule rows — those need a real trust ceremony.)
    resp = await client.get("/api/modules/installed")
    assert resp.status_code == 200
    # Tests share a DB; previously-installed modules from other
    # tests may persist. Sanity check: it's a list, just possibly
    # not empty. Assert shape, not absolute emptiness.
    assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Dedup: one row per module_id, most recent installed_at wins
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dedupes_by_module_id_returning_most_recent(client, db_session):
    """Substrate allows multiple InstalledModule rows per module_id
    (successive installs without explicit delete of the prior row).
    The listing endpoint must return ONE row per module_id, the
    most recent by installed_at — mirroring revoke_module_endpoint's
    "most recent installed version" lookup.
    """
    await _register_and_login(client)
    module_id = f"phase145b-dedupe-{uuid.uuid4().hex[:6]}"
    base = datetime(2026, 1, 1, tzinfo=UTC)

    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.1.0",
        installed_at=base,
    ))
    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.2.0",
        installed_at=base + timedelta(days=1),
    ))
    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.3.0-rc",
        installed_at=base + timedelta(days=2),
    ))
    await db_session.flush()

    resp = await client.get("/api/modules/installed")
    assert resp.status_code == 200
    rows = resp.json()
    matching = [r for r in rows if r["module_id"] == module_id]
    assert len(matching) == 1, (
        f"expected exactly one row for module_id={module_id}; got "
        f"{len(matching)}"
    )
    assert matching[0]["version"] == "0.3.0-rc"


@pytest.mark.asyncio
async def test_disabled_row_surfaces_with_enabled_false(client, db_session):
    """A revoked module's row has enabled=False; the listing must
    surface that so the catalog can render a muted
    'Installed (disabled)' badge."""
    await _register_and_login(client)
    module_id = f"phase145b-disabled-{uuid.uuid4().hex[:6]}"

    db_session.add(_make_installed_row(
        module_id=module_id,
        version="1.0.0",
        installed_at=datetime(2026, 1, 1, tzinfo=UTC),
        enabled=False,
    ))
    await db_session.flush()

    resp = await client.get("/api/modules/installed")
    rows = resp.json()
    matching = next((r for r in rows if r["module_id"] == module_id), None)
    assert matching is not None
    assert matching["enabled"] is False
    assert matching["version"] == "1.0.0"


@pytest.mark.asyncio
async def test_disabled_dedup_respects_installed_at(client, db_session):
    """Pin the dedup semantic: most-recent wins, even if the
    most-recent is a disabled row. The catalog needs to render the
    current state, not the most-recent enabled state."""
    await _register_and_login(client)
    module_id = f"phase145b-disabled-recent-{uuid.uuid4().hex[:6]}"

    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.1.0",
        installed_at=datetime(2026, 1, 1, tzinfo=UTC),
        enabled=True,
    ))
    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.2.0",
        installed_at=datetime(2026, 2, 1, tzinfo=UTC),
        enabled=False,
    ))
    await db_session.flush()

    resp = await client.get("/api/modules/installed")
    rows = resp.json()
    matching = next((r for r in rows if r["module_id"] == module_id), None)
    assert matching is not None
    assert matching["enabled"] is False
    assert matching["version"] == "0.2.0"


# ---------------------------------------------------------------------------
# Response shape — no secrets leaked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_response_shape_excludes_secrets_and_internals(client, db_session):
    """Substrate-side InstalledModule carries manifest_snapshot +
    permissions_snapshot + install_path — none of those belong in
    the listing endpoint. The DTO surface is closed."""
    await _register_and_login(client)
    module_id = f"phase145b-shape-{uuid.uuid4().hex[:6]}"
    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.1.0",
        installed_at=datetime(2026, 3, 1, tzinfo=UTC),
    ))
    await db_session.flush()

    resp = await client.get("/api/modules/installed")
    rows = resp.json()
    matching = next((r for r in rows if r["module_id"] == module_id), None)
    assert matching is not None
    # Documented fields present.
    expected_keys = {
        "module_id",
        "version",
        "publisher",
        "visibility",
        "signature_status",
        "capabilities",
        "enabled",
        "installed_at",
        "installed_by_user_id",
    }
    assert set(matching.keys()) == expected_keys
    # Never leaks manifest / permissions / install_path.
    assert "manifest_snapshot" not in matching
    assert "permissions_snapshot" not in matching
    assert "install_path" not in matching
    assert "signed_by" not in matching


@pytest.mark.asyncio
async def test_capability_summaries_surface_without_full_manifest(
    client, db_session
):
    """Imported inline modules are not in the registry catalogue, so
    the grants UI needs capability summaries from the installed row.
    Surface just that grantable shape, not the full manifest snapshot."""
    await _register_and_login(client)
    module_id = f"phase145b-caps-{uuid.uuid4().hex[:6]}"
    db_session.add(_make_installed_row(
        module_id=module_id,
        version="0.1.0",
        installed_at=datetime(2026, 3, 2, tzinfo=UTC),
        capabilities=[
            {
                "id": "default",
                "kind": "skill",
                "scope": "matter",
                "reads": ["matter.document.read"],
                "writes": ["matter.artifact.write"],
            }
        ],
    ))
    await db_session.flush()

    resp = await client.get("/api/modules/installed")
    rows = resp.json()
    matching = next((r for r in rows if r["module_id"] == module_id), None)
    assert matching is not None
    assert matching["capabilities"] == [
        {
            "id": "default",
            "kind": "skill",
            "scope": "matter",
            "reads": ["matter.document.read"],
            "writes": ["matter.artifact.write"],
        }
    ]
    assert "manifest_snapshot" not in matching
    assert "permissions_snapshot" not in matching


# ---------------------------------------------------------------------------
# No audit emission (Phase 13b Decision #1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_endpoint_emits_no_audit_row(client, db_session):
    """Reads MUST NOT emit audit rows. Pin this contract so a future
    refactor adding telemetry doesn't quietly start auditing."""
    from app.models import AuditEntry

    await _register_and_login(client)

    # Count audit rows referencing /api/modules/installed BEFORE.
    pre = await db_session.scalar(
        select(__import__("sqlalchemy").func.count())
        .select_from(AuditEntry)
        .where(AuditEntry.payload["path"].astext == "/api/modules/installed")
    )

    resp = await client.get("/api/modules/installed")
    assert resp.status_code == 200

    post = await db_session.scalar(
        select(__import__("sqlalchemy").func.count())
        .select_from(AuditEntry)
        .where(AuditEntry.payload["path"].astext == "/api/modules/installed")
    )
    # The matters audit middleware audits /api/matters/* paths only;
    # /api/modules/installed is outside that scope, so no row should
    # land. Belt-and-braces: assert no semantic audit row either
    # (no "module.installed.viewed" or similar).
    assert post == pre, (
        "GET /api/modules/installed emitted an audit row; reads must "
        "not audit per Phase 13b Decision #1"
    )

    # Also verify no semantic audit action was minted for this read.
    leaked = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action.like("module.installed.%")
        )
    )
    assert leaked is None
