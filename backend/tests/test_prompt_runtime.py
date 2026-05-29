"""Prompt Runtime v1 — schema + invocation tests.

Schema-level (pure ``validate_manifest_v2``):
- a prompt-runtime manifest validates
- a prompt runtime without ``entrypoint.instructions`` is rejected

Invocation-level (HTTP, mirrors the Phase 10 harness):
- happy path: grant + invoke → 200, ``skill_response`` artifact, audit chain
- write grant enforced before writing (invoke with no docs, no grants)
- read grant enforced before reading (invoke with a doc, no grants)
- missing provider key propagates through the existing path → 422

The prompt runtime reuses every native-capability seam (posture, grants,
advice-boundary, model gateway, artifacts, audit). These tests prove it
bypasses none of them.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.model_gateway import ModelResult, ProviderKeyMissing
from app.core.registry.validator import validate_manifest_v2
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AuditEntry,
    MatterArtifact,
    Matter,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)


MODULE_ID = "lawve.test-prompt-skill"
CAPABILITY_ID = "run"


def _prompt_manifest(*, with_instructions: bool = True) -> dict:
    entrypoint: dict = {"prompt_source": "manifest"}
    if with_instructions:
        entrypoint["instructions"] = "Summarise the matter document in plain English."
    return {
        "schema_version": "2.0.0",
        "id": MODULE_ID,
        "name": "Test Prompt Skill",
        "version": "1.0.0",
        "publisher": "tests",
        "visibility": "community",
        "runtime": "prompt",
        "entrypoint": entrypoint,
        "capabilities": [
            {
                "id": CAPABILITY_ID,
                "kind": "skill",
                "scope": "matter",
                "reads": ["document.body.read"],
                "writes": ["matter.artifact.write"],
                "model_access": "required",
                "external_network": False,
                "data_movement": {"external_destinations": [], "local_only": True},
                "gates": ["privilege_posture"],
                "ui": {"slot": "matter.workflows", "label": "Test Prompt Skill"},
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": [
                    "module.capability.invoked",
                    "model.invoked",
                    "module.capability.completed",
                ],
            },
            {
                "id": "default-provider",
                "kind": "provider",
                "scope": "workspace",
                "reads": [],
                "writes": [],
                "model_access": "none",
                "external_network": False,
                "data_movement": {"external_destinations": [], "local_only": True},
                "gates": [],
                "ui": {"slot": "matter.workflows", "label": "Provider (internal)"},
                "streaming_mode": "sync",
                "advice_tier_max": "factual_extraction",
                "audit_events": ["model.invoked"],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Schema-level
# ---------------------------------------------------------------------------


def test_schema_accepts_prompt_runtime() -> None:
    is_valid, errors = validate_manifest_v2(_prompt_manifest())
    assert is_valid, errors


def test_schema_rejects_prompt_without_instructions() -> None:
    is_valid, errors = validate_manifest_v2(
        _prompt_manifest(with_instructions=False)
    )
    assert is_valid is False
    # The entrypoint oneOf fails because the prompt variant requires
    # instructions and no other variant matches.
    assert any("entrypoint" in e["path"] for e in errors)


# ---------------------------------------------------------------------------
# Invocation harness (mirrors test_phase10_invocations_api.py)
# ---------------------------------------------------------------------------


@pytest.fixture
def stub_gateway(monkeypatch):
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        return ModelResult(
            text="A plain-English summary of the document.",
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="y" * 64,
            token_count=21,
            latency_ms=5,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)
    return gateway_singleton


async def _register_admin_solicitor(client) -> str:
    email = f"pr-{uuid.uuid4().hex[:8]}@example.com"
    password = "prompt-runtime-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    from app.main import app

    async with app.state.session_factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        u.role = "qualified_solicitor"
        await session.commit()
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _install_prompt_module(client) -> None:
    clear_ceremonies()
    start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": _prompt_manifest()},
    )
    assert start.status_code == 201, start.text
    body = start.json()
    ceremony_id = body["ceremony_id"]
    # Unsigned community manifests walk the full state machine; advance
    # with "trust" until GRANTED, then commit with "grant".
    for _ in range(8):
        if body["state"] == "granted":
            break
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
    assert body["state"] == "granted", body
    final = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert final.status_code == 200, final.text


async def _make_cleared_matter(client, email: str) -> tuple[str, uuid.UUID, uuid.UUID]:
    from app.main import app
    from app.models import Document, DocumentBody

    async with app.state.session_factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        m = Matter(
            id=uuid.uuid4(),
            slug=f"pr-{uuid.uuid4().hex[:8]}",
            title="Prompt Runtime Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(m)
        await session.flush()
        doc = Document(
            id=uuid.uuid4(),
            matter_id=m.id,
            filename="brief.pdf",
            mime_type="application/pdf",
            size_bytes=100,
            sha256="0" * 64,
            storage_uri="local://brief",
            tag=None,
            from_disclosure=False,
            uploaded_by_id=user.id,
        )
        session.add(doc)
        await session.flush()
        session.add(
            DocumentBody(
                document_id=doc.id,
                kind="extracted",
                extracted_text="the contract body",
                extraction_method="passthrough",
                char_count=17,
            )
        )
        await session.commit()
        return m.slug, m.id, doc.id


async def _grant_caps(client, slug: str) -> None:
    r = await client.post(
        f"/api/matters/{slug}/grants",
        json={"module_id": MODULE_ID, "capability_id": CAPABILITY_ID},
    )
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_prompt_invocation_happy_path(client, stub_gateway) -> None:
    email = await _register_admin_solicitor(client)
    await _install_prompt_module(client)
    slug, matter_id, doc_id = await _make_cleared_matter(client, email)
    await _grant_caps(client, slug)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": MODULE_ID,
            "capability_id": CAPABILITY_ID,
            "args": {"document_id": str(doc_id), "input": "Summarise this."},
        },
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()["result"]
    assert result["artifact_kind"] == "skill_response"
    assert result["output_chars"] > 0

    from app.main import app

    async with app.state.session_factory() as session:
        # Artifact persisted with the prompt-runtime kind.
        artifact = await session.scalar(
            select(MatterArtifact).where(
                MatterArtifact.matter_id == matter_id,
                MatterArtifact.kind == "skill_response",
            )
        )
        assert artifact is not None
        assert str(artifact.id) == result["artifact_id"]
        # Audit chain: invoked → model call → completed.
        actions = set(
            (
                await session.execute(
                    select(AuditEntry.action).where(AuditEntry.matter_id == matter_id)
                )
            )
            .scalars()
            .all()
        )
    assert "module.capability.invoked" in actions
    assert "module.capability.completed" in actions
    assert "model.invoked" in actions


@pytest.mark.asyncio
async def test_prompt_invocation_requires_write_grant(client, stub_gateway) -> None:
    # No grants. Invoke WITHOUT a document so the read path is skipped —
    # the executor still enforces the artifact write grant before writing.
    email = await _register_admin_solicitor(client)
    await _install_prompt_module(client)
    slug, _matter_id, _doc_id = await _make_cleared_matter(client, email)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": MODULE_ID,
            "capability_id": CAPABILITY_ID,
            "args": {"input": "no document"},
        },
    )
    assert resp.status_code == 403, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "capability_denied"
    assert detail["capability"] == "matter.artifact.write"


@pytest.mark.asyncio
async def test_prompt_invocation_requires_read_grant(client, stub_gateway) -> None:
    # No grants. Invoke WITH a document — the read grant is enforced
    # before the document is loaded (and before the write grant).
    email = await _register_admin_solicitor(client)
    await _install_prompt_module(client)
    slug, _matter_id, doc_id = await _make_cleared_matter(client, email)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": MODULE_ID,
            "capability_id": CAPABILITY_ID,
            "args": {"document_id": str(doc_id)},
        },
    )
    assert resp.status_code == 403, resp.text
    detail = resp.json()["detail"]
    assert detail["error"] == "capability_denied"
    assert detail["capability"] == "document.body.read"


@pytest.mark.asyncio
async def test_advice_boundary_denial_translates_to_403(client, stub_gateway, monkeypatch) -> None:
    # The executor raises PermissionError when the advice-boundary gate
    # denies. The endpoint must surface that as a structured 403, not a
    # generic 500. Guard the translation directly.
    email = await _register_admin_solicitor(client)
    await _install_prompt_module(client)
    slug, _matter_id, _doc_id = await _make_cleared_matter(client, email)
    await _grant_caps(client, slug)

    import app.api.invocations as inv

    async def _raise_permission(*args, **kwargs):
        raise PermissionError("advice-boundary gate denied: {'status': 'denied'}")

    monkeypatch.setattr(inv, "dispatch_capability", _raise_permission)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": MODULE_ID,
            "capability_id": CAPABILITY_ID,
            "args": {"input": "x"},
        },
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"]["error"] == "advice_boundary_denied"


@pytest.mark.asyncio
async def test_prompt_invocation_missing_provider_key(client, monkeypatch) -> None:
    email = await _register_admin_solicitor(client)
    await _install_prompt_module(client)
    slug, _matter_id, _doc_id = await _make_cleared_matter(client, email)
    await _grant_caps(client, slug)

    from app.core.api import model_gateway as gateway_singleton

    async def _raise_key_missing(**kwargs):
        raise ProviderKeyMissing("anthropic")

    monkeypatch.setattr(gateway_singleton, "call", _raise_key_missing)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": MODULE_ID,
            "capability_id": CAPABILITY_ID,
            "args": {"input": "summarise"},
        },
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"]["error"] == "provider_key_missing"
