"""Professional Sign-Off v1 — API endpoint tests.

Covers the author sign-off gate: an author can sign their OWN output (no
reviewer≠author rule, no role gate), reasoning is required for
observations/rejected, the record is append-only with a derived
``is_current``, the artifact hash pins the payload, GET/{id} reloads, and
``output.signed`` lands in the audit trail.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import write_artifact
from app.core.signoff import compute_signoff_hash
from app.models import (
    AuditEntry,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)


@pytest.fixture(autouse=True)
def _writable_matters_root(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "matters_root", str(tmp_path), raising=False)


async def _register_and_login(client) -> str:
    email = f"pso-{uuid.uuid4().hex[:8]}@example.com"
    password = "professional-signoff-2026"
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
        data={"username": email, "password": "professional-signoff-2026"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _promote_superuser(email: str) -> None:
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()


async def _seed_matter_with_artifact(owner_email: str, *, kind: str = "skill_response"):
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"pso-{uuid.uuid4().hex[:8]}",
            title="PSO API Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="stub-echo",
            created_by_id=owner.id,
        )
        session.add(matter)
        await session.flush()
        artifact = await write_artifact(
            session,
            matter=matter,
            capability_id="summarise",
            module_id="demo.guided-skill",
            invocation_id=uuid.uuid4(),
            kind=kind,
            payload={"output": "A plain-English summary.", "model_id": "stub-echo"},
            actor_user_id=owner.id,
        )
        await session.commit()
        return matter.slug, str(artifact.id)


@pytest.mark.asyncio
async def test_author_can_sign_own_output(client) -> None:
    # The whole point: the author (artifact creator + matter owner) signs
    # their own AI-assisted output. No reviewer≠author rule, no role gate.
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)

    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["decision"] == "signed"
    assert body["is_current"] is True
    assert body["signer_email"] == email
    assert len(body["artifact_hash"]) == 64


@pytest.mark.asyncio
async def test_reasoning_required_for_observations_and_rejection(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)

    # signed_with_observations needs reasoning.
    r1 = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed_with_observations"},
    )
    assert r1.status_code == 422
    assert r1.json()["detail"]["error"] == "reasoning_required"

    r2 = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={
            "artifact_id": artifact_id,
            "decision": "signed_with_observations",
            "reasoning": "Para 2 overstates the limitation period; I'd verify the ACAS dates.",
        },
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["reasoning"].startswith("Para 2")

    # rejected needs reasoning too.
    r3 = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "rejected"},
    )
    assert r3.status_code == 422
    assert r3.json()["detail"]["error"] == "reasoning_required"


@pytest.mark.asyncio
async def test_invalid_decision_rejected(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)
    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "approve"},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "invalid_decision"


@pytest.mark.asyncio
async def test_append_only_history_marks_only_latest_current(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)

    first = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "rejected", "reasoning": "Needs work."},
    )
    assert first.status_code == 201
    first_id = first.json()["id"]
    second = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert second.status_code == 201
    second_id = second.json()["id"]

    listing = await client.get(f"/api/matters/{slug}/signoffs")
    assert listing.status_code == 200
    rows = {s["id"]: s for s in listing.json()["signoffs"]}
    # Both kept (append-only), only the latest is current.
    assert first_id in rows and second_id in rows
    assert rows[second_id]["is_current"] is True
    assert rows[first_id]["is_current"] is False

    # GET /{id} reloads a single sign-off stably (confirmation page).
    one = await client.get(f"/api/matters/{slug}/signoffs/{first_id}")
    assert one.status_code == 200
    assert one.json()["id"] == first_id
    assert one.json()["is_current"] is False


@pytest.mark.asyncio
async def test_hash_pins_canonical_payload(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)
    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    signed_hash = resp.json()["artifact_hash"]

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        artifact = await session.scalar(
            select(MatterArtifact).where(MatterArtifact.id == uuid.UUID(artifact_id))
        )
        assert signed_hash == compute_signoff_hash(artifact)


@pytest.mark.asyncio
async def test_signoff_emits_output_signed_audit(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)
    await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(select(Matter).where(Matter.slug == slug))
        actions = set(
            (
                await session.execute(
                    select(AuditEntry.action).where(AuditEntry.matter_id == matter.id)
                )
            )
            .scalars()
            .all()
        )
    assert "output.signed" in actions


@pytest.mark.asyncio
async def test_non_owner_superuser_cannot_sign_someone_elses_output(client) -> None:
    # Professional sign-off is personal ownership, not an admin override.
    # Even a workspace superuser must not sign another user's matter output.
    owner = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(owner)
    superuser = await _register_and_login(client)
    await _promote_superuser(superuser)
    await _login(client, superuser)

    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert resp.status_code == 404
