"""Guided Demo Loop v1 — ensure + keyless end-to-end run.

Proves the demo provisions real substrate and runs WITHOUT a provider key
(stub-echo is a genuine keyless provider). Nothing is stubbed here — the
invocation goes through the real endpoint, prompt runtime, grants, posture,
advice-boundary, artifact write, and audit chain.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.demo_loop import DEMO_CAPABILITY_ID, DEMO_MATTER_SLUG, DEMO_MODULE_ID
from app.models import AuditEntry, MatterArtifact, Matter, User


async def _register_login(client) -> str:
    email = f"demo-{uuid.uuid4().hex[:8]}@example.com"
    password = "guided-demo-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    from app.main import app

    async with app.state.session_factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        # qualified_solicitor passes the advice-boundary gate at draft_advice
        # when firm-role gates are enforced (pytest forces them on).
        u.role = "qualified_solicitor"
        await session.commit()
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


@pytest.mark.asyncio
async def test_ensure_is_idempotent(client) -> None:
    await _register_login(client)
    r1 = await client.post("/api/demo/guided-loop")
    assert r1.status_code == 200, r1.text
    h1 = r1.json()
    assert h1["matter_slug"] == DEMO_MATTER_SLUG
    assert h1["module_id"] == DEMO_MODULE_ID
    assert h1["model_id"] == "stub-echo"

    r2 = await client.post("/api/demo/guided-loop")
    assert r2.status_code == 200, r2.text
    h2 = r2.json()
    # Same matter + document — no duplicate provisioning.
    assert h2["matter_slug"] == h1["matter_slug"]
    assert h2["document_id"] == h1["document_id"]


@pytest.mark.asyncio
async def test_guided_loop_runs_keyless_end_to_end(client) -> None:
    await _register_login(client)
    handles = (await client.post("/api/demo/guided-loop")).json()
    slug = handles["matter_slug"]

    # Run the demo skill — NO gateway stub, NO provider key. stub-echo
    # produces real output keylessly.
    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": DEMO_MODULE_ID,
            "capability_id": DEMO_CAPABILITY_ID,
            "args": {"document_id": handles["document_id"], "input": "Summarise this."},
        },
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()["result"]
    assert result["artifact_kind"] == "skill_response"
    assert result["output_chars"] > 0

    from app.main import app

    async with app.state.session_factory() as session:
        matter = await session.scalar(select(Matter).where(Matter.slug == slug))
        artifact = await session.scalar(
            select(MatterArtifact).where(
                MatterArtifact.matter_id == matter.id,
                MatterArtifact.kind == "skill_response",
            )
        )
        assert artifact is not None
        actions = set(
            (
                await session.execute(
                    select(AuditEntry.action).where(AuditEntry.matter_id == matter.id)
                )
            )
            .scalars()
            .all()
        )
    # Real governed chain.
    assert "module.capability.invoked" in actions
    assert "model.invoked" in actions
    assert "module.capability.completed" in actions


@pytest.mark.asyncio
async def test_review_requestable_but_author_cannot_self_approve(client) -> None:
    # The demo user runs the skill (author) and can REQUEST review, but the
    # review substrate forbids self-approval — the separation-of-duties
    # guarantee the guided UI surfaces rather than fakes.
    await _register_login(client)
    handles = (await client.post("/api/demo/guided-loop")).json()
    slug = handles["matter_slug"]
    run = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": DEMO_MODULE_ID,
            "capability_id": DEMO_CAPABILITY_ID,
            "args": {"document_id": handles["document_id"]},
        },
    )
    artifact_id = run.json()["result"]["artifact_id"]

    requested = await client.post(
        f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id}
    )
    assert requested.status_code == 201, requested.text
    review = requested.json()
    assert review["state"] == "pending"
    assert review["kind"] == "skill_response"

    # Author cannot decide their own review.
    decided = await client.post(
        f"/api/matters/{slug}/reviews/{review['id']}/decide",
        json={"decision": "approve"},
    )
    assert decided.status_code == 403, decided.text
    assert decided.json()["detail"]["error"] == "reviewer_is_author"
