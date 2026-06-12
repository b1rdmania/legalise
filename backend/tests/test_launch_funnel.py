"""Gate 4 — GET /api/admin/launch-funnel (the 90-day falsifier counts).

Coverage:
- non-superuser → 403
- signup buckets (persona / domain-class / channel) are exhaustive and
  sum to the total
- golden-loop counts: the auto-seeded Khan copy is excluded from
  "matters created"; affirmative sign-offs count; rejected ones do not
- the provenance-issues slice is explicitly manual (no GitHub token)
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.seed import KHAN_SLUG
from app.models import Matter, User
from app.models.matter_artifact import MatterArtifact
from app.models.matter_signoff import (
    SIGNOFF_REJECTED,
    SIGNOFF_SIGNED,
    MatterSignoff,
)


PASSWORD = "launch-funnel-2026"


async def _register(client, email: str, **extra) -> None:
    resp = await client.post(
        "/auth/register", json={"email": email, "password": PASSWORD, **extra}
    )
    assert resp.status_code == 201, resp.text


async def _login(client, email: str) -> None:
    resp = await client.post(
        "/auth/login",
        data={"username": email, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 204, resp.text


async def _promote(db_session, email: str) -> None:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.is_superuser = True
    await db_session.flush()


async def _insert_signoff(db_session, matter: Matter, signer: User, decision: str) -> None:
    invocation_id = uuid.uuid4()
    artifact = MatterArtifact(
        matter_id=matter.id,
        module_id="examples.test",
        capability_id="examples.test.capability",
        invocation_id=invocation_id,
        kind="letter",
        storage_path=f"artifacts/{invocation_id}.json",
        created_by_id=signer.id,
        size_bytes=128,
    )
    db_session.add(artifact)
    await db_session.flush()
    db_session.add(
        MatterSignoff(
            matter_id=matter.id,
            artifact_id=artifact.id,
            invocation_id=invocation_id,
            module_id="examples.test",
            capability_id="examples.test.capability",
            kind="letter",
            artifact_hash="0" * 64,
            decision=decision,
            reasoning="test reasoning" if decision == SIGNOFF_REJECTED else None,
            signer_id=signer.id,
        )
    )
    await db_session.flush()


@pytest.mark.asyncio
async def test_launch_funnel_requires_superuser(client) -> None:
    email = "funnel-non-admin@example.com"
    await _register(client, email)
    await _login(client, email)
    resp = await client.get("/api/admin/launch-funnel")
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_launch_funnel_requires_auth(client) -> None:
    resp = await client.get("/api/admin/launch-funnel")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_launch_funnel_counts(client, db_session) -> None:
    # Three real signups with mixed capture fields.
    await _register(
        client,
        "funnel-a@smithlaw.co.uk",
        persona="practising_solicitor",
        channel="hn",
    )
    await _register(client, "funnel-b@gmail.com", persona="engineer", channel="hn")
    await _register(client, "funnel-c@example.com")  # untagged / unspecified

    # User A creates their own matter and signs one output; also a
    # rejected sign-off that must NOT count.
    await _login(client, "funnel-a@smithlaw.co.uk")
    create = await client.post("/api/matters", json={"title": "Funnel Test Matter"})
    assert create.status_code == 201, create.text

    user_a = await db_session.scalar(
        select(User).where(User.email == "funnel-a@smithlaw.co.uk")
    )
    matter = await db_session.scalar(
        select(Matter).where(
            Matter.created_by_id == user_a.id, Matter.slug != KHAN_SLUG
        )
    )
    assert matter is not None
    await _insert_signoff(db_session, matter, user_a, SIGNOFF_SIGNED)
    await _insert_signoff(db_session, matter, user_a, SIGNOFF_REJECTED)

    # Promote an operator and read the funnel.
    await client.post("/auth/logout")
    await _register(client, "funnel-operator@example.com")
    await _promote(db_session, "funnel-operator@example.com")
    await _login(client, "funnel-operator@example.com")

    resp = await client.get("/api/admin/launch-funnel")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    signups = body["signups"]
    assert signups["total"] == 4  # a, b, c, operator
    assert signups["by_persona"]["practising_solicitor"] == 1
    assert signups["by_persona"]["engineer"] == 1
    assert signups["by_persona"]["unspecified"] == 2
    assert sum(signups["by_persona"].values()) == signups["total"]

    assert signups["by_channel"]["hn"] == 2
    assert signups["by_channel"]["untagged"] == 2
    assert sum(signups["by_channel"].values()) == signups["total"]

    # smithlaw + example.com (funnel-c, operator) — heuristic says
    # "not a known generic mailbox", which is all firm-like claims.
    assert signups["by_domain_class"]["firm-like"] == 3
    assert signups["by_domain_class"]["generic"] == 1  # gmail
    assert sum(signups["by_domain_class"].values()) == signups["total"]

    loop = body["golden_loop"]
    # Each register auto-seeds a Khan copy in dev — must be excluded.
    assert loop["matters_created"] == 1
    assert loop["users_who_created_a_matter"] == 1
    # One affirmative sign-off; the rejected one does not count.
    assert loop["outputs_signed"] == 1
    assert loop["users_who_signed_an_output"] == 1
    assert loop["outputs_signed_on_seeded_sample"] == 0

    assert body["provenance_issues"]["source"] == "manual"
    assert "gh issue list" in body["provenance_issues"]["note"]
