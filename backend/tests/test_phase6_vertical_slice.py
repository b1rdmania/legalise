"""Phase 6 — Contract Review vertical-slice integration test.

Single test that walks the entire Phase 6 acceptance bar:

1. Register a user (auto-seeded with the Khan v Acme matter).
2. Promote to superuser so module install passes the admin gate.
3. Read the NDA document from the seeded matter.
4. Install the `examples.contract-review` module via the trust
   ceremony — 3 trusts + 1 grant on the verified fast path.
5. Confirm InstalledModule row written with signature_status=verified.
6. Confirm WorkspaceSkillCapabilityGrant rows landed.
7. Invoke the `review` capability against the NDA.
8. Confirm advice_boundary_decision row written with the matter scope.
9. Confirm matter_artifacts row written + the JSON file is on disk.
10. Confirm model.invoked audit row carries cost columns.
11. Pull the reconstruction view for the matter; assert the canonical
    audit + state-machine + advice-boundary events all appear in
    chronological order.

This is THE Phase 6 contract. If it passes against `runtime-rewrite`
head, the vertical slice is real.

The provider call is monkey-patched at the capability level — a
deterministic stub returns a fixed `{findings: [...]}` so the test
is reproducible without a real model API key. Every other code path
is production: install ceremony, grant lifecycle, advice-boundary
substrate, artifact storage, reconstruction view.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.seed import KHAN_SLUG
from app.core.trust_ceremony import clear_ceremonies
from app.models import (
    AdviceBoundaryDecision,
    AuditEntry,
    Document,
    InstalledModule,
    Matter,
    MatterArtifact,
    User,
    WorkspaceSkillCapabilityGrant,
)


# Capture audit_failure calls so the test runs against a single
# SAVEPOINT-scoped session — mirrors the Phase 5 ceremony-rejection
# test pattern. The InvalidCeremonyTransition path is exercised
# elsewhere; this test goes only down the success path.
@pytest.fixture(autouse=True)
def _capture_audit_failures(monkeypatch):
    from app.core import api as api_module

    captured: list[dict] = []

    async def _capture(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capture)


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
def stub_model_gateway(monkeypatch):
    """Phase 10 test seam: replace model_gateway.call with a stub
    that returns a canned ModelResult. The HTTP invoke endpoint
    runs the real adapter; the adapter calls model_gateway; the
    gateway returns this stub instead of hitting a real provider.
    """
    from app.core.api import model_gateway as gateway_singleton
    from app.core.model_gateway import ModelResult

    async def _stub_call(
        *,
        session,
        matter_id,
        actor_id,
        prompt,
        model=None,
        posture=None,
        system=None,
        resource_type=None,
        resource_id=None,
        payload=None,
        caller_module=None,
    ):
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


def _verified_manifest_for_install() -> dict:
    """Load the on-disk signed manifest for the install endpoint.

    The manifest can be at one of two paths depending on the runtime
    layout: repo root (host run) or under /app/examples (container
    run, where the examples tree gets copied in).
    """
    candidates = [
        Path(__file__).resolve().parents[2] / "examples" / "modules" / "contract_review" / "module.json",
        Path("/app/examples/modules/contract_review/module.json"),
    ]
    for c in candidates:
        if c.exists():
            return json.loads(c.read_text())
    raise FileNotFoundError(f"contract-review manifest not found at: {candidates}")


@pytest.mark.asyncio
async def test_contract_review_vertical_slice(client, stub_model_gateway) -> None:
    """The Phase 6 acceptance bar walks end-to-end."""
    clear_ceremonies()

    email = f"p6-vs-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase6-vs-2026"
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
    manifest = _verified_manifest_for_install()

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
        assert installed.signature_status == "verified"

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

    # ------- (6) confirm matter_artifacts row + file on disk -------
    async with factory() as session:
        artifact = await session.scalar(
            select(MatterArtifact).where(
                MatterArtifact.invocation_id == invocation_id,
                MatterArtifact.kind == "findings_pack",
            )
        )
        assert artifact is not None
        assert artifact.size_bytes > 0
        on_disk = Path(artifact.storage_path)
        assert on_disk.exists(), f"artifact file missing at {on_disk}"
        # File parses as the expected shape.
        parsed = json.loads(on_disk.read_text())
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
        assert model_row.model_id == "claude-opus-4-7"

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
