"""Per-matter workflows catalogue coverage.

Exercises `GET /api/matters/{slug}/workflows`. The endpoint derives grant,
availability, last_run_at on every call; no denorm. Tests focus on:
    1. Shape contract (every workflow has the expected keys).
    2. Grant derivation (no grants -> blocked; partial grants -> partial;
       full grants -> granted).
    3. Posture derivation (C_paused blocks model.invoke workflows).
    4. Matter ownership scope (404 for someone else's slug).
    5. last_run_at sourced from the audit log (no denorm table).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select

from app.models import (
    AuditEntry,
    Matter,
    User,
    WorkspaceSkillCapabilityGrant,
)


EMAIL_A = "wf-route-a@example.com"
PASSWORD_A = "wf-route-password-2026"
EMAIL_B = "wf-route-b@example.com"
PASSWORD_B = "wf-route-password-2026"


async def _signup_and_login(client, email: str, password: str) -> None:
    reg = await client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


async def _new_matter(client, title: str = "Test matter") -> str:
    resp = await client.post(
        "/api/matters",
        json={
            "title": title,
            "matter_type": "civil",
            "cause": "test",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["slug"]


@pytest.mark.asyncio
async def test_workflows_shape_and_default_blocked(client, db_session) -> None:
    """A fresh user with no capability grants sees every workflow as blocked
    by grant."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client)

    # Strip auto-grants so we exercise the no-grants path. The signup flow
    # auto-grants the declared capabilities from every installed skill;
    # zero out the grants table for this user to test the blocked path.
    user = await db_session.scalar(select(User).where(User.email == EMAIL_A))
    await db_session.execute(
        delete(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert "workflows" in body
    workflows = body["workflows"]
    assert len(workflows) == 5
    keys = {w["key"] for w in workflows}
    assert keys == {"premotion", "letters", "contract-review", "reviews", "research"}

    expected_fields = {
        "key",
        "title",
        "description",
        "declared_capabilities",
        "granted_capabilities",
        "grant",
        "last_run_at",
        "availability",
        "reason",
    }
    for w in workflows:
        assert set(w.keys()) == expected_fields
        assert w["grant"] == "blocked"
        assert w["granted_capabilities"] == []
        assert w["availability"] == "blocked-by-grant"
        assert w["last_run_at"] is None


@pytest.mark.asyncio
async def test_workflows_grant_derivation(client, db_session) -> None:
    """Granting the full declared set for a workflow flips grant to
    `granted` and availability to `ok` under default B_mixed posture."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client)
    user = await db_session.scalar(select(User).where(User.email == EMAIL_A))

    await db_session.execute(
        delete(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id
        )
    )

    # Letters needs: matter.read, chronology.read, document.generated.write,
    # model.invoke. Use a sentinel (plugin, skill) - the endpoint reads
    # the capability column only and unions across rows.
    for cap in [
        "matter.read",
        "chronology.read",
        "document.generated.write",
        "model.invoke",
    ]:
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                user_id=user.id,
                plugin="test-plugin",
                skill="test-skill",
                capability=cap,
            )
        )
    await db_session.commit()

    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 200
    workflows = {w["key"]: w for w in resp.json()["workflows"]}

    letters = workflows["letters"]
    assert letters["grant"] == "granted"
    assert letters["availability"] == "ok"
    assert letters["reason"] is None
    assert set(letters["granted_capabilities"]) == set(letters["declared_capabilities"])

    # Premotion declares chronology.read AND document.body.read; the
    # grant set above is missing document.body.read so partial.
    premotion = workflows["premotion"]
    assert premotion["grant"] == "partial"
    assert premotion["availability"] == "blocked-by-grant"
    assert "document.body.read" in (premotion["reason"] or "")


@pytest.mark.asyncio
async def test_workflows_blocked_by_posture(client, db_session) -> None:
    """C_paused matter blocks every workflow with model.invoke even if
    fully granted."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client)
    user = await db_session.scalar(select(User).where(User.email == EMAIL_A))

    # Grant the union of every workflow's declared capabilities (runtime
    # vocabulary only, post-reviewer-fix) so grant would normally read
    # as `granted` for all five.
    full_set = {
        "matter.read",
        "document.body.read",
        "document.generated.write",
        "chronology.read",
        "model.invoke",
        "citation.write",
    }
    for cap in full_set:
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                user_id=user.id,
                plugin="test-plugin",
                skill="test-skill",
                capability=cap,
            )
        )
    await db_session.commit()

    # Flip the matter posture to C_paused.
    flip = await client.patch(
        f"/api/matters/{slug}/privilege",
        json={"privilege_posture": "C_paused"},
    )
    assert flip.status_code == 200, flip.text

    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 200
    for w in resp.json()["workflows"]:
        # Every workflow declares model.invoke, so all must be blocked
        # by posture under C_paused.
        assert "model.invoke" in w["declared_capabilities"]
        assert w["availability"] == "blocked-by-posture"
        assert w["reason"] == "posture C_paused refuses cloud model calls"


@pytest.mark.asyncio
async def test_workflows_last_run_at_from_audit(client, db_session) -> None:
    """An audit row with `module=letters` populates last_run_at on the
    letters workflow. No denorm; pure audit-log read."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client)
    user = await db_session.scalar(select(User).where(User.email == EMAIL_A))
    matter = await db_session.scalar(select(Matter).where(Matter.slug == slug))

    ts = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.add(
        AuditEntry(
            id=uuid.uuid4(),
            timestamp=ts,
            actor_id=user.id,
            matter_id=matter.id,
            action="letters.draft",
            module="letters",
            resource_type="matter",
            resource_id=str(matter.id),
            payload={},
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 200
    workflows = {w["key"]: w for w in resp.json()["workflows"]}
    letters = workflows["letters"]
    assert letters["last_run_at"] is not None
    # Other workflows must remain null - no cross-contamination.
    for key in ("premotion", "contract-review", "reviews", "research"):
        assert workflows[key]["last_run_at"] is None


@pytest.mark.asyncio
async def test_workflows_scoped_to_matter_owner(client) -> None:
    """User B cannot read User A's matter workflows. 404, not 403, to
    avoid leaking matter existence."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client, title="A's matter")

    await client.post("/auth/logout")
    await _signup_and_login(client, EMAIL_B, PASSWORD_B)

    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_workflow_declared_capabilities_match_runtime_vocabulary(client) -> None:
    """Every workflow's `declared_capabilities` must be a subset of the
    runtime vocabulary in `app.core.capabilities.CAPABILITY_VOCABULARY`.

    Reviewer P1: audit emission is mandatory provenance (not revocable);
    descriptive metadata like "writes review table" / "uses network"
    belongs in `description`, not `declared_capabilities`.
    """
    from app.core.capabilities import CAPABILITY_VOCABULARY

    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client)

    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 200

    for w in resp.json()["workflows"]:
        stray = set(w["declared_capabilities"]) - CAPABILITY_VOCABULARY
        assert stray == set(), (
            f"workflow {w['key']} declares non-runtime capabilities: {sorted(stray)}"
        )


@pytest.mark.asyncio
async def test_workflows_grant_values_never_include_not_installed(client) -> None:
    """v0.1: workflows are built-in in-app pipelines; the endpoint always
    returns the same five and `not-installed` is intentionally absent
    from the response enum. Regression guard against re-introduction."""
    await _signup_and_login(client, EMAIL_A, PASSWORD_A)
    slug = await _new_matter(client)
    resp = await client.get(f"/api/matters/{slug}/workflows")
    assert resp.status_code == 200
    for w in resp.json()["workflows"]:
        assert w["grant"] != "not-installed"
        assert w["availability"] != "not-installed"
