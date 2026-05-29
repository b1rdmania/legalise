"""Source Anchors v1 — P1 redline regression.

``_load_documents`` must hash and cite the EXTRACTED body, not whichever
DocumentBody row SQL returns first. A document with both an extracted and
a redacted body row produces an anchor whose body_sha256 + body_text match
the extracted row.
"""

from __future__ import annotations

import hashlib
import uuid

import pytest

from app.core.prompt_runtime import _build_source_anchors, _load_documents
from app.models import Document, Matter, PRIVILEGE_CLEARED, STATUS_OPEN, User
from app.models.document_body import (
    BODY_KIND_EXTRACTED,
    BODY_KIND_REDACTED,
    DocumentBody,
)


@pytest.mark.asyncio
async def test_load_documents_uses_extracted_body_not_redacted(db_session) -> None:
    user = User(
        id=uuid.uuid4(),
        email=f"sa-eb-{uuid.uuid4().hex[:8]}@example.com",
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
        slug=f"sa-eb-{uuid.uuid4().hex[:8]}",
        title="Anchor Body Kind Regression",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    doc = Document(
        id=uuid.uuid4(),
        matter_id=matter.id,
        filename="note.txt",
        mime_type="text/plain",
        size_bytes=100,
        sha256="0" * 64,
        storage_uri=None,
        tag=None,
        from_disclosure=False,
        uploaded_by_id=user.id,
    )
    db_session.add(doc)
    await db_session.flush()
    extracted = "Acme dismissed Ms Khan on 12 March 2026."
    redacted = "[REDACTED] dismissed [REDACTED] on [REDACTED]."
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

    docs = await _load_documents(db_session, matter, [doc.id])
    assert len(docs) == 1
    assert docs[0]["body_text"] == extracted
    assert docs[0]["body_text"] != redacted

    # Anchor body_sha256 hashes the extracted body, not the redacted one.
    anchors, _ = _build_source_anchors(docs, [])
    expected = hashlib.sha256(extracted.encode("utf-8")).hexdigest()
    assert anchors[0]["body_sha256"] == expected

    # And a quote that appears only in the redacted text is correctly NOT
    # found in source (the source is extracted).
    anchors_with_quote, _ = _build_source_anchors(
        docs,
        [{"text": "claim", "source_handles": ["D1"], "quote": "[REDACTED]"}],
    )
    q_anchor = next(a for a in anchors_with_quote if a["id"].startswith("src_q"))
    assert q_anchor["quote_found_in_source"] is False
