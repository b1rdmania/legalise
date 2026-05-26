"""Phase 6 R2 — reviewer-found regressions.

Three P1s and one P2 from the first Phase 6 ratification pass:

- P1 #1: write_artifact must not overwrite an existing WORM artifact
  file. The path is now keyed by row id, not (invocation_id, kind).
- P1 #2: review_contract must enforce per-user grants at the
  read + write boundaries via require_capability — not "assume the
  host already checked".
- P1 #3: review_contract takes actor_role via an InvocationContext
  populated by a trusted caller; the module cannot self-assert
  qualified_solicitor.
- P2: review_contract reads the document's extracted text into the
  prompt instead of substituting a placeholder. (Smoke-level: the
  test asserts the document text shows up in the prompt builder
  output.)
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.capabilities import CapabilityDenied
from app.core.matter_artifacts import write_artifact
from app.models import (
    BODY_KIND_VALUES,
    Document,
    DocumentBody,
    Matter,
    MatterArtifact,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# Helpers shared with the vertical-slice test.
async def _make_user(db_session, *, role: str = "solicitor") -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p6-r2-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role=role,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"r2-{uuid.uuid4().hex[:8]}",
        title="R2 Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


async def _make_document(db_session, matter, *, text: str = "") -> Document:
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
    if text:
        body = DocumentBody(
            document_id=doc.id,
            kind="extracted",
            extracted_text=text,
            extraction_method="passthrough",
            char_count=len(text),
        )
        db_session.add(body)
        await db_session.flush()
    return doc


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
    # Return a deterministic empty-findings payload — keeps the test
    # focused on the governance contract, not the parser.
    return _StubResponse(text=json.dumps({"findings": []}))


# -------------------- P1 #1 — artifact write does not overwrite --------------------


@pytest.mark.asyncio
async def test_duplicate_write_does_not_alter_original_file(db_session) -> None:
    """Reviewer R2 P1 #1: a second write with the same
    (invocation_id, kind) MUST NOT overwrite the original file
    before the DB UNIQUE constraint rejects it."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    # First write: original content.
    original = {"findings": [{"clause": "first", "severity": "high"}]}
    artifact1 = await write_artifact(
        db_session,
        matter=matter,
        capability_id="review",
        module_id="examples.contract-review",
        invocation_id=invocation_id,
        kind="findings_pack",
        payload=original,
        actor_user_id=user.id,
    )
    # Pull values into locals BEFORE the commit so we hold no lazy
    # attributes that the post-rollback session can't materialise.
    original_path = artifact1.storage_path
    original_id = artifact1.id
    await db_session.commit()

    original_bytes = Path(original_path).read_bytes()

    # Second write: same (invocation_id, kind), different payload.
    duplicate = {"findings": [{"clause": "tampered", "severity": "high"}]}
    with pytest.raises(Exception):
        await write_artifact(
            db_session,
            matter=matter,
            capability_id="review",
            module_id="examples.contract-review",
            invocation_id=invocation_id,
            kind="findings_pack",
            payload=duplicate,
            actor_user_id=user.id,
        )
        await db_session.commit()
    await db_session.rollback()

    # Original file UNTOUCHED.
    assert Path(original_path).exists()
    assert Path(original_path).read_bytes() == original_bytes
    # And only one row exists.
    rows = (
        await db_session.scalars(
            select(MatterArtifact).where(
                MatterArtifact.invocation_id == invocation_id,
                MatterArtifact.kind == "findings_pack",
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].id == original_id


# -------------------- P1 #2 — grants are enforced at runtime --------------------


@pytest.mark.asyncio
async def test_missing_read_grant_blocks_with_no_artifact(db_session) -> None:
    """Reviewer R2 P1 #2: without the matter.document.read grant,
    review_contract must fail via CapabilityDenied BEFORE any
    artifact is written, model invoked, or gate evaluated."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter, text="some NDA text")
    # NB: NO grants inserted.
    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    with pytest.raises(CapabilityDenied):
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_stub_provider,
        )

    # No artifact landed.
    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is None


@pytest.mark.asyncio
async def test_missing_write_grant_blocks_after_read(db_session) -> None:
    """Reviewer R2 P1 #2: even with the read grant, missing
    matter.artifact.write must block — and no artifact must land."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter, text="some NDA text")
    # Grant ONLY the read.
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.contract-review",
            skill="review",
            capability="matter.document.read",
            capability_version="2.0.0",
            granted_at_module_version="1.0.0",
        )
    )
    await db_session.flush()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    with pytest.raises(CapabilityDenied):
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_stub_provider,
        )

    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is None


# -------------------- P1 #3 — module cannot self-assert role --------------------


@pytest.mark.asyncio
async def test_module_cannot_smuggle_actor_role(db_session) -> None:
    """Reviewer R2 P1 #3: the module receives actor_role via the
    InvocationContext; it cannot override the caller's claim
    inside the function. We assert the contract by verifying that
    the gate's recorded actor_role matches what the host (test)
    handed in — even when that role is the bare default 'solicitor'
    rather than 'qualified_solicitor'."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter, text="contract text")
    # Both grants.
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
            )
        )
    await db_session.flush()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,  # "solicitor", NOT "qualified_solicitor"
        invocation_id=invocation_id,
    )
    await review_contract(
        session=db_session,
        matter=matter,
        context=context,
        document_id=doc.id,
        provider_call=_stub_provider,
    )
    await db_session.commit()

    # The advice-boundary decision row records the actual role used,
    # which must be the one the host supplied, not "qualified_solicitor".
    from app.models import AdviceBoundaryDecision

    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.output_id == str(invocation_id)
        )
    )
    assert decision is not None
    assert decision.actor_role == "solicitor", (
        f"module appears to have smuggled an elevated role: "
        f"{decision.actor_role!r}"
    )


# -------------------- P2 — document text is actually in the prompt --------------------


def test_prompt_contains_document_text() -> None:
    """Reviewer R2 P2: the prompt now embeds the document's
    extracted text rather than a placeholder."""
    from examples.modules.contract_review.capability import _build_prompt

    @dataclass
    class _D:
        filename: str

    doc = _D(filename="nda.pdf")
    prompt = _build_prompt(doc, "REAL CONTRACT TEXT GOES HERE")
    assert "REAL CONTRACT TEXT GOES HERE" in prompt
    # Old placeholder must not appear.
    assert "document text omitted" not in prompt


def test_prompt_handles_missing_extraction() -> None:
    """If the document has no extracted body, the prompt explicitly
    says so — never claims to have reviewed text that wasn't there."""
    from examples.modules.contract_review.capability import _build_prompt

    @dataclass
    class _D:
        filename: str

    doc = _D(filename="empty.pdf")
    prompt = _build_prompt(doc, "")
    assert "no extracted text" in prompt
