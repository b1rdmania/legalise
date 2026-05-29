"""Phase 9 — Pre-Motion vertical-slice integration + negative tests.

The substrate-reusability proof: this whole file uses the same
public surfaces Contract Review uses (install ceremony, /grants
endpoint, posture gate, advice-boundary gate, audit reconstruction).
ZERO core/api/model edits land in Phase 9 — see handover.

Happy path walks:

    register → promote → install → grant → invoke against the
    seeded Khan dismissal letter + witness statement → confirm
    motion_draft + evidence_list artifacts + audit reconstruction
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.capabilities import CapabilityDenied
from app.core.posture_gate import PostureBlocked
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
    SCOPE_TYPE_MATTER,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# ---------------------------------------------------------------------------
# Capture audit_failure — Phase 5/6/8 pattern. The SAVEPOINT-bound test can't
# run independent commits against an uncommitted user.
# ---------------------------------------------------------------------------


@pytest.fixture
def captured_audit_failures(monkeypatch):
    from app.core import api as api_module

    captured: list[dict] = []

    async def _capture(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capture)
    return captured


# ---------------------------------------------------------------------------
# Deterministic provider stub — returns a canned motion + evidence.
# ---------------------------------------------------------------------------


@dataclass
class _StubResponse:
    text: str
    model_id: str
    provider: str
    tokens_in: int
    tokens_out: int
    cost_micros: int
    currency: str


def _stub_payload(doc_ids: list[str]) -> str:
    return json.dumps(
        {
            "motion": {
                "markdown": "# Pre-motion (draft)\n\n1. Dismissal was procedurally unfair…",
                "claim_summary": "Khan v Acme — unfair dismissal claim outline",
            },
            "evidence": [
                {
                    "document_id": doc_ids[0],
                    "relevance": "primary evidence of dismissal",
                    "citation_hint": "dismissal letter §1",
                },
                {
                    "document_id": doc_ids[1],
                    "relevance": "supporting witness account",
                    "citation_hint": "witness statement §3",
                },
            ],
        }
    )


def _stub_provider_factory(doc_ids: list[str]):
    async def _call(prompt, *, system):
        return _StubResponse(
            text=_stub_payload(doc_ids),
            model_id="claude-opus-4-7",
            provider="anthropic",
            tokens_in=2200,
            tokens_out=520,
            cost_micros=3_900_000,
            currency="GBP",
        )

    return _call


@pytest.fixture
def stub_model_gateway_pre_motion(monkeypatch):
    """Phase 10 test seam — replaces model_gateway.call with a canned
    ModelResult carrying the Pre-Motion stub findings JSON. The
    capability runs through the real HTTP endpoint + adapter."""
    from app.core.api import model_gateway as gateway_singleton
    from app.core.model_gateway import ModelResult

    canned_text = json.dumps(
        {
            "motion": {
                "markdown": "# Pre-motion (draft)\n\n1. Dismissal was procedurally unfair…",
                "claim_summary": "Khan v Acme — unfair dismissal claim outline",
            },
            "evidence": [
                {
                    "document_id": "primary",
                    "relevance": "primary evidence of dismissal",
                    "citation_hint": "dismissal letter §1",
                },
                {
                    "document_id": "supporting",
                    "relevance": "supporting witness account",
                    "citation_hint": "witness statement §3",
                },
            ],
        }
    )

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
            text=canned_text,
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="x" * 64,
            token_count=2720,
            latency_ms=180,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)
    return gateway_singleton


async def _empty_evidence_provider(prompt, *, system):
    return _StubResponse(
        text=json.dumps(
            {"motion": {"markdown": "x", "claim_summary": ""}, "evidence": []}
        ),
        model_id="m",
        provider="p",
        tokens_in=1,
        tokens_out=1,
        cost_micros=100,
        currency="GBP",
    )


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _verified_manifest_for_install() -> dict:
    candidates = [
        Path(__file__).resolve().parents[2]
        / "examples" / "modules" / "pre_motion" / "module.json",
        Path("/app/examples/modules/pre_motion/module.json"),
    ]
    for c in candidates:
        if c.exists():
            return json.loads(c.read_text())
    raise FileNotFoundError(f"pre-motion manifest not found at {candidates}")


async def _register_promote_login(client) -> str:
    """Register a user, promote to superuser + qualified_solicitor,
    then log in. Returns the email."""
    email = f"p9-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase9-pre-motion-2026"
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


async def _install_pre_motion(client) -> None:
    clear_ceremonies()
    manifest = _verified_manifest_for_install()
    start = await client.post(
        "/api/modules/install",
        json={"source": "manifest", "manifest": manifest},
    )
    assert start.status_code == 201, start.text
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


# ---------------------------------------------------------------------------
# Happy path — full end-to-end via real HTTP endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pre_motion_vertical_slice(client, stub_model_gateway_pre_motion) -> None:
    """The Phase 9 acceptance bar: install (via ceremony) → grant
    (via /grants endpoint) → invoke against the existing Khan
    dismissal letter + witness statement → confirm both artifacts
    + canonical reconstruction timeline."""
    email = await _register_promote_login(client)
    from app.main import app
    factory = app.state.session_factory

    # Resolve the seeded Khan documents.
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        user_id = user.id
        matter = await session.scalar(
            select(Matter).where(
                Matter.slug == KHAN_SLUG, Matter.created_by_id == user_id
            )
        )
        assert matter is not None, "Khan v Acme matter must seed"
        matter_id = matter.id
        matter_slug = matter.slug
        dismissal = await session.scalar(
            select(Document).where(
                Document.matter_id == matter_id,
                Document.filename == "khan-dismissal-letter.pdf",
            )
        )
        witness = await session.scalar(
            select(Document).where(
                Document.matter_id == matter_id,
                Document.filename == "witness-statement-khan.docx",
            )
        )
        assert dismissal is not None and witness is not None, (
            "Khan seed must include dismissal letter + witness statement"
        )
        dismissal_id = dismissal.id
        witness_id = witness.id

    # Install + grant via the public endpoints — no fixture writes
    # anywhere outside this test file.
    await _install_pre_motion(client)
    grant = await client.post(
        f"/api/matters/{matter_slug}/grants",
        json={
            "module_id": "examples.pre-motion",
            "capability_id": "draft_motion",
        },
    )
    assert grant.status_code == 201, grant.text
    grant_caps = {g["capability"] for g in grant.json()["grants"]}
    assert grant_caps == {"matter.document.read", "matter.artifact.write"}

    # Phase 10: invoke via the real HTTP endpoint, not a direct call.
    # The provider stays canned via the gateway monkeypatch fixture.
    invoke_resp = await client.post(
        f"/api/matters/{matter_slug}/invocations",
        json={
            "module_id": "examples.pre-motion",
            "capability_id": "draft_motion",
            "args": {
                "claim_type": "unfair_dismissal",
                "document_ids": [str(dismissal_id), str(witness_id)],
            },
        },
    )
    assert invoke_resp.status_code == 200, invoke_resp.text
    invoke_body = invoke_resp.json()
    invocation_id = uuid.UUID(invoke_body["invocation_id"])
    assert invoke_body["module_id"] == "examples.pre-motion"
    assert invoke_body["capability_id"] == "draft_motion"
    assert invoke_body["matter_id"] == str(matter_id)
    assert invoke_body["result"]["evidence_count"] == 2

    # Confirm both artifacts landed with distinct kinds.
    async with factory() as session:
        artifacts = (
            await session.scalars(
                select(MatterArtifact).where(
                    MatterArtifact.invocation_id == invocation_id
                )
            )
        ).all()
        assert len(artifacts) == 2
        kinds = {a.kind for a in artifacts}
        assert kinds == {"motion_draft", "evidence_list"}
        from app.core.storage import get_storage_backend
        for a in artifacts:
            # LMF-1: artifacts in object storage; storage_path is a key.
            parsed = json.loads(
                get_storage_backend().get_bytes(a.storage_path).decode("utf-8")
            )
            if a.kind == "motion_draft":
                assert parsed["claim_type"] == "unfair_dismissal"
                assert parsed["markdown"].startswith("# Pre-motion")
            else:
                assert isinstance(parsed["evidence"], list)
                assert len(parsed["evidence"]) == 2

        # advice_boundary decision landed with matter scope.
        decision = await session.scalar(
            select(AdviceBoundaryDecision).where(
                AdviceBoundaryDecision.output_id == str(invocation_id)
            )
        )
        assert decision is not None
        assert decision.status == "completed"
        assert decision.gate_state.get("matter_id") == str(matter_id)

        # model.invoked carries the full cost-column set.
        model_row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "model.invoked",
                AuditEntry.matter_id == matter_id,
                AuditEntry.module == "examples.pre-motion",
            )
        )
        assert model_row is not None
        # Phase 10 adapter pins cost_micros/currency to None (gateway
        # doesn't price yet); tokens_out = 0 sentinel; tokens_in =
        # gateway's combined token_count. See Decision #4 v3.
        assert model_row.cost_micros is None
        assert model_row.currency is None

    # Reconstruction view returns the canonical Pre-Motion timeline.
    recon = await client.get(
        f"/api/matters/{matter_slug}/audit/reconstruction?limit=500"
    )
    assert recon.status_code == 200
    entries = recon.json()["entries"]
    audit_actions = {
        e["action"] for e in entries if e["source"] == "audit"
    }
    advice_actions = {
        e["action"] for e in entries if e["source"] == "advice_boundary"
    }
    assert "module.capability.invoked" in audit_actions
    assert "module.capability.completed" in audit_actions
    assert "model.invoked" in audit_actions
    assert "module.grant.created" in audit_actions
    assert "advice_boundary.decision.completed" in advice_actions


# ---------------------------------------------------------------------------
# Negative paths (db_session-fixture-based, capture audit_failure)
# ---------------------------------------------------------------------------


async def _make_user(db_session, *, role: str = "qualified_solicitor") -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"p9-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role=role,
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _make_matter(db_session, user, *, posture: str = PRIVILEGE_CLEARED) -> Matter:
    m = Matter(
        id=uuid.uuid4(),
        slug=f"p9-{uuid.uuid4().hex[:8]}",
        title="Phase 9 Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=posture,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(m)
    await db_session.flush()
    return m


async def _make_document(db_session, matter, text: str = "draft contract text"):
    from app.models import DocumentBody
    doc = Document(
        id=uuid.uuid4(),
        matter_id=matter.id,
        filename="test-doc.pdf",
        mime_type="application/pdf",
        size_bytes=len(text) or 1,
        sha256="0" * 64,
        storage_uri="local://test",
        tag=None,
        from_disclosure=False,
        uploaded_by_id=matter.created_by_id,
    )
    db_session.add(doc)
    await db_session.flush()
    db_session.add(
        DocumentBody(
            document_id=doc.id,
            kind="extracted",
            extracted_text=text,
            extraction_method="passthrough",
            char_count=len(text),
        )
    )
    await db_session.flush()
    return doc


async def _grant_both(db_session, user, matter):
    for cap in ("matter.document.read", "matter.artifact.write"):
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="examples.pre-motion",
                skill="draft_motion",
                capability=cap,
                capability_version="2.0.0",
                granted_at_module_version="1.0.0",
                granted_permissions_snapshot={"matter_id": str(matter.id)},
                scope_type=SCOPE_TYPE_MATTER,
                scope_id=matter.id,
            )
        )
    await db_session.flush()


@pytest.mark.asyncio
async def test_pre_motion_posture_block_on_b_mixed_non_solicitor(
    db_session, captured_audit_failures
) -> None:
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session, role="solicitor")  # not qualified
    matter = await _make_matter(db_session, user, posture=PRIVILEGE_MIXED)
    doc_a = await _make_document(db_session, matter)
    doc_b = await _make_document(db_session, matter, text="other text")
    await _grant_both(db_session, user, matter)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    call_log: list = []

    async def _watching(prompt, *, system):
        call_log.append(prompt)
        return await _empty_evidence_provider(prompt, system=system)

    with pytest.raises(PostureBlocked):
        await draft_motion(
            session=db_session,
            matter=matter,
            context=context,
            claim_type="unfair_dismissal",
            document_ids=[doc_a.id, doc_b.id],
            provider_call=_watching,
        )
    assert call_log == []
    artifacts = (
        await db_session.scalars(
            select(MatterArtifact).where(
                MatterArtifact.invocation_id == invocation_id
            )
        )
    ).all()
    assert artifacts == []


@pytest.mark.asyncio
async def test_pre_motion_missing_read_grant_blocks(
    db_session, captured_audit_failures
) -> None:
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc_a = await _make_document(db_session, matter)
    doc_b = await _make_document(db_session, matter, text="x")
    # Only the WRITE grant — read missing.
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.pre-motion",
            skill="draft_motion",
            capability="matter.artifact.write",
            scope_type=SCOPE_TYPE_MATTER,
            scope_id=matter.id,
            granted_permissions_snapshot={"matter_id": str(matter.id)},
        )
    )
    await db_session.flush()

    invocation_id = uuid.uuid4()
    with pytest.raises(CapabilityDenied):
        await draft_motion(
            session=db_session,
            matter=matter,
            context=InvocationContext(
                actor_user_id=user.id,
                actor_role=user.role,
                invocation_id=invocation_id,
            ),
            claim_type="unfair_dismissal",
            document_ids=[doc_a.id, doc_b.id],
            provider_call=_empty_evidence_provider,
        )


@pytest.mark.asyncio
async def test_pre_motion_missing_write_grant_blocks_after_model(
    db_session, captured_audit_failures
) -> None:
    """Read grant present, write missing — model gets called (work is
    visible in cost/audit) but no artifacts persist. Confirms the
    Phase 6 R2 ordering: write check fires after the model call."""
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc_a = await _make_document(db_session, matter)
    doc_b = await _make_document(db_session, matter, text="x")
    # Only the READ grant.
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.pre-motion",
            skill="draft_motion",
            capability="matter.document.read",
            scope_type=SCOPE_TYPE_MATTER,
            scope_id=matter.id,
            granted_permissions_snapshot={"matter_id": str(matter.id)},
        )
    )
    await db_session.flush()

    invocation_id = uuid.uuid4()
    with pytest.raises(CapabilityDenied):
        await draft_motion(
            session=db_session,
            matter=matter,
            context=InvocationContext(
                actor_user_id=user.id,
                actor_role=user.role,
                invocation_id=invocation_id,
            ),
            claim_type="unfair_dismissal",
            document_ids=[doc_a.id, doc_b.id],
            provider_call=_empty_evidence_provider,
        )
    artifacts = (
        await db_session.scalars(
            select(MatterArtifact).where(
                MatterArtifact.invocation_id == invocation_id
            )
        )
    ).all()
    assert artifacts == []


@pytest.mark.asyncio
async def test_pre_motion_cross_matter_grant_denies(
    db_session, captured_audit_failures
) -> None:
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session)
    matter_a = await _make_matter(db_session, user)
    matter_b = await _make_matter(db_session, user)
    # Documents live on matter B, but grants are on matter A.
    doc_a = await _make_document(db_session, matter_b)
    doc_b = await _make_document(db_session, matter_b, text="x")
    await _grant_both(db_session, user, matter_a)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    with pytest.raises(CapabilityDenied):
        await draft_motion(
            session=db_session,
            matter=matter_b,
            context=InvocationContext(
                actor_user_id=user.id,
                actor_role=user.role,
                invocation_id=invocation_id,
            ),
            claim_type="unfair_dismissal",
            document_ids=[doc_a.id, doc_b.id],
            provider_call=_empty_evidence_provider,
        )


@pytest.mark.asyncio
async def test_pre_motion_document_not_in_matter_raises(
    db_session, captured_audit_failures
) -> None:
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session)
    matter_a = await _make_matter(db_session, user)
    matter_b = await _make_matter(db_session, user)
    own_doc = await _make_document(db_session, matter_a)
    foreign_doc = await _make_document(db_session, matter_b, text="x")
    await _grant_both(db_session, user, matter_a)
    await db_session.commit()

    with pytest.raises(ValueError, match="not found in matter"):
        await draft_motion(
            session=db_session,
            matter=matter_a,
            context=InvocationContext(
                actor_user_id=user.id,
                actor_role=user.role,
                invocation_id=uuid.uuid4(),
            ),
            claim_type="unfair_dismissal",
            document_ids=[own_doc.id, foreign_doc.id],
            provider_call=_empty_evidence_provider,
        )


@pytest.mark.asyncio
async def test_pre_motion_empty_document_ids_raises(db_session) -> None:
    """ValueError fires BEFORE any side effect — no posture check,
    no grant check, no model call."""
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    await db_session.commit()

    with pytest.raises(ValueError, match="non-empty"):
        await draft_motion(
            session=db_session,
            matter=matter,
            context=InvocationContext(
                actor_user_id=user.id,
                actor_role=user.role,
                invocation_id=uuid.uuid4(),
            ),
            claim_type="unfair_dismissal",
            document_ids=[],
            provider_call=_empty_evidence_provider,
        )


@pytest.mark.asyncio
async def test_pre_motion_unknown_claim_type_raises(db_session) -> None:
    from examples.modules.pre_motion.capability import (
        InvocationContext,
        draft_motion,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter)
    await db_session.commit()

    with pytest.raises(ValueError, match="unknown claim_type"):
        await draft_motion(
            session=db_session,
            matter=matter,
            context=InvocationContext(
                actor_user_id=user.id,
                actor_role=user.role,
                invocation_id=uuid.uuid4(),
            ),
            claim_type="nonsense_claim",
            document_ids=[doc.id],
            provider_call=_empty_evidence_provider,
        )


# ---------------------------------------------------------------------------
# Pure-functional unit tests on the parser + prompt builder
# ---------------------------------------------------------------------------


def test_parse_response_extracts_motion_and_evidence() -> None:
    from examples.modules.pre_motion.capability import _parse_response

    payload = json.dumps(
        {
            "motion": {"markdown": "# m", "claim_summary": "s"},
            "evidence": [
                {"document_id": "d1", "relevance": "r1", "citation_hint": "c1"},
                {"document_id": "d2", "relevance": "r2", "citation_hint": "c2"},
            ],
        }
    )
    motion, evidence = _parse_response(payload)
    assert motion == {"markdown": "# m", "claim_summary": "s"}
    assert len(evidence) == 2
    assert evidence[0].document_id == "d1"


def test_parse_response_rejects_non_json() -> None:
    from examples.modules.pre_motion.capability import _parse_response

    with pytest.raises(ValueError, match="non-JSON"):
        _parse_response("not json at all")


def test_parse_response_handles_empty_evidence() -> None:
    from examples.modules.pre_motion.capability import _parse_response

    motion, evidence = _parse_response(
        json.dumps({"motion": {"markdown": "x"}, "evidence": []})
    )
    assert evidence == []


def test_build_prompt_concats_all_documents() -> None:
    from examples.modules.pre_motion.capability import _build_prompt

    @dataclass
    class _D:
        id: str
        filename: str

    docs = [
        (_D(id="a", filename="alpha.pdf"), "ALPHA TEXT"),
        (_D(id="b", filename="bravo.docx"), "BRAVO TEXT"),
    ]
    prompt = _build_prompt(claim_type="unfair_dismissal", documents=docs)
    assert "ALPHA TEXT" in prompt
    assert "BRAVO TEXT" in prompt
    assert "alpha.pdf" in prompt
    assert "unfair_dismissal" in prompt


def test_build_prompt_handles_missing_extracted_text() -> None:
    from examples.modules.pre_motion.capability import _build_prompt

    @dataclass
    class _D:
        id: str
        filename: str

    prompt = _build_prompt(
        claim_type="breach_of_contract",
        documents=[(_D(id="x", filename="empty.pdf"), "")],
    )
    assert "no extracted text" in prompt
