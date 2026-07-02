"""POST /api/matters/{slug}/invocations — vertical slice + error paths.

Merged from test_phase6_vertical_slice.py + test_phase10_invocations_api.py
(test-slim Phase 3).

ONE full vertical slice walks the entire install → advance → grant →
invoke loop end-to-end (the Phase 6 acceptance bar): seeded Khan matter,
trust ceremony on the verified fast path, HTTP grant (incl. idempotent
re-post), HTTP invoke, advice-boundary decision row, WORM artifact on
storage, model.invoked cost columns, and the reconstruction timeline
with canonical events in chronological order.

The per-error-path endpoint tests sit around it:

- Auth: non-owner 404; archived matter 404
- Module/capability resolution: not installed 404; disabled 409;
  capability_id missing 404
- Decision #7: scope + kind rejection BEFORE dispatch (workspace
  scope 422; provider kind 422)
- Error translation: PostureBlocked → 403; CapabilityDenied → 403;
  ValueError invalid_args → 422; ProviderKeyMissing → 422;
  ProviderUpstreamError → 502

Dedup note: the phase10 happy-path reconstruction-integration test
duplicated the vertical slice's reconstruction step (same failure
mode: canonical audit chain missing after a successful invoke) and was
dropped in the merge.

Phase1Blocked → 403 and generic-RuntimeError → 500 paths are not
exercised here. Phase1Blocked propagation through Contract Review +
Pre-Motion is covered indirectly by the Phase 6/9 negatives. The
generic-500 path is an untested branch — flagged for a future pass
if a real call site hits it.

The provider call is stubbed at the model-gateway seam — deterministic
canned findings keep the tests reproducible without a real model API
key. Every other code path is production: install ceremony, grant
lifecycle, advice-boundary substrate, artifact storage, reconstruction
view.
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
from app.core.seed import KHAN_SLUG
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AdviceBoundaryDecision,
    AuditEntry,
    Document,
    InstalledModule,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    PRIVILEGE_MIXED,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# ---------------------------------------------------------------------------
# Shared fixtures: install module, grant capabilities, stub gateway
# ---------------------------------------------------------------------------


def _verified_manifest(name: str) -> dict:
    """Load the on-disk signed manifest for the install endpoint.

    The manifest can be at one of two paths depending on the runtime
    layout: repo root (host run) or under /app/examples (container
    run, where the examples tree gets copied in).
    """
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


def _stub_findings_json() -> str:
    return json.dumps(
        {
            "findings": [
                {
                    "clause_id": "5.2",
                    "severity": "high",
                    "comment": "Indemnity is uncapped and one-way.",
                    "citation": "clause 5.2 of NDA",
                },
                {
                    "clause_id": "8.1",
                    "severity": "medium",
                    "comment": "Term auto-renews without notice window.",
                    "citation": "clause 8.1 of NDA",
                },
            ]
        }
    )


@pytest.fixture
def stub_gateway_two_findings(monkeypatch):
    """Vertical-slice stub: two deterministic findings + a fixed token
    count so the slice can assert the audit cost columns exactly."""
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        return ModelResult(
            text=_stub_findings_json(),
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="x" * 64,
            token_count=1850,
            latency_ms=120,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)
    return gateway_singleton


async def _register_admin_solicitor(client) -> str:
    email = f"inv-{uuid.uuid4().hex[:8]}@example.com"
    password = "invocations-2026"
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
            slug=f"inv-{uuid.uuid4().hex[:8]}",
            title="Invocations Endpoint Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(m)
        await session.flush()
        # Also need a document to invoke against.
        from app.models import DocumentBody
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
    factory = app.state.session_factory
    async with factory() as session:
        doc = await session.scalar(
            select(Document).where(Document.matter_id == matter_id)
        )
        return doc.id


# ---------------------------------------------------------------------------
# THE vertical slice — install → advance → grant → invoke, end to end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_contract_review_vertical_slice(
    client, stub_gateway_two_findings, captured_audit_failures
) -> None:
    """The Phase 6 acceptance bar walks end-to-end.

    1. Register a user (auto-seeded with the Khan v Acme matter).
    2. Promote to superuser so module install passes the admin gate.
    3. Read the NDA document from the seeded matter.
    4. Install the `examples.contract-review` module via the trust
       ceremony — 3 trusts + 1 grant on the verified fast path.
    5. Confirm InstalledModule row written.
    6. Confirm WorkspaceSkillCapabilityGrant rows landed (via the real
       HTTP grant endpoint, incl. idempotent re-post).
    7. Invoke the `review` capability against the NDA over HTTP.
    8. Confirm advice_boundary_decision row written with matter scope.
    9. Confirm matter_artifacts row written + the JSON object stored.
    10. Confirm model.invoked audit row carries cost columns.
    11. Pull the reconstruction view; assert the canonical audit +
        advice-boundary events all appear in chronological order.
    """
    clear_ceremonies()

    email = f"inv-vs-{uuid.uuid4().hex[:8]}@example.com"
    password = "invocations-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )

    from app.main import app
    factory = app.state.session_factory

    # Promote to superuser so the module install gate passes, AND
    # to qualified_solicitor so the Phase 8 posture gate passes on
    # the default-posture (B_mixed) Khan v Acme matter.
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        user.is_superuser = True
        user.role = "qualified_solicitor"
        await session.commit()
        user_id = user.id

    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    # ------- (1) confirm Khan v Acme + NDA are seeded -------
    async with factory() as session:
        matter = await session.scalar(
            select(Matter).where(
                Matter.slug == KHAN_SLUG, Matter.created_by_id == user_id
            )
        )
        assert matter is not None, "Khan v Acme matter must be seeded"
        nda = await session.scalar(
            select(Document).where(
                Document.matter_id == matter.id,
                Document.filename == "synthetic-mutual-nda.docx",
            )
        )
        assert nda is not None, "Synthetic NDA must be on the matter"
        matter_id = matter.id
        nda_id = nda.id
        matter_slug = matter.slug

    # ------- (2) install the contract-review module via ceremony -------
    manifest = _verified_manifest("contract_review")

    install_resp = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    assert install_resp.status_code == 201, install_resp.text
    ceremony_id = install_resp.json()["ceremony_id"]

    # Verified fast path: 3 trusts + 1 grant.
    for _ in range(3):
        r = await client.post(
            f"/api/modules/install/{ceremony_id}/advance",
            json={"action": "trust"},
        )
        assert r.status_code == 200, r.text
    final = await client.post(
        f"/api/modules/install/{ceremony_id}/advance",
        json={"action": "grant"},
    )
    assert final.status_code == 200
    assert final.json()["state"] == "enabled"

    # ------- (3) confirm InstalledModule, then grant capabilities -------
    # Phase 7: the user-facing grant surface is real. The vertical
    # slice now walks the public HTTP endpoint between install and
    # invoke — no fixture writes grant rows directly any more.
    async with factory() as session:
        installed = await session.scalar(
            select(InstalledModule).where(
                InstalledModule.module_id == "examples.contract-review",
                InstalledModule.version == "1.0.0",
            )
        )
        assert installed is not None
        assert installed.signature_status == "structure_verified"

    # POST /api/matters/{slug}/grants — real HTTP grant.
    grant_resp = await client.post(
        f"/api/matters/{matter_slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert grant_resp.status_code == 201, grant_resp.text
    grant_body = grant_resp.json()
    assert grant_body["was_idempotent_noop"] is False
    granted_capabilities = {g["capability"] for g in grant_body["grants"]}
    assert "matter.document.read" in granted_capabilities
    assert "matter.artifact.write" in granted_capabilities

    # Idempotent re-post returns 200 with the same row ids and zero
    # new audit rows (Phase 7 v2 Decision #4).
    redo = await client.post(
        f"/api/matters/{matter_slug}/grants",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
        },
    )
    assert redo.status_code == 200, redo.text
    assert redo.json()["was_idempotent_noop"] is True
    assert {g["id"] for g in redo.json()["grants"]} == {
        g["id"] for g in grant_body["grants"]
    }

    async with factory() as session:
        grants = (
            await session.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.user_id == user_id,
                    WorkspaceSkillCapabilityGrant.plugin == "examples.contract-review",
                )
            )
        ).all()
        assert len(grants) == 2

    # ------- (4) invoke the capability via the real HTTP endpoint -------
    # Phase 10: install + grant + INVOKE all walk through public HTTP
    # endpoints. No direct Python imports of capability functions.
    invoke_resp = await client.post(
        f"/api/matters/{matter_slug}/invocations",
        json={
            "module_id": "examples.contract-review",
            "capability_id": "review",
            "args": {"document_id": str(nda_id)},
        },
    )
    assert invoke_resp.status_code == 200, invoke_resp.text
    invoke_body = invoke_resp.json()
    invocation_id = uuid.UUID(invoke_body["invocation_id"])
    assert invoke_body["module_id"] == "examples.contract-review"
    assert invoke_body["capability_id"] == "review"
    assert invoke_body["matter_id"] == str(matter_id)
    assert invoke_body["result"]["findings_count"] == 2

    # ------- (5) confirm advice_boundary_decision row -------
    async with factory() as session:
        decisions = (
            await session.scalars(
                select(AdviceBoundaryDecision).where(
                    AdviceBoundaryDecision.output_id == str(invocation_id),
                )
            )
        ).all()
        assert len(decisions) == 1
        decision = decisions[0]
        assert decision.status == "completed"
        assert decision.to_tier == "draft_advice"
        assert decision.gate_state.get("matter_id") == str(matter_id)
        assert decision.module_id == "examples.contract-review"

    # ------- (6) confirm matter_artifacts row + stored object -------
    async with factory() as session:
        artifact = await session.scalar(
            select(MatterArtifact).where(
                MatterArtifact.invocation_id == invocation_id,
                MatterArtifact.kind == "findings_pack",
            )
        )
        assert artifact is not None
        assert artifact.size_bytes > 0
        # LMF-1: artifacts live in object storage; storage_path is a key.
        from app.core.storage import get_storage_backend
        raw = get_storage_backend().get_bytes(artifact.storage_path)
        parsed = json.loads(raw.decode("utf-8"))
        assert isinstance(parsed["findings"], list)
        assert len(parsed["findings"]) == 2
        assert parsed["findings"][0]["clause_id"] == "5.2"

    # ------- (7) confirm model.invoked carries provider/model + tokens -------
    # Phase 10 adapter mapping (Decision #4 v3):
    #   tokens_in   = gateway result.token_count (combined)
    #   tokens_out  = 0 (sentinel; honest until providers split)
    #   cost_micros = None (gateway doesn't price yet)
    #   currency    = None (paired)
    # See PHASE_10_INVOKE_ENDPOINT_BUILD_PLAN.md Decision #4.
    async with factory() as session:
        model_row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "model.invoked",
                AuditEntry.matter_id == matter_id,
            )
        )
        assert model_row is not None
        assert model_row.cost_micros is None
        assert model_row.currency is None
        assert model_row.tokens_in == 1850
        assert model_row.tokens_out == 0
        assert model_row.provider == "anthropic"
        # Matter uses the default model (settings.default_model_id).
        assert model_row.model_id == "claude-sonnet-4-6"

    # ------- (8) pull reconstruction view + assert canonical timeline -------
    recon = await client.get(
        f"/api/matters/{matter_slug}/audit/reconstruction?limit=500"
    )
    assert recon.status_code == 200, recon.text
    entries = recon.json()["entries"]
    actions_by_source = {
        "audit": [e["action"] for e in entries if e["source"] == "audit"],
        "advice_boundary": [
            e["action"] for e in entries if e["source"] == "advice_boundary"
        ],
        "state_machine": [
            e["action"] for e in entries if e["source"] == "state_machine"
        ],
    }

    # Capability invocation + completion + model + artifact-related
    # audit rows must all appear.
    audit_actions = set(actions_by_source["audit"])
    assert "module.capability.invoked" in audit_actions
    assert "module.capability.completed" in audit_actions
    assert "model.invoked" in audit_actions
    assert "module.grant.created" in audit_actions

    # Advice-boundary decision appears under its own source.
    assert "advice_boundary.decision.completed" in actions_by_source[
        "advice_boundary"
    ]

    # Reconstruction view itself emits audit.reconstruction.viewed —
    # check we did. (After the GET above runs, the row is written.)
    recon2 = await client.get(
        f"/api/matters/{matter_slug}/audit/reconstruction?limit=500"
    )
    assert recon2.status_code == 200
    audit2 = [
        e["action"] for e in recon2.json()["entries"] if e["source"] == "audit"
    ]
    assert "audit.reconstruction.viewed" in audit2

    # ------- (9) timeline order is monotonic by occurred_at -------
    for prev, nxt in zip(entries, entries[1:]):
        assert prev["occurred_at"] <= nxt["occurred_at"], (
            f"timeline not monotonic: {prev['action']} ({prev['occurred_at']}) "
            f"-> {nxt['action']} ({nxt['occurred_at']})"
        )


# ---------------------------------------------------------------------------
# Auth + matter access
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_non_owner_404(client, stub_gateway) -> None:
    """Stranger gets uniform 404; never leak which matters exist."""
    # User A creates a matter.
    email_a = f"inv-owner-{uuid.uuid4().hex[:8]}@example.com"
    password = "invocations-2026"
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
    email_b = f"inv-stranger-{uuid.uuid4().hex[:8]}@example.com"
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
# Error translation — PostureBlocked, CapabilityDenied, ValueError,
# ProviderKeyMissing, ProviderUpstreamError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_posture_block_returns_403(
    client, stub_gateway, captured_audit_failures
) -> None:
    """B_mixed matter + non-solicitor → 403 posture_gate_blocked."""
    email = f"inv-post-{uuid.uuid4().hex[:8]}@example.com"
    password = "invocations-2026"
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
            slug=f"inv-pb-{uuid.uuid4().hex[:8]}",
            title="B_mixed posture test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user_id,
        )
        session.add(m)
        await session.flush()
        from app.models import DocumentBody
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
