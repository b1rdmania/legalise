"""Out-of-band document indexing on upload.

Chunking + embedding a document used to run *inline* in the upload request,
which blocked the response and risked a timeout on big docs. The upload now:

  1. persists the bytes + extracted body,
  2. marks the document ``index_status='pending'`` (NOT indexed inline),
  3. creates a ``kind=index`` Job carrying the document id,
  4. commits, then enqueues the job for the arq worker.

These tests prove (a) the upload path leaves a pending doc + an index job and
does not index inline, and (b) running the index job (``worker._run_index``)
actually indexes the document — status ``indexed`` with chunks present.

The arq enqueue is patched out (``app.core.jobs.enqueue_job``) so no Redis is
required. DB-backed: skips when Postgres is unreachable (see conftest.py).
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from app.models import Document, JOB_KIND_INDEX, Job, Matter
from app.models.document_chunk import DocumentChunk


EMAIL = "upload-index-e2e@example.com"
PASSWORD = "upload-index-e2e-password-2026"
KHAN_SLUG = "khan-v-acme-trading-2026"

# Enough prose that chunk_text yields at least one chunk.
_DOC_TEXT = (
    "Witness statement of Jasmine Khan. The supply contract with Acme Trading "
    "was signed on 1 March 2026. Acme failed to deliver the goods by the agreed "
    "date and did not respond to the chaser correspondence sent on 14 March. "
).encode("utf-8")


async def _signup_and_login(client) -> None:
    reg = await client.post(
        "/auth/register", json={"email": EMAIL, "password": PASSWORD}
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": EMAIL, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


async def _upload_doc(client) -> str:
    """Upload a text document with the enqueue patched out. Returns its id."""
    with patch("app.core.jobs.enqueue_job") as mock_enqueue:
        mock_enqueue.return_value = None
        resp = await client.post(
            f"/api/matters/{KHAN_SLUG}/documents",
            files={"file": ("statement.txt", _DOC_TEXT, "text/plain")},
        )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_upload_creates_pending_doc_and_index_job(client, db_session) -> None:
    """Upload returns a ``pending`` document, creates exactly one index job
    carrying the document id, and does NOT index inline (no chunks yet)."""
    await _signup_and_login(client)

    with patch("app.core.jobs.enqueue_job") as mock_enqueue:
        mock_enqueue.return_value = None
        resp = await client.post(
            f"/api/matters/{KHAN_SLUG}/documents",
            files={"file": ("statement.txt", _DOC_TEXT, "text/plain")},
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    # 1. The document is pending, not indexed inline.
    assert body["index_status"] == "pending"
    doc_id = body["id"]

    # 2. The job was handed to the worker exactly once.
    assert mock_enqueue.call_count == 1

    # 3. Exactly one index Job exists, carrying this document id.
    matter = await db_session.scalar(select(Matter).where(Matter.slug == KHAN_SLUG))
    jobs = (
        await db_session.scalars(
            select(Job).where(
                Job.matter_id == matter.id, Job.kind == JOB_KIND_INDEX
            )
        )
    ).all()
    assert len(jobs) == 1
    assert jobs[0].input_payload["document_id"] == doc_id

    # 4. Nothing was indexed inline: no chunks for this document yet.
    chunk_count = await db_session.scalar(
        select(func.count())
        .select_from(DocumentChunk)
        .where(DocumentChunk.document_id == uuid.UUID(doc_id))
    )
    assert chunk_count == 0


@pytest.mark.asyncio
async def test_run_index_job_indexes_document(client, db_session) -> None:
    """Running the index job (``worker._run_index``) chunks + embeds the
    document, flips its status to ``indexed``, and produces chunk rows."""
    from app.worker import _run_index

    await _signup_and_login(client)
    body = await _upload_doc(client)
    doc_id = body["id"]

    matter = await db_session.scalar(select(Matter).where(Matter.slug == KHAN_SLUG))
    job = await db_session.scalar(
        select(Job).where(Job.matter_id == matter.id, Job.kind == JOB_KIND_INDEX)
    )
    assert job is not None

    result = await _run_index(db_session, job, matter)

    assert result["document_id"] == doc_id
    assert result["index_status"] == "indexed"

    doc = await db_session.scalar(
        select(Document).where(Document.id == uuid.UUID(doc_id))
    )
    assert doc.index_status == "indexed"

    chunk_count = await db_session.scalar(
        select(func.count())
        .select_from(DocumentChunk)
        .where(DocumentChunk.document_id == uuid.UUID(doc_id))
    )
    assert chunk_count > 0


@pytest.mark.asyncio
async def test_run_index_missing_document_fails_cleanly(client, db_session) -> None:
    """If the document row is gone before indexing runs, ``_run_index`` raises
    a clear error (which run_job records as a failed job) rather than crash."""
    from app.worker import _run_index

    await _signup_and_login(client)
    matter = await db_session.scalar(select(Matter).where(Matter.slug == KHAN_SLUG))

    # Fabricate an index job referencing a non-existent document.
    job = Job(
        id=uuid.uuid4(),
        matter_id=matter.id,
        created_by_id=matter.created_by_id,
        kind=JOB_KIND_INDEX,
        input_payload={"document_id": str(uuid.uuid4())},
    )
    db_session.add(job)
    await db_session.flush()

    with pytest.raises(ValueError):
        await _run_index(db_session, job, matter)
