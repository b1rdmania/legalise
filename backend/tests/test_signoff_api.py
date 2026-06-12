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
    # The record states the relationship: author self-sign is labelled, not hidden.
    assert body["signer_is_author"] is True


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
        # M13: the decision payload always carries the review-window
        # fields. No open-event here → review_seconds None, no flag.
        signed_row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.matter_id == matter.id,
                AuditEntry.action == "output.signed",
            )
        )
        assert signed_row.payload["review_seconds"] is None
        assert signed_row.payload["implausible_speed"] is False
    assert "output.signed" in actions


# --- Author≠signer rule (SIGNOFF_AUTHOR_MUST_DIFFER) -----------------------


def test_author_must_differ_defaults_off() -> None:
    # Default False preserves the sole-practitioner hero loop
    # (author self-sign, covered by test_author_can_sign_own_output).
    from app.core.config import Settings

    assert Settings().signoff_author_must_differ is False


@pytest.mark.asyncio
async def test_author_must_differ_blocks_self_sign(client, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "signoff_author_must_differ", True, raising=False)
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)

    for decision, reasoning in (
        ("signed", None),
        ("signed_with_observations", "Para 2 needs a second look."),
    ):
        resp = await client.post(
            f"/api/matters/{slug}/signoffs",
            json={
                "artifact_id": artifact_id,
                "decision": decision,
                **({"reasoning": reasoning} if reasoning else {}),
            },
        )
        assert resp.status_code == 403, resp.text
        detail = resp.json()["detail"]
        assert detail["error"] == "author_cannot_sign"
        assert "someone else" in detail["message"]

    # No sign-off row and no output.* audit row from the blocked attempts.
    from app.main import app
    from app.models import MatterSignoff

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(select(Matter).where(Matter.slug == slug))
        signoffs = (
            await session.execute(
                select(MatterSignoff).where(MatterSignoff.matter_id == matter.id)
            )
        ).scalars().all()
        assert signoffs == []
        actions = set(
            (
                await session.execute(
                    select(AuditEntry.action).where(AuditEntry.matter_id == matter.id)
                )
            )
            .scalars()
            .all()
        )
        assert not any(a.startswith("output.") for a in actions)


@pytest.mark.asyncio
async def test_author_must_differ_still_allows_self_rejection(client, monkeypatch) -> None:
    # Refusal is always permitted: the rule blocks taking ownership of
    # your own work, not refusing to.
    from app.core.config import settings

    monkeypatch.setattr(settings, "signoff_author_must_differ", True, raising=False)
    email = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(email)

    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={
            "artifact_id": artifact_id,
            "decision": "rejected",
            "reasoning": "I do not stand behind this draft.",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["decision"] == "rejected"
    assert body["signer_is_author"] is True

    # The rejection audit row lands as normal — the rule changes nothing
    # about what a permitted decision records.
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
    assert "output.sign_rejected" in actions
    assert "output.signed" not in actions


@pytest.mark.asyncio
async def test_author_must_differ_allows_non_author_signer(client, monkeypatch) -> None:
    # Service-level: with the rule on, a different user signing someone
    # else's artifact is allowed (matters are owner-only at the API layer,
    # so the four-eyes path exercises the service directly).
    from app.core.config import settings
    from app.core.signoff import create_signoff

    monkeypatch.setattr(settings, "signoff_author_must_differ", True, raising=False)
    author = await _register_and_login(client)
    slug, artifact_id = await _seed_matter_with_artifact(author)
    reviewer = await _register_and_login(client)

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(select(Matter).where(Matter.slug == slug))
        artifact = await session.scalar(
            select(MatterArtifact).where(MatterArtifact.id == uuid.UUID(artifact_id))
        )
        reviewer_user = await session.scalar(select(User).where(User.email == reviewer))
        signoff = await create_signoff(
            session,
            matter=matter,
            artifact=artifact,
            user=reviewer_user,
            decision="signed",
        )
        await session.commit()
        assert signoff.signer_id == reviewer_user.id
        assert artifact.created_by_id != reviewer_user.id


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
