"""Supervisor Review v1 (SR-2) — API endpoint tests.

Auth + transition + audit coverage for /api/matters/{slug}/reviews.

Note on the reviewer model in v1: the matter-access predicate is
owner-OR-superuser, so the realistic supervised-autonomy flow is
"matter owner requests review -> workspace superuser decides". An owner
deciding their own matter's review hits the reviewer!=author guard
(403); a superuser can decide (and a superuser who is also the author
gets the audited self-review override).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import write_artifact
from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)


@pytest.fixture(autouse=True)
def _writable_matters_root(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "matters_root", str(tmp_path), raising=False)


async def _register_and_login(client, *, suffix: str = "") -> str:
    email = f"sr2{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    password = "supervisor-review-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _login(client, email: str) -> None:
    await client.post(
        "/auth/login",
        data={"username": email, "password": "supervisor-review-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _promote_superuser(email: str) -> None:
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()


async def _seed_matter_with_artifact(owner_email: str, *, kind: str = "findings_pack"):
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"sr2-{uuid.uuid4().hex[:8]}",
            title="SR2 API Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(matter)
        await session.flush()
        artifact = await write_artifact(
            session,
            matter=matter,
            capability_id="review",
            module_id="examples.contract-review",
            invocation_id=uuid.uuid4(),
            kind=kind,
            payload={"findings": [{"clause": "x", "severity": "high"}]},
            actor_user_id=owner.id,
        )
        await session.commit()
        return matter.slug, str(artifact.id)


@pytest.mark.asyncio
async def test_request_review_happy(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    resp = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["state"] == "pending"
    assert body["kind"] == "findings_pack"
    assert len(body["artifact_hash"]) == 64


@pytest.mark.asyncio
async def test_request_review_skill_response_eligible(client) -> None:
    # Prompt-runtime output (imported Lawve skills) is review-eligible —
    # the supervised-autonomy loop applies to marketplace skills too.
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner, kind="skill_response")
    resp = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["state"] == "pending"
    assert body["kind"] == "skill_response"


@pytest.mark.asyncio
async def test_request_review_ineligible_kind(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner, kind="citation_pack")
    resp = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "artifact_not_review_eligible"


@pytest.mark.asyncio
async def test_request_review_artifact_not_in_matter(client) -> None:
    owner = await _register_and_login(client)
    slug, _ = await _seed_matter_with_artifact(owner)
    resp = await client.post(
        f"/api/matters/{slug}/reviews", json={"artifact_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_request_review_duplicate_pending(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    first = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    assert first.status_code == 201
    dup = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    assert dup.status_code == 409
    assert dup.json()["detail"]["error"] == "review_already_pending"


@pytest.mark.asyncio
async def test_owner_cannot_decide_own_review(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    created = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    review_id = created.json()["id"]
    resp = await client.post(
        f"/api/matters/{slug}/reviews/{review_id}/decide", json={"decision": "approve"}
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "reviewer_is_author"


@pytest.mark.asyncio
async def test_superuser_decides_approve_and_audits(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    created = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    review_id = created.json()["id"]

    reviewer = await _register_and_login(client, suffix="-su")
    await _promote_superuser(reviewer)
    await _login(client, reviewer)

    resp = await client.post(
        f"/api/matters/{slug}/reviews/{review_id}/decide", json={"decision": "approve"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "approved"

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(AuditEntry.action == "review.approved")
        )
        assert row is not None


@pytest.mark.asyncio
async def test_reject_requires_note(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    created = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    review_id = created.json()["id"]

    reviewer = await _register_and_login(client, suffix="-su")
    await _promote_superuser(reviewer)
    await _login(client, reviewer)

    resp = await client.post(
        f"/api/matters/{slug}/reviews/{review_id}/decide", json={"decision": "reject"}
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "note_required"


@pytest.mark.asyncio
async def test_cannot_decide_twice(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    created = await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    review_id = created.json()["id"]

    reviewer = await _register_and_login(client, suffix="-su")
    await _promote_superuser(reviewer)
    await _login(client, reviewer)

    first = await client.post(
        f"/api/matters/{slug}/reviews/{review_id}/decide", json={"decision": "approve"}
    )
    assert first.status_code == 200
    again = await client.post(
        f"/api/matters/{slug}/reviews/{review_id}/decide",
        json={"decision": "reject", "note": "too late"},
    )
    assert again.status_code == 409
    assert again.json()["detail"]["error"] == "review_already_decided"


@pytest.mark.asyncio
async def test_list_reviews(client) -> None:
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    await client.post(f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id})
    resp = await client.get(f"/api/matters/{slug}/reviews")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["reviews"]) == 1
    assert body["reviews"][0]["state"] == "pending"
