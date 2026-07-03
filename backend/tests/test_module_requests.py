"""Skill request path — POST/GET /api/modules/requests.

The audit chain is the store: POST writes one
``module.request.created`` row (module="module_lifecycle"); GET
derives the pending set from those rows minus enabled installed
module_ids. No new table.

Coverage:
- POST writes the audit row with the canonical action/module/payload
- POST requires auth; empty module_id is rejected
- GET is admin-gated (403 admin_required for non-admins)
- GET dedupes per module_id and excludes installed+enabled modules
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import AuditEntry, InstalledModule, User


async def _register_and_login(client) -> str:
    email = f"mreq-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/auth/register", json={"email": email, "password": "mreq-2026"}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": "mreq-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _promote_to_superuser(email: str) -> uuid.UUID:
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()
        return u.id


async def _install_enabled(module_id: str) -> None:
    """Insert a minimal enabled installed row directly — the request
    listing only reads module_id + enabled."""
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        session.add(
            InstalledModule(
                module_id=module_id,
                version="1.0.0",
                publisher="test",
                visibility="first_party",
                signature_status="structure_verified",
                install_path="<inline>",
                manifest_snapshot={},
                permissions_snapshot={},
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_request_requires_auth(client) -> None:
    client.cookies.clear()
    resp = await client.post(
        "/api/modules/requests", json={"module_id": "contract-review"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_request_writes_audit_row(client, db_session) -> None:
    await _register_and_login(client)
    module_id = f"skill-{uuid.uuid4().hex[:8]}"

    resp = await client.post(
        "/api/modules/requests",
        json={"module_id": module_id, "source": "lawve"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json() == {"ok": True}

    row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "module.request.created",
            AuditEntry.resource_id == module_id,
        )
    )
    assert row is not None
    assert row.module == "module_lifecycle"
    assert row.resource_type == "module_request"
    assert row.payload["module_id"] == module_id
    assert row.payload["source"] == "lawve"
    assert row.payload["requested_by"] == str(row.actor_id)
    assert row.actor_id is not None


@pytest.mark.asyncio
async def test_github_request_round_trips_source_url(client) -> None:
    """A github-sourced request carries its repo URL so the admin's
    Review-&-add link can re-open the exact source."""
    await _register_and_login(client)
    module_id = f"gh-skill-{uuid.uuid4().hex[:8]}"
    repo_url = "https://github.com/example/legal-skill"

    resp = await client.post(
        "/api/modules/requests",
        json={"module_id": module_id, "source": "github", "source_url": repo_url},
    )
    assert resp.status_code == 201, resp.text

    admin_email = await _register_and_login(client)
    await _promote_to_superuser(admin_email)
    resp = await client.get("/api/modules/requests")
    assert resp.status_code == 200, resp.text
    row = next(r for r in resp.json() if r["module_id"] == module_id)
    assert row["source"] == "github"
    assert row["source_url"] == repo_url

    # Lawve-style requests without a URL still list with a null field.
    lawve_rows = [r for r in resp.json() if r["module_id"] != module_id]
    for r in lawve_rows:
        assert "source_url" in r


@pytest.mark.asyncio
async def test_request_rejects_blank_module_id(client) -> None:
    await _register_and_login(client)
    resp = await client.post("/api/modules/requests", json={"module_id": "   "})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_requests_admin_gate(client) -> None:
    await _register_and_login(client)
    resp = await client.get("/api/modules/requests")
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "admin_required"


@pytest.mark.asyncio
async def test_list_requests_dedupes_and_excludes_installed(client) -> None:
    # Non-admin files requests: one twice (dedupe), one that is
    # already installed+enabled (excluded).
    await _register_and_login(client)
    pending_id = f"pending-{uuid.uuid4().hex[:8]}"
    installed_id = f"installed-{uuid.uuid4().hex[:8]}"
    for module_id, source in (
        (pending_id, "lawve"),
        (pending_id, "lawve"),
        (installed_id, None),
    ):
        resp = await client.post(
            "/api/modules/requests",
            json={"module_id": module_id, "source": source},
        )
        assert resp.status_code == 201

    await _install_enabled(installed_id)

    # Admin reads the pending set.
    admin_email = await _register_and_login(client)
    await _promote_to_superuser(admin_email)
    resp = await client.get("/api/modules/requests")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    ids = [r["module_id"] for r in rows]
    assert ids.count(pending_id) == 1
    assert installed_id not in ids
    pending = next(r for r in rows if r["module_id"] == pending_id)
    assert pending["source"] == "lawve"
    assert pending["requested_by"]
    assert pending["requested_at"]
