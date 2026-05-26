"""Phase 10 — POST /api/matters/{slug}/invocations endpoint tests.

13 endpoint tests covering:

- Auth: non-owner; archived matter
- Module/capability resolution: not installed; disabled; capability_id missing
- Decision #7: scope + kind rejection BEFORE dispatch (workspace
  scope; provider kind)
- Error translation: PostureBlocked → 403; CapabilityDenied → 403;
  ValueError invalid_args → 422; ProviderKeyMissing → 422;
  ProviderUpstreamError → 502
- Reconstruction integration: happy-path emits the canonical audit
  chain

Phase1Blocked → 403 and generic-RuntimeError → 500 paths are not
exercised here. Phase1Blocked propagation through Contract Review +
Pre-Motion is covered indirectly by the Phase 6/9 negatives. The
generic-500 path is an untested branch — flagged for a future pass
if a real call site hits it.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.model_gateway import (
    ModelResult,
    ProviderKeyMissing,
    ProviderUpstreamError,
)
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AuditEntry,
    InstalledModule,
    Matter,
    PRIVILEGE_CLEARED,
    PRIVILEGE_MIXED,
    SCOPE_TYPE_MATTER,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# ---------------------------------------------------------------------------
# Shared fixtures: install module, grant capabilities, stub gateway
# ---------------------------------------------------------------------------


def _verified_manifest(name: str) -> dict:
    candidates = [
        Path(__file__).resolve().parents[2] / "examples" / "modules" / name / "module.json",
        Path(f"/app/examples/modules/{name}/module.json"),
    ]
    for c in candidates:
        if c.exists():
            return json.loads(c.read_text())
    raise FileNotFoundError(f"manifest not found for {name}")


@pytest.fixture
def captured_audit_failures(monkeypatch):
    """Capture audit_failure calls instead of writing through an
    independent session. Same Phase 5/6/8 pattern — SAVEPOINT-bound
    tests can't run independent commits against an uncommitted user."""
    from app.core import api as api_module

    captured: list[dict] = []

    async def _capture(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capture)
    return captured


@pytest.fixture
def stub_gateway(monkeypatch):
    """Replace model_gateway.call with a canned ModelResult so the
    endpoint tests can drive the real adapter without a real API."""
    from app.core.api import model_gateway as gateway_singleton

    canned = json.dumps(
        {
            "findings": [
                {
                    "clause_id": "1",
                    "severity": "low",
                    "comment": "ok",
                    "citation": "x",
                }
            ]
        }
    )

    async def _stub_call(**kwargs):
        return ModelResult(
            text=canned,
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="x" * 64,
            token_count=42,
            latency_ms=10,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)
    return gateway_singleton


async def _register_admin_solicitor(client) -> str:
    email = f"p10ep-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase10-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
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


async def _install_contract_review(client) -> None:
    clear_ceremonies()
    manifest = _verified_manifest("contract_review")
    start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    assert start.status_code == 201
    ceremony_id = start.json()["ceremony_id"]
    for _ in range(3):
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200
    final = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert final.status_code == 200


async def _make_a_cleared_matter(client, user_email: str) -> tuple[str, uuid.UUID]:
    """Create an A_cleared matter so posture passes for any role.
    Returns (slug, matter_id)."""
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == user_email)
        )
        m = Matter(
            id=uuid.uuid4(),
            slug=f"p10ep-{uuid.uuid4().hex[:8]}",
            title="P10 Endpoint Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(m)
        await session.flush()
        # Also need a document to invoke against.
        from app.models import Document, DocumentBody
        doc = Document(
            id=uuid.uuid4(),
            matter_id=m.id,
            filename="test.pdf",
            mime_type="application/pdf",
            size_bytes=100,
            sha256="0" * 64,
            storage_uri="local://test",
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
                extracted_text="contract text",
                extraction_method="passthrough",
                char_count=13,
            )
        )
        await session.commit()
        return m.slug, m.id


async def _grant_review_caps(client, slug: str) -> None:
    r = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert r.status_code == 201, r.text


async def _resolve_doc_id(matter_id: uuid.UUID) -> uuid.UUID:
    from app.main import app
    from app.models import Document
    factory = app.state.session_factory
    async with factory() as session:
        doc = await session.scalar(
            select(Document).where(Document.matter_id == matter_id)
        )
        return doc.id


# ---------------------------------------------------------------------------
# Auth + matter access
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_non_owner_404(client, stub_gateway) -> None:
    """Stranger gets uniform 404; never leak which matters exist."""
    # User A creates a matter.
    email_a = f"p10-owner-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase10-2026"
    await client.post(
        "/auth/register", json={"email": email_a, "password": password}
    )
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        owner = await session.scalar(select(User).where(User.email == email_a))
        m = Matter(
            id=uuid.uuid4(),
            slug=f"private-{uuid.uuid4().hex[:8]}",
            title="A's matter",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=owner.id,
        )
        session.add(m)
        await session.commit()
        slug = m.slug

    # Stranger logs in.
    email_b = f"p10-stranger-{uuid.uuid4().hex[:8]}@example.com"
    await client.post(
        "/auth/register", json={"email": email_b, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email_b, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(uuid.uuid4())},
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_invoke_archived_matter_404(client, stub_gateway) -> None:
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        m = await session.scalar(select(Matter).where(Matter.id == matter_id))
        m.status = STATUS_ARCHIVED
        await session.commit()

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(uuid.uuid4())},
        },
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Module / capability resolution
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_module_not_installed_404(client, stub_gateway) -> None:
    email = await _register_admin_solicitor(client)
    slug, _ = await _make_a_cleared_matter(client, email)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.never-installed",
            "capability_id": "review",
            "args": {},
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "module_not_installed"


@pytest.mark.asyncio
async def test_invoke_module_disabled_409(client, stub_gateway) -> None:
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, _ = await _make_a_cleared_matter(client, email)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        installed = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == "examples.contract-review"
            )
        )
        installed.enabled = False
        await session.commit()

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {},
        },
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "module_disabled"


@pytest.mark.asyncio
async def test_invoke_unknown_capability_404(client, stub_gateway) -> None:
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, _ = await _make_a_cleared_matter(client, email)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "ghost",
            "args": {},
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "capability_not_declared"


# ---------------------------------------------------------------------------
# Decision #7 — scope + kind rejection BEFORE dispatch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_workspace_scope_capability_422_before_dispatch(
    client, stub_gateway
) -> None:
    """default-provider is scope=workspace + kind=provider — endpoint
    must reject BEFORE dispatch. The matter URL never produces
    workspace authority (Phase 7 invariant)."""
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "default-provider",
            "args": {},
        },
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    # Both checks are violated by default-provider (scope=workspace,
    # kind=provider). The endpoint runs scope check first.
    assert detail["error"] == "capability_scope_not_supported_here"
    assert detail["capability_scope"] == "workspace"

    # No dispatch side effect — no module.capability.invoked emitted.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        rows = (
            await session.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "module.capability.invoked",
                    AuditEntry.matter_id == matter_id,
                )
            )
        ).all()
        assert rows == []


@pytest.mark.asyncio
async def test_invoke_provider_kind_rejected_when_scope_is_matter(
    client, stub_gateway, monkeypatch
) -> None:
    """If a capability is declared with scope=matter but
    kind=provider, the kind check rejects. Synthesise via a
    monkey-patched InstalledModule (provider+matter is not a real
    shape any reference module ships)."""
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, _ = await _make_a_cleared_matter(client, email)

    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        installed = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == "examples.contract-review"
            )
        )
        # Mutate the snapshot to add a provider-kind matter-scoped cap.
        snap = dict(installed.manifest_snapshot)
        caps = list(snap.get("capabilities") or [])
        caps.append(
            {
                "id": "synthetic-provider",
                "kind": "provider",
                "scope": "matter",
                "reads": [],
                "writes": [],
            }
        )
        snap["capabilities"] = caps
        installed.manifest_snapshot = snap
        await session.commit()

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "synthetic-provider",
            "args": {},
        },
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["error"] == "capability_kind_not_invokable"
    assert detail["capability_kind"] == "provider"


# ---------------------------------------------------------------------------
# Error translation — PostureBlocked, CapabilityDenied, Phase1Blocked,
# ValueError, ProviderKeyMissing, ProviderUpstreamError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_posture_block_returns_403(
    client, stub_gateway, captured_audit_failures
) -> None:
    """B_mixed matter + non-solicitor → 403 posture_gate_blocked."""
    email = f"p10post-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase10-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True  # admin for install
        # NOT promoted to qualified_solicitor — default 'solicitor'.
        await session.commit()
        user_id = u.id
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    await _install_contract_review(client)

    # Build a B_mixed matter — posture gate will reject.
    async with factory() as session:
        m = Matter(
            id=uuid.uuid4(),
            slug=f"p10pb-{uuid.uuid4().hex[:8]}",
            title="B_mixed posture test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user_id,
        )
        session.add(m)
        await session.flush()
        from app.models import Document, DocumentBody
        doc = Document(
            id=uuid.uuid4(),
            matter_id=m.id,
            filename="x.pdf",
            mime_type="application/pdf",
            size_bytes=10,
            sha256="0" * 64,
            storage_uri="local://x",
            tag=None,
            from_disclosure=False,
            uploaded_by_id=user_id,
        )
        session.add(doc)
        await session.flush()
        session.add(
            DocumentBody(
                document_id=doc.id,
                kind="extracted",
                extracted_text="t",
                extraction_method="passthrough",
                char_count=1,
            )
        )
        await session.commit()
        slug = m.slug
        doc_id = doc.id

    # Grant the caps (admin's own grants).
    r = await client.post(
        f"/api/matters/{slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert r.status_code == 201

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(doc_id)},
        },
    )
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["error"] == "posture_gate_blocked"
    assert detail["posture"] == PRIVILEGE_MIXED
    assert detail["required_role"] == "qualified_solicitor"
    assert detail["actor_role"] == "solicitor"


@pytest.mark.asyncio
async def test_invoke_missing_grant_returns_403(client, stub_gateway) -> None:
    """No /grants call → require_capability denies → 403."""
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)
    doc_id = await _resolve_doc_id(matter_id)
    # NO grant call.

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(doc_id)},
        },
    )
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["error"] == "capability_denied"
    assert detail["plugin"] == "examples.contract-review"
    assert detail["scope"] == "matter"


@pytest.mark.asyncio
async def test_invoke_invalid_args_returns_422(client, stub_gateway) -> None:
    """Capability's ValueError on bad args → 422 invalid_args."""
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)
    await _grant_review_caps(client, slug)

    # Contract Review review_contract requires document_id; omitting it
    # raises ValueError from the entry class's invoke().
    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {},
        },
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["error"] == "invalid_args"


@pytest.mark.asyncio
async def test_invoke_provider_key_missing_returns_422(
    client, monkeypatch
) -> None:
    """ProviderKeyMissing → 422 provider_key_missing."""
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        raise ProviderKeyMissing("anthropic")

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)
    await _grant_review_caps(client, slug)
    doc_id = await _resolve_doc_id(matter_id)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(doc_id)},
        },
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["error"] == "provider_key_missing"
    assert detail["provider"] == "anthropic"


@pytest.mark.asyncio
async def test_invoke_provider_upstream_error_returns_502(
    client, monkeypatch
) -> None:
    """ProviderUpstreamError → 502 provider_upstream_error."""
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        raise ProviderUpstreamError(
            provider="anthropic",
            code="provider_rate_limited",
            upstream_status=429,
            message="upstream rate limited",
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)
    await _grant_review_caps(client, slug)
    doc_id = await _resolve_doc_id(matter_id)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(doc_id)},
        },
    )
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert detail["error"] == "provider_upstream_error"
    assert detail["provider"] == "anthropic"
    assert detail["code"] == "provider_rate_limited"


# ---------------------------------------------------------------------------
# Reconstruction integration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_completes_then_reconstruction_includes_canonical_events(
    client, stub_gateway
) -> None:
    """Happy path via HTTP — reconstruction picks up the canonical
    audit chain naturally."""
    email = await _register_admin_solicitor(client)
    await _install_contract_review(client)
    slug, matter_id = await _make_a_cleared_matter(client, email)
    await _grant_review_caps(client, slug)
    doc_id = await _resolve_doc_id(matter_id)

    resp = await client.post(
        f"/api/matters/{slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(doc_id)},
        },
    )
    assert resp.status_code == 200

    recon = await client.get(
        f"/api/matters/{slug}/audit/reconstruction?limit=500"
    )
    assert recon.status_code == 200
    audit_actions = {
        e["action"] for e in recon.json()["entries"]
        if e["source"] == "audit"
    }
    assert "module.capability.invoked" in audit_actions
    assert "module.capability.completed" in audit_actions
    assert "model.invoked" in audit_actions
    assert "module.grant.created" in audit_actions
