"""LMF-2 — matter export bundle completeness.

The export ZIP must now include artifact bytes, supervisor review
decisions, the reconstruction timeline, and a README, in addition to the
matter metadata / documents / audit / jobs it already carried.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile

import pytest
from sqlalchemy import select

from app.core.exports import build_matter_export
from app.core.matter_artifacts import write_artifact
from app.core.reviews import request_review
from app.core.storage import get_storage_backend
from app.models import (
    Document,
    DocumentComment,
    DocumentEdit,
    DocumentVersion,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)


async def _seed(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"exp-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role="solicitor",
    )
    db_session.add(user)
    await db_session.flush()
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"exp-{uuid.uuid4().hex[:8]}",
        title="Export Completeness Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    document = Document(
        id=uuid.uuid4(),
        matter_id=matter.id,
        filename="dismissal-note.txt",
        mime_type="text/plain",
        size_bytes=124,
        sha256="d" * 64,
        storage_uri=None,
        tag="draft",
        from_disclosure=False,
        uploaded_by_id=user.id,
    )
    db_session.add(document)
    await db_session.flush()
    upload_version = DocumentVersion(
        id=uuid.uuid4(),
        document_id=document.id,
        version_number=1,
        kind="upload",
        created_by_id=user.id,
        notes="Initial upload.",
        resolved_text="Original dismissal note.",
    )
    edited_version = DocumentVersion(
        id=uuid.uuid4(),
        document_id=document.id,
        version_number=2,
        kind="user_edit",
        created_by_id=user.id,
        notes="Clarified date.",
        resolved_text="Edited dismissal note.",
        resolved_json={"type": "doc", "content": []},
    )
    db_session.add_all([upload_version, edited_version])
    await db_session.flush()
    db_session.add(
        DocumentComment(
            id=uuid.uuid4(),
            document_id=document.id,
            author_id=user.id,
            quote_text="dismissal note",
            body_sha256="a" * 64,
            anchor_start=9,
            anchor_end=23,
            body="Check this against the source.",
            status="open",
        )
    )
    db_session.add(
        DocumentEdit(
            id=uuid.uuid4(),
            document_version_id=edited_version.id,
            change_id="change-1",
            deleted_text="Original",
            inserted_text="Edited",
            context_before="",
            context_after=" dismissal note.",
            status="accepted",
            rationale="Clarifies source wording.",
            resolved_by_id=user.id,
        )
    )
    artifact = await write_artifact(
        db_session,
        matter=matter,
        capability_id="review",
        module_id="examples.contract-review",
        invocation_id=uuid.uuid4(),
        kind="findings_pack",
        payload={"findings": [{"clause": "5.2", "severity": "high"}]},
        actor_user_id=user.id,
    )
    review = await request_review(
        db_session, matter=matter, artifact=artifact, user=user
    )
    await db_session.commit()
    return user, matter, artifact, review, document, edited_version


@pytest.mark.asyncio
async def test_export_bundle_includes_artifacts_reviews_reconstruction_readme(
    db_session,
) -> None:
    _user, matter, artifact, review, document, edited_version = await _seed(db_session)
    job_id = uuid.uuid4()

    export_key = await build_matter_export(db_session, matter, job_id)

    raw = get_storage_backend().get_bytes(export_key)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())
        # New LMF-2 members.
        assert "artefacts.json" in names
        assert "reviews.json" in names
        assert "reconstruction.json" in names
        assert "README.md" in names
        assert "document_versions.json" in names
        assert "document_edits.json" in names
        # Artifact bytes are included (not just metadata).
        assert f"artefacts/{artifact.id}/findings_pack.json" in names
        artifact_bytes = json.loads(
            zf.read(f"artefacts/{artifact.id}/findings_pack.json")
        )
        assert artifact_bytes["findings"][0]["clause"] == "5.2"
        # Review decision is captured.
        reviews = json.loads(zf.read("reviews.json"))
        assert any(r["id"] == str(review.id) and r["state"] == "pending" for r in reviews)
        versions = json.loads(zf.read("document_versions.json"))
        assert any(
            v["document_id"] == str(document.id)
            and v["version_number"] == 2
            and v["resolved_text"] == "Edited dismissal note."
            and v["resolved_json"] == {"type": "doc", "content": []}
            for v in versions
        )
        edits = json.loads(zf.read("document_edits.json"))
        assert any(
            e["document_id"] == str(document.id)
            and e["document_version_id"] == str(edited_version.id)
            and e["status"] == "accepted"
            and e["inserted_text"] == "Edited"
            for e in edits
        )
        comments = json.loads(zf.read("document_comments.json"))
        assert any(
            c["document_id"] == str(document.id)
            and c["quote_text"] == "dismissal note"
            and c["body_sha256"] == "a" * 64
            and c["anchor_start"] == 9
            and c["anchor_end"] == 23
            for c in comments
        )
        doc_meta = json.loads(zf.read(f"documents/{document.id}/metadata.json"))
        assert doc_meta["version_count"] == 2
        assert doc_meta["edit_count"] == 1
        assert doc_meta["comment_count"] == 1
        # Reconstruction has the review.requested row.
        recon = json.loads(zf.read("reconstruction.json"))
        assert any(e["action"] == "review.requested" for e in recon)
        # README names the contents.
        readme = zf.read("README.md").decode("utf-8")
        assert "Matter export" in readme
