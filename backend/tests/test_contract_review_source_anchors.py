"""Contract Review Source Anchors v1.

The reference Contract Review module now emits the same structured
source_anchors contract as prompt-runtime modules. The important
integrity point: anchors are built from the server-loaded extracted
body, not model-supplied identity and not a redacted/derived body row.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass

import pytest
from sqlalchemy import select

from app.core.matter_artifacts import load_artifact_payload
from app.core.runtime import InvocationContext
from app.models import (
    Document,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    SCOPE_TYPE_MATTER,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)
from app.models.document_body import (
    BODY_KIND_EXTRACTED,
    BODY_KIND_REDACTED,
    DocumentBody,
)
from examples.modules.contract_review.capability import review_contract


@dataclass
class _StubResponse:
    text: str
    model_id: str = "stub-echo"
    provider: str = "stub"
    tokens_in: int = 10
    tokens_out: int = 0
    cost_micros: int | None = None
    currency: str | None = None


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"cr-sa-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role="solicitor",
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user: User) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"cr-sa-{uuid.uuid4().hex[:8]}",
        title="Contract Review Source Anchors",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


async def _make_document_with_two_bodies(db_session, matter: Matter) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        matter_id=matter.id,
        filename="source-nda.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes=100,
        sha256="a" * 64,
        storage_uri="s3://bucket/source-nda.docx",
        tag="contract",
        from_disclosure=False,
        uploaded_by_id=matter.created_by_id,
    )
    db_session.add(doc)
    await db_session.flush()
    extracted = (
        "The supplier gives an unlimited indemnity for any losses. "
        "The agreement is governed by English law."
    )
    redacted = "[REDACTED] gives an [REDACTED] indemnity for any losses."
    db_session.add(
        DocumentBody(
            document_id=doc.id,
            kind=BODY_KIND_EXTRACTED,
            extracted_text=extracted,
            extraction_method="passthrough",
            char_count=len(extracted),
        )
    )
    db_session.add(
        DocumentBody(
            document_id=doc.id,
            kind=BODY_KIND_REDACTED,
            extracted_text=redacted,
            extraction_method="passthrough",
            char_count=len(redacted),
        )
    )
    await db_session.flush()
    return doc


async def _grant_review(db_session, user: User, matter: Matter) -> None:
    for capability in ("matter.document.read", "matter.artifact.write"):
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="examples.contract-review",
                skill="review",
                capability=capability,
                capability_version="2.0.0",
                granted_at_module_version="1.0.0",
                granted_permissions_snapshot={"matter_id": str(matter.id)},
                scope_type=SCOPE_TYPE_MATTER,
                scope_id=matter.id,
            )
        )
    await db_session.flush()


@pytest.mark.asyncio
async def test_contract_review_writes_source_anchors_from_extracted_body(
    db_session,
) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc = await _make_document_with_two_bodies(db_session, matter)
    await _grant_review(db_session, user, matter)
    await db_session.commit()

    async def _provider(prompt: str, *, system: str):
        assert "Document handle: D1" in prompt
        return _StubResponse(
            text=json.dumps(
                {
                    "findings": [
                        {
                            "clause_id": "5.2",
                            "severity": "high",
                            "comment": "Unlimited indemnity should be reviewed.",
                            "citation": "clause 5.2",
                            "source_handles": ["D1"],
                            "quote": "unlimited indemnity",
                        },
                        {
                            "clause_id": "6",
                            "severity": "medium",
                            "comment": "This fabricated quote is not in the extracted body.",
                            "citation": "clause 6",
                            "source_handles": ["D1"],
                            "quote": "[REDACTED]",
                        },
                    ]
                }
            )
        )

    invocation_id = uuid.uuid4()
    await review_contract(
        session=db_session,
        matter=matter,
        context=InvocationContext(
            actor_user_id=user.id,
            actor_role=user.role,
            invocation_id=invocation_id,
        ),
        document_id=doc.id,
        provider_call=_provider,
    )
    await db_session.commit()

    artifact = await db_session.scalar(
        select(MatterArtifact).where(MatterArtifact.invocation_id == invocation_id)
    )
    assert artifact is not None
    payload = load_artifact_payload(artifact.storage_path)

    assert payload["findings"][0]["source_handles"] == ["D1"]
    assert payload["claims"][0]["anchor_ids"] == ["src_d1", "src_q1"]
    assert payload["claims"][1]["anchor_ids"] == ["src_d1", "src_q2"]

    doc_anchor = next(a for a in payload["source_anchors"] if a["id"] == "src_d1")
    assert doc_anchor["document_id"] == str(doc.id)
    assert doc_anchor["filename"] == "source-nda.docx"
    expected_body_sha = hashlib.sha256(
        (
            "The supplier gives an unlimited indemnity for any losses. "
            "The agreement is governed by English law."
        ).encode("utf-8")
    ).hexdigest()
    assert doc_anchor["body_sha256"] == expected_body_sha

    quote_flags = {
        a["quote"]: a["quote_found_in_source"]
        for a in payload["source_anchors"]
        if a["id"].startswith("src_q")
    }
    assert quote_flags["unlimited indemnity"] is True
    # This quote exists only in the redacted body. Contract Review must
    # check against the extracted source body it actually reviewed.
    assert quote_flags["[REDACTED]"] is False


@pytest.mark.asyncio
async def test_contract_review_emits_document_anchor_even_without_model_claims(
    db_session,
) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    doc = await _make_document_with_two_bodies(db_session, matter)
    await _grant_review(db_session, user, matter)
    await db_session.commit()

    async def _provider(_prompt: str, *, system: str):
        return _StubResponse(
            text=json.dumps(
                {
                    "findings": [
                        {
                            "clause_id": "5.2",
                            "severity": "high",
                            "comment": "Unlimited indemnity should be reviewed.",
                            "citation": "clause 5.2",
                        }
                    ]
                }
            )
        )

    invocation_id = uuid.uuid4()
    await review_contract(
        session=db_session,
        matter=matter,
        context=InvocationContext(
            actor_user_id=user.id,
            actor_role=user.role,
            invocation_id=invocation_id,
        ),
        document_id=doc.id,
        provider_call=_provider,
    )
    await db_session.commit()

    artifact = await db_session.scalar(
        select(MatterArtifact).where(MatterArtifact.invocation_id == invocation_id)
    )
    assert artifact is not None
    payload = load_artifact_payload(artifact.storage_path)

    assert [a["id"] for a in payload["source_anchors"]] == ["src_d1"]
    assert payload["claims"] == [
        {
            "id": "finding_1",
            "text": "Unlimited indemnity should be reviewed.",
            "anchor_ids": [],
        }
    ]
