"""Supervision made legible (M12+M13) — review latency, the
implausible-speed flag, and the E2 per-signer diagnostic.

Spec: docs/spec/SUPERVISION_LEGIBILITY_M13.md. The review window is the
signer's first open of the sign surface (``output.review.opened``,
idempotent) → the sign-off decision; latency is derived from the two
audit rows at read time. The implausible-speed threshold lives in one
constant with its rationale; a missing open-event reads as None ("—"),
never 0.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import write_artifact
from app.core.signoff import (
    IMPLAUSIBLE_SPEED_FLOOR_SECONDS,
    REVIEW_OPENED_ACTION,
    count_payload_words,
    implausible_speed_threshold_seconds,
    review_latency_seconds,
)
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


# --- Unit: threshold + word count + latency derivation ----------------------


def test_threshold_floor_applies_to_small_outputs() -> None:
    # Below the floor the 0.15 s/word slope is irrelevant: tiny outputs
    # never make a sub-2-minute signature "plausible".
    assert implausible_speed_threshold_seconds(0) == IMPLAUSIBLE_SPEED_FLOOR_SECONDS
    assert implausible_speed_threshold_seconds(100) == IMPLAUSIBLE_SPEED_FLOOR_SECONDS


def test_threshold_scales_at_quarter_of_economics_baseline() -> None:
    # 10 min / 1,000 words × 0.25 = 0.15 s/word. 4,000 words → 600s.
    assert implausible_speed_threshold_seconds(4000) == pytest.approx(600.0)
    # 1,000 words → 150s (above the 120s floor).
    assert implausible_speed_threshold_seconds(1000) == pytest.approx(150.0)


def test_count_payload_words_walks_strings_only() -> None:
    payload = {
        "output": "one two three",
        "claims": [{"text": "four five"}, {"text": "six"}],
        "n_tokens": 12345,  # numbers don't cost review time
        "nested": {"deep": ["seven eight"]},
    }
    assert count_payload_words(payload) == 8


def test_latency_none_for_missing_open_or_negative_delta() -> None:
    now = datetime.now(UTC)
    # Missing open-event (legacy sign-off): None — renders "—", never 0.
    assert review_latency_seconds(None, now) is None
    # Clock skew / backfill: a negative window is not a 0-second review.
    assert review_latency_seconds(now + timedelta(seconds=5), now) is None
    # The happy path is whole seconds.
    assert review_latency_seconds(now - timedelta(seconds=94), now) == 94


# --- API helpers -------------------------------------------------------------


async def _register_and_login(client) -> str:
    email = f"m13-{uuid.uuid4().hex[:8]}@example.com"
    password = "supervision-legibility-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _seed_matter_with_artifact(owner_email: str):
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == owner_email))
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"m13-{uuid.uuid4().hex[:8]}",
            title="M13 Supervision Test",
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
            kind="skill_response",
            payload={"output": "A plain-English summary.", "model_id": "stub-echo"},
            actor_user_id=owner.id,
        )
        await session.commit()
        return matter.slug, str(artifact.id), owner.id


async def _open_row_count(artifact_id: str) -> int:
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        rows = (
            await session.execute(
                select(AuditEntry).where(
                    AuditEntry.action == REVIEW_OPENED_ACTION,
                    AuditEntry.resource_id == artifact_id,
                )
            )
        ).scalars().all()
        return len(rows)


async def _backdate_open_row(artifact_id: str, owner_id, matter_slug: str, *, seconds_ago: int) -> None:
    """Insert an open-event ``seconds_ago`` in the past.

    Audit rows are WORM (no UPDATE), so a long review window is staged
    by inserting the open row with an explicit historical timestamp.
    """
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(select(Matter).where(Matter.slug == matter_slug))
        session.add(
            AuditEntry(
                actor_id=owner_id,
                matter_id=matter.id,
                action=REVIEW_OPENED_ACTION,
                module="demo.guided-skill",
                resource_type="matter_artifact",
                resource_id=artifact_id,
                timestamp=datetime.now(UTC) - timedelta(seconds=seconds_ago),
                payload={"artifact_id": artifact_id},
            )
        )
        await session.commit()


# --- The idempotent open row -------------------------------------------------


@pytest.mark.asyncio
async def test_review_open_idempotent_first_open_wins(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id, _ = await _seed_matter_with_artifact(email)

    r1 = await client.post(
        f"/api/matters/{slug}/signoffs/review-open",
        json={"artifact_id": artifact_id},
    )
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"artifact_id": artifact_id, "recorded": True}

    r2 = await client.post(
        f"/api/matters/{slug}/signoffs/review-open",
        json={"artifact_id": artifact_id},
    )
    assert r2.status_code == 200
    assert r2.json()["recorded"] is False

    # Exactly one output.review.opened row — first open wins.
    assert await _open_row_count(artifact_id) == 1


@pytest.mark.asyncio
async def test_review_open_unknown_artifact_404(client) -> None:
    email = await _register_and_login(client)
    slug, _, _ = await _seed_matter_with_artifact(email)
    resp = await client.post(
        f"/api/matters/{slug}/signoffs/review-open",
        json={"artifact_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404


# --- Latency derivation + implausible flag on sign ---------------------------


@pytest.mark.asyncio
async def test_fast_sign_after_open_is_flagged_implausible(client) -> None:
    # Open then sign within the same breath: under the 120s floor for a
    # tiny payload → implausible_speed True, recorded on the audit
    # payload AND surfaced on the API read. Recorded, not blocked.
    email = await _register_and_login(client)
    slug, artifact_id, _ = await _seed_matter_with_artifact(email)

    await client.post(
        f"/api/matters/{slug}/signoffs/review-open",
        json={"artifact_id": artifact_id},
    )
    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["review_seconds"] is not None
    assert 0 <= body["review_seconds"] < IMPLAUSIBLE_SPEED_FLOOR_SECONDS
    assert body["implausible_speed"] is True

    # The flag + latency live on the output.signed audit payload.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "output.signed",
                AuditEntry.resource_id == body["id"],
            )
        )
        assert row is not None
        assert row.payload["implausible_speed"] is True
        assert row.payload["review_seconds"] == body["review_seconds"]

    # GET /{id} (the confirmation page's read) carries the same fields.
    one = await client.get(f"/api/matters/{slug}/signoffs/{body['id']}")
    assert one.status_code == 200
    assert one.json()["implausible_speed"] is True
    assert one.json()["review_seconds"] == body["review_seconds"]


@pytest.mark.asyncio
async def test_unhurried_sign_is_not_flagged(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id, owner_id = await _seed_matter_with_artifact(email)
    await _backdate_open_row(artifact_id, owner_id, slug, seconds_ago=15 * 60)

    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # ~15 minutes of review, derived from the backdated open row.
    assert body["review_seconds"] >= 14 * 60
    assert body["implausible_speed"] is False


@pytest.mark.asyncio
async def test_missing_open_event_yields_null_latency_and_no_flag(client) -> None:
    # Legacy path: sign without ever opening the sign surface. Latency
    # is None (renders "—", never 0) and nothing is accused.
    email = await _register_and_login(client)
    slug, artifact_id, _ = await _seed_matter_with_artifact(email)

    resp = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["review_seconds"] is None
    assert resp.json()["implausible_speed"] is False

    listing = await client.get(f"/api/matters/{slug}/signoffs")
    row = listing.json()["signoffs"][0]
    assert row["review_seconds"] is None
    assert row["implausible_speed"] is False


@pytest.mark.asyncio
async def test_listing_derives_latency_from_the_two_audit_rows(client) -> None:
    email = await _register_and_login(client)
    slug, artifact_id, owner_id = await _seed_matter_with_artifact(email)
    await _backdate_open_row(artifact_id, owner_id, slug, seconds_ago=10 * 60)

    await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "rejected", "reasoning": "No."},
    )
    listing = await client.get(f"/api/matters/{slug}/signoffs")
    row = listing.json()["signoffs"][0]
    assert row["review_seconds"] is not None
    assert row["review_seconds"] >= 9 * 60


# --- E2: the per-signer supervision diagnostic --------------------------------


async def _promote_superuser(email: str) -> None:
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()


@pytest.mark.asyncio
async def test_supervision_diagnostic_requires_superuser(client) -> None:
    await _register_and_login(client)
    resp = await client.get("/api/admin/audit/supervision")
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "admin_required"


@pytest.mark.asyncio
async def test_supervision_diagnostic_reports_per_signer_rates(client) -> None:
    email = await _register_and_login(client)
    slug, a1, owner_id = await _seed_matter_with_artifact(email)
    _, a2, _ = await _seed_matter_with_artifact(email)  # second matter+artifact

    # One unhurried sign, one quick rejection — both with open rows.
    await _backdate_open_row(a1, owner_id, slug, seconds_ago=12 * 60)
    await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": a1, "decision": "signed"},
    )
    # Find the second matter's slug from the seeded artifact.
    from app.main import app
    from app.models import MatterArtifact

    factory = app.state.session_factory
    async with factory() as session:
        artifact2 = await session.scalar(
            select(MatterArtifact).where(MatterArtifact.id == uuid.UUID(a2))
        )
        matter2 = await session.scalar(
            select(Matter).where(Matter.id == artifact2.matter_id)
        )
        slug2 = matter2.slug
    await client.post(
        f"/api/matters/{slug2}/signoffs/review-open", json={"artifact_id": a2}
    )
    await client.post(
        f"/api/matters/{slug2}/signoffs",
        json={"artifact_id": a2, "decision": "rejected", "reasoning": "Not sound."},
    )

    await _promote_superuser(email)
    resp = await client.get("/api/admin/audit/supervision")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["healthy_band"] == [0.02, 0.30]

    row = next(r for r in body["signers"] if r["signer_email"] == email)
    assert row["signed"] == 1
    assert row["rejected"] == 1
    assert row["total"] == 2
    assert row["scrutiny_rate"] == pytest.approx(0.5)
    # Both decisions have derivable windows; the median is real.
    assert row["latency_n"] == 2
    assert row["median_review_seconds"] is not None
    assert row["median_review_seconds"] > 0
