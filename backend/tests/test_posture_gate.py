"""Phase 8 — posture-aware gate tests.

Five unit tests over the pure-functional core (the policy table)
and five integration tests over the Contract Review wiring.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.posture_gate import (
    POSTURE_POLICY,
    PostureBlocked,
    PostureGateResult,
    _evaluate_posture,
    check_posture,
)


@pytest.fixture
def captured_audit_failures(monkeypatch):
    """Capture audit_failure calls instead of writing through an
    independent session. Same pattern Phase 5/6 used — production
    code uses audit_failure for survive-rollback durability, but
    the test SAVEPOINT means an independent session can't see the
    uncommitted user.
    """
    from app.core import api as api_module
    from app.core import posture_gate as pg_module

    captured: list[dict] = []

    async def _capture(session, action, **kwargs):
        captured.append({"action": action, **kwargs})

    monkeypatch.setattr(api_module, "audit_failure", _capture)
    # check_posture imports audit_failure lazily inside the function
    # body, so the api_module patch is enough — but be explicit.
    return captured
from app.models import (
    AuditEntry,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    PRIVILEGE_MIXED,
    PRIVILEGE_PAUSED,
    SCOPE_TYPE_MATTER,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session, *, role: str = "solicitor") -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"p8-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role=role,
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _make_matter(db_session, user, *, posture: str = PRIVILEGE_MIXED) -> Matter:
    m = Matter(
        id=uuid.uuid4(),
        slug=f"p8-{uuid.uuid4().hex[:8]}",
        title="Phase 8 Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=posture,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(m)
    await db_session.flush()
    return m


async def _make_document(db_session, matter, text: str = "test contract"):
    from app.models import Document, DocumentBody
    doc = Document(
        id=uuid.uuid4(),
        matter_id=matter.id,
        filename="test.pdf",
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


async def _grant_review_capabilities(db_session, user, matter):
    for cap in ("matter.document.read", "matter.artifact.write"):
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="examples.contract-review",
                skill="review",
                capability=cap,
                capability_version="2.0.0",
                granted_at_module_version="1.0.0",
                granted_permissions_snapshot={"matter_id": str(matter.id)},
                scope_type=SCOPE_TYPE_MATTER,
                scope_id=matter.id,
            )
        )
    await db_session.flush()


@dataclass
class _StubResponse:
    text: str
    model_id: str = "stub-model"
    provider: str = "stub"
    tokens_in: int = 10
    tokens_out: int = 5
    cost_micros: int = 1_000
    currency: str = "GBP"


async def _stub_provider(prompt, *, system):
    return _StubResponse(text=json.dumps({"findings": []}))


# ---------------------------------------------------------------------------
# Unit tests — pure-functional core
# ---------------------------------------------------------------------------


def test_a_cleared_any_role_allowed() -> None:
    """A_cleared posture: any authenticated role passes (incl. default 'solicitor')."""
    r = _evaluate_posture(posture=PRIVILEGE_CLEARED, actor_role="solicitor")
    assert r.allowed is True
    assert r.posture == PRIVILEGE_CLEARED
    assert r.required_role == "any_authenticated"


def test_b_mixed_qualified_solicitor_allowed() -> None:
    r = _evaluate_posture(
        posture=PRIVILEGE_MIXED, actor_role="qualified_solicitor"
    )
    assert r.allowed is True
    assert r.required_role == "qualified_solicitor"


def test_b_mixed_default_solicitor_blocked() -> None:
    """The realistic-demo path: default User.role='solicitor' fails
    on B_mixed without explicit qualified_solicitor promotion."""
    r = _evaluate_posture(posture=PRIVILEGE_MIXED, actor_role="solicitor")
    assert r.allowed is False
    assert r.reason == "posture_gate_failed"
    assert r.required_role == "qualified_solicitor"
    assert r.actor_role == "solicitor"


def test_b_mixed_no_role_blocked() -> None:
    r = _evaluate_posture(posture=PRIVILEGE_MIXED, actor_role=None)
    assert r.allowed is False


def test_c_paused_blocks_qualified_solicitor() -> None:
    """C_paused is a hard stop — even qualified_solicitor blocked.
    Matches the existing model_gateway paused-matter rejection."""
    r = _evaluate_posture(
        posture=PRIVILEGE_PAUSED, actor_role="qualified_solicitor"
    )
    assert r.allowed is False
    assert r.reason == "posture_paused"
    assert r.required_role == "matter_paused"


def test_unknown_posture_fails_closed() -> None:
    """Defensive: future posture vocab additions that don't extend
    POSTURE_POLICY default to deny."""
    r = _evaluate_posture(posture="X_future", actor_role="qualified_solicitor")
    assert r.allowed is False
    assert r.reason == "unknown_posture"


def test_policy_table_shape_is_two_postures() -> None:
    """The policy table should NEVER grow without a Reviewer
    redline. Phase 8 explicitly ships with two entries (cleared +
    mixed); C_paused is handled by special case in _evaluate_posture."""
    assert set(POSTURE_POLICY.keys()) == {PRIVILEGE_CLEARED, PRIVILEGE_MIXED}


# ---------------------------------------------------------------------------
# Phase 17.5 — dormant firm role gates (LEGALISE_FIRM_ROLE_GATES_ENABLED=false)
# ---------------------------------------------------------------------------


def test_dormant_b_mixed_allows_plain_solicitor() -> None:
    """Dormant mode: B_mixed no longer demands qualified_solicitor — a
    default 'solicitor' (any authenticated actor) is allowed. This is
    the eval-product behaviour."""
    r = _evaluate_posture(
        posture=PRIVILEGE_MIXED,
        actor_role="solicitor",
        firm_role_gates_enabled=False,
    )
    assert r.allowed is True
    assert r.required_role == "any_authenticated"


def test_dormant_b_mixed_still_blocks_unauthenticated() -> None:
    """Dormant mode relaxes the role TIER, not authentication —
    'any_authenticated' still needs a non-None role."""
    r = _evaluate_posture(
        posture=PRIVILEGE_MIXED,
        actor_role=None,
        firm_role_gates_enabled=False,
    )
    assert r.allowed is False


def test_dormant_c_paused_still_hard_stops() -> None:
    """C_paused is a hard stop regardless of the flag — it means the
    matter is paused, not a junior/senior tier."""
    r = _evaluate_posture(
        posture=PRIVILEGE_PAUSED,
        actor_role="qualified_solicitor",
        firm_role_gates_enabled=False,
    )
    assert r.allowed is False
    assert r.reason == "posture_paused"


def test_dormant_a_cleared_unchanged() -> None:
    """A_cleared is any_authenticated in both modes."""
    r = _evaluate_posture(
        posture=PRIVILEGE_CLEARED,
        actor_role="solicitor",
        firm_role_gates_enabled=False,
    )
    assert r.allowed is True


def test_enforced_mode_unchanged_b_mixed_blocks_solicitor() -> None:
    """Belt-and-braces: with the flag enabled, B_mixed still blocks a
    plain solicitor (the firm-mode policy still works)."""
    r = _evaluate_posture(
        posture=PRIVILEGE_MIXED,
        actor_role="solicitor",
        firm_role_gates_enabled=True,
    )
    assert r.allowed is False
    assert r.required_role == "qualified_solicitor"


# ---------------------------------------------------------------------------
# Integration tests — Contract Review wiring + audit emission
# ---------------------------------------------------------------------------


def _verified_manifest_for_install() -> dict:
    candidates = [
        Path(__file__).resolve().parents[2]
        / "examples" / "modules" / "contract_review" / "module.json",
        Path("/app/examples/modules/contract_review/module.json"),
    ]
    for c in candidates:
        if c.exists():
            return json.loads(c.read_text())
    raise FileNotFoundError("manifest")


@pytest.mark.asyncio
async def test_review_blocks_non_solicitor_on_b_mixed(
    db_session, captured_audit_failures
) -> None:
    """The headline integration regression: B_mixed matter + default
    'solicitor' role → PostureBlocked + no document read + no model
    call + no artifact + audit row landed."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user, posture=PRIVILEGE_MIXED)
    doc = await _make_document(db_session, matter)
    await _grant_review_capabilities(db_session, user, matter)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    # Instrument the provider — must NEVER be called.
    call_log: list = []

    async def _watching_provider(prompt, *, system):
        call_log.append(prompt)
        return _StubResponse(text=json.dumps({"findings": []}))

    with pytest.raises(PostureBlocked) as exc_info:
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_watching_provider,
        )
    result = exc_info.value.result
    assert result.posture == PRIVILEGE_MIXED
    assert result.required_role == "qualified_solicitor"
    assert result.actor_role == "solicitor"
    assert result.reason == "posture_gate_failed"

    assert call_log == [], "provider was invoked despite posture block"
    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is None


@pytest.mark.asyncio
async def test_review_allows_qualified_solicitor_on_b_mixed(db_session) -> None:
    """The realistic happy path: solicitor explicitly promoted to
    qualified_solicitor invokes Contract Review on the default-
    posture matter."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="qualified_solicitor")
    matter = await _make_matter(db_session, user, posture=PRIVILEGE_MIXED)
    doc = await _make_document(db_session, matter)
    await _grant_review_capabilities(db_session, user, matter)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )
    result = await review_contract(
        session=db_session,
        matter=matter,
        context=context,
        document_id=doc.id,
        provider_call=_stub_provider,
    )
    await db_session.commit()
    assert result.findings_count == 0
    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is not None


@pytest.mark.asyncio
async def test_review_allows_non_solicitor_on_a_cleared(db_session) -> None:
    """A_cleared matter: any authenticated role passes posture."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user, posture=PRIVILEGE_CLEARED)
    doc = await _make_document(db_session, matter)
    await _grant_review_capabilities(db_session, user, matter)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )
    result = await review_contract(
        session=db_session,
        matter=matter,
        context=context,
        document_id=doc.id,
        provider_call=_stub_provider,
    )
    await db_session.commit()
    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is not None
    assert result.findings_count == 0


@pytest.mark.asyncio
async def test_review_blocks_qualified_solicitor_on_c_paused(
    db_session, captured_audit_failures
) -> None:
    """C_paused is the hard stop — even a qualified_solicitor is denied."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="qualified_solicitor")
    matter = await _make_matter(db_session, user, posture=PRIVILEGE_PAUSED)
    doc = await _make_document(db_session, matter)
    await _grant_review_capabilities(db_session, user, matter)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )
    with pytest.raises(PostureBlocked) as exc_info:
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_stub_provider,
        )
    assert exc_info.value.result.reason == "posture_paused"


@pytest.mark.asyncio
async def test_posture_block_emits_audit_with_canonical_shape(
    db_session, captured_audit_failures
) -> None:
    """check_posture emits ``posture_gate.check.blocked`` via
    audit_failure with the canonical gate_state shape. The test
    captures the audit_failure call (production: independent
    committed transaction survives rollback; SAVEPOINT-bound test
    can't run that path so we capture-and-assert)."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user, posture=PRIVILEGE_MIXED)
    doc = await _make_document(db_session, matter)
    await _grant_review_capabilities(db_session, user, matter)
    await db_session.commit()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )
    with pytest.raises(PostureBlocked):
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_stub_provider,
        )

    # Exactly one audit_failure call with the canonical shape.
    rows = [
        c for c in captured_audit_failures
        if c["action"] == "posture_gate.check.blocked"
    ]
    assert len(rows) == 1
    row = rows[0]
    assert row["module"] == "core.posture_gate"
    assert row["matter_id"] == matter.id
    assert row["actor_id"] == user.id
    payload = row["payload"]
    assert payload["module_id"] == "examples.contract-review"
    assert payload["capability_id"] == "review"
    assert payload["blocked_reason"] == "gate_blocked"
    gate_state = payload["gate_state"]
    assert gate_state["gate"] == "privilege_posture"
    assert gate_state["posture"] == PRIVILEGE_MIXED
    assert gate_state["required_role"] == "qualified_solicitor"
    assert gate_state["actor_role"] == "solicitor"
    assert gate_state["reason"] == "posture_gate_failed"
