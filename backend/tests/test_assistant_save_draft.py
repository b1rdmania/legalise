"""Save-as-draft on assistant messages — API tests.

The chat surface's exit into the product's core loop: an assistant reply
becomes a `chat_draft` matter artifact carrying provenance (source
message id, model, hashes, retrieval sources), and that artifact flows
through the EXISTING review + sign-off endpoints with no special-casing.

Covers:
  - save creates the artifact with full provenance payload + audit row
  - idempotency (second save returns the same artifact, 200)
  - user-role messages are refused (422)
  - archived (tombstoned) matters 404 — same guard as other chat writes
  - cross-user 404
  - keyless / extractive replies (model_used is null) save fine
  - the full walk: message → draft → supervisor review → sign-off
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import AuditEntry, Matter, MatterArtifact, User
from app.models.assistant import AssistantMessage as AssistantMessageRow


PASSWORD = "save-draft-tests-2026"


@pytest.fixture(autouse=True)
def _writable_matters_root(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "matters_root", str(tmp_path), raising=False)


async def _register_and_login(client) -> str:
    email = f"draft-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": PASSWORD})
    await client.post(
        "/auth/login",
        data={"username": email, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _login(client, email: str) -> None:
    await client.post(
        "/auth/login",
        data={"username": email, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _create_matter(client) -> str:
    resp = await client.post(
        "/api/matters",
        json={"title": f"Draft test {uuid.uuid4().hex[:6]}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["slug"]


async def _seed_assistant_message(
    slug: str,
    *,
    role: str = "assistant",
    content: str = "Draft grounds of resistance based on the ET3.",
    model_used: str | None = "claude-sonnet-4-6",
    sources: list | None = None,
) -> str:
    """Insert a persisted message row directly — no model call needed."""
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(select(Matter).where(Matter.slug == slug))
        row = AssistantMessageRow(
            matter_id=matter.id,
            actor_id=matter.created_by_id,
            role=role,
            content=content,
            model_used=model_used if role == "assistant" else None,
            prompt_hash="a" * 64 if role == "assistant" else None,
            response_hash="b" * 64 if role == "assistant" else None,
            sources=sources or [],
        )
        session.add(row)
        await session.commit()
        return str(row.id)


@pytest.mark.asyncio
async def test_save_draft_creates_artifact_with_provenance(client) -> None:
    email = await _register_and_login(client)
    slug = await _create_matter(client)
    sources = [
        {
            "document_id": str(uuid.uuid4()),
            "title": "et3-response.pdf",
            "snippet": "The claimant was dismissed for gross misconduct.",
            "char_start": 10,
            "char_end": 58,
            "score": 0.91,
        }
    ]
    message_id = await _seed_assistant_message(slug, sources=sources)

    resp = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "chat_draft"
    assert body["already_existed"] is False
    artifact_id = body["artifact_id"]

    # The draft is a first-class matter artifact, readable via the
    # existing artifacts API, with the chat provenance in the payload.
    read = await client.get(f"/api/matters/{slug}/artifacts/{artifact_id}")
    assert read.status_code == 200, read.text
    art = read.json()
    assert art["kind"] == "chat_draft"
    assert art["module_id"] == "assistant"
    assert art["capability_id"] == "assistant.save_draft"
    assert art["invocation_id"] == message_id
    payload = art["payload"]
    assert payload["output"].startswith("Draft grounds of resistance")
    assert payload["model_id"] == "claude-sonnet-4-6"
    assert payload["source_message_id"] == message_id
    assert payload["prompt_hash"] == "a" * 64
    assert payload["response_hash"] == "b" * 64
    assert payload["sources"] == sources
    assert payload["source_anchors"][0]["document_id"] == sources[0]["document_id"]
    assert payload["source_anchors"][0]["quote"] == sources[0]["snippet"]

    # Supervision legibility: the audit trail states the draft came from
    # an AI chat message.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        entry = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "assistant.draft.saved",
                AuditEntry.resource_id == artifact_id,
            )
        )
        assert entry is not None
        assert entry.payload["source_message_id"] == message_id
        assert entry.payload["model_used"] == "claude-sonnet-4-6"
        assert entry.payload["source_count"] == 1
        user = await session.scalar(select(User).where(User.email == email))
        assert entry.actor_id == user.id


@pytest.mark.asyncio
async def test_save_draft_is_idempotent_per_message(client) -> None:
    await _register_and_login(client)
    slug = await _create_matter(client)
    message_id = await _seed_assistant_message(slug)

    first = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert first.status_code == 201
    second = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert second.status_code == 200
    assert second.json()["already_existed"] is True
    assert second.json()["artifact_id"] == first.json()["artifact_id"]

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        count = len(
            (
                await session.scalars(
                    select(MatterArtifact).where(
                        MatterArtifact.invocation_id == uuid.UUID(message_id)
                    )
                )
            ).all()
        )
        assert count == 1


@pytest.mark.asyncio
async def test_user_messages_cannot_be_saved(client) -> None:
    await _register_and_login(client)
    slug = await _create_matter(client)
    message_id = await _seed_assistant_message(
        slug, role="user", content="Please draft the response."
    )
    resp = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_missing_message_is_404(client) -> None:
    await _register_and_login(client)
    slug = await _create_matter(client)
    resp = await client.post(
        f"/api/matters/{slug}/assistant/messages/{uuid.uuid4()}/save-draft"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_archived_matter_is_404(client) -> None:
    # Tombstone guard: same resolve_owned_open_matter gate as every other
    # chat write. No drafts on deleted matters.
    await _register_and_login(client)
    slug = await _create_matter(client)
    message_id = await _seed_assistant_message(slug)
    deleted = await client.delete(f"/api/matters/{slug}")
    assert deleted.status_code in (200, 204), deleted.text

    resp = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cross_user_is_404(client) -> None:
    await _register_and_login(client)
    slug = await _create_matter(client)
    message_id = await _seed_assistant_message(slug)

    await _register_and_login(client)  # second user, fresh session cookie
    resp = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_keyless_extractive_reply_saves_with_null_model(client) -> None:
    # Keyless / stub matters: any persisted assistant message can be
    # saved; provenance records what happened (no model), nothing gates.
    await _register_and_login(client)
    slug = await _create_matter(client)
    message_id = await _seed_assistant_message(
        slug,
        content="Extracted summary of the bundle (no model).",
        model_used=None,
    )
    resp = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert resp.status_code == 201, resp.text
    artifact_id = resp.json()["artifact_id"]
    read = await client.get(f"/api/matters/{slug}/artifacts/{artifact_id}")
    assert read.json()["payload"]["model_id"] is None


@pytest.mark.asyncio
async def test_message_to_draft_to_review_and_signoff(client) -> None:
    """The whole loop, zero special-casing: chat reply → saved draft →
    supervisor review (request + decide) → professional sign-off."""
    email = await _register_and_login(client)
    slug = await _create_matter(client)
    message_id = await _seed_assistant_message(slug)

    saved = await client.post(
        f"/api/matters/{slug}/assistant/messages/{message_id}/save-draft"
    )
    assert saved.status_code == 201, saved.text
    artifact_id = saved.json()["artifact_id"]

    # Review: chat_draft is review-eligible like findings_pack /
    # skill_response — the existing endpoint accepts it as-is.
    review = await client.post(
        f"/api/matters/{slug}/reviews", json={"artifact_id": artifact_id}
    )
    assert review.status_code == 201, review.text
    review_id = review.json()["id"]
    assert review.json()["kind"] == "chat_draft"

    # Reviewer ≠ author: a second user (workspace superuser) decides.
    reviewer = await _register_and_login(client)
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == reviewer))
        u.is_superuser = True
        await session.commit()
    decided = await client.post(
        f"/api/matters/{slug}/reviews/{review_id}/decide",
        json={"decision": "approve"},
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["state"] == "approved"

    # Sign-off: the author signs their own AI-assisted draft.
    await _login(client, email)
    signed = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert signed.status_code == 201, signed.text
    body = signed.json()
    assert body["kind"] == "chat_draft"
    assert body["signer_is_author"] is True
    assert len(body["artifact_hash"]) == 64
