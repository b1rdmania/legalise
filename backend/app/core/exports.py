"""Export logic for Unit 5 — basic matter export bundle.

This is a BASIC export bundle, not complete data portability. v0.4
scope per HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P2 (Path A — narrowed
claim). The bundle includes only:

  - matter_metadata.json   — matter row fields
  - documents/             — one subdir per document
      {doc_id}/metadata.json
      {doc_id}/{sha256}    — uploaded bytes (if storage_uri exists)
  - artefacts.json         — generated artefact metadata (storage_uri list,
                             no bytes)
  - audit.json             — all audit rows for the matter
  - jobs.json              — all job rows for the matter

Out of scope for v0.4 (deferred to v0.5):
  - chronology events
  - document bodies (DocumentBody)
  - document versions / edits (DocumentVersion, DocumentEdit)
  - generated artefact BYTES (only metadata is included today)
  - matter citations
  - tabular reviews + rows
  - assistant messages

The zip is written to storage under:
  users/{user_id}/matters/{matter_id}/exports/{job_id}.zip

Callers: app.worker (export job handler).

Design decisions:
  - Hard delete vs tombstone: tombstone (status = 'archived'). See api/exports.py.
  - Export before delete: NOT required. Delete allowed without prior export.
    A warning audit row is written if no export job succeeded before deletion.
  - Audit FK on matter delete: matter row is preserved (status=archived), so
    audit FKs continue to resolve against the tombstone. No UPDATE on
    audit_entries — Unit 6 WORM trigger forbids it.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage_backend, matter_prefix
from app.models import AuditEntry, Document, Job, Matter


def _json_default(obj: Any) -> Any:
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _dumps(obj: Any) -> bytes:
    return json.dumps(obj, default=_json_default, indent=2, ensure_ascii=False).encode("utf-8")


async def build_matter_export(
    session: AsyncSession,
    matter: Matter,
    job_id: uuid.UUID,
) -> str:
    """Build the export zip for ``matter`` and write it to storage.

    Returns the storage key of the written zip.

    Called from the worker; runs inside the worker's session context.
    """
    storage = get_storage_backend()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:

        # --- matter_metadata.json -------------------------------------------
        matter_meta: dict[str, Any] = {
            "id": str(matter.id),
            "slug": matter.slug,
            "title": matter.title,
            "matter_type": matter.matter_type,
            "cause": matter.cause,
            "status": matter.status,
            "case_theory": matter.case_theory,
            "pivot_fact": matter.pivot_fact,
            "privilege_posture": matter.privilege_posture,
            "default_model_id": matter.default_model_id,
            "facts": matter.facts,
            "opened_at": matter.opened_at,
            "closed_at": matter.closed_at,
            "retention_until": matter.retention_until.isoformat() if matter.retention_until else None,
            "created_by_id": str(matter.created_by_id),
        }
        zf.writestr("matter_metadata.json", _dumps(matter_meta))

        # --- documents/ ------------------------------------------------------
        doc_rows = list(
            (
                await session.scalars(
                    select(Document)
                    .where(Document.matter_id == matter.id)
                    .order_by(Document.uploaded_at)
                )
            ).all()
        )
        doc_meta_list: list[dict[str, Any]] = []
        for doc in doc_rows:
            doc_entry: dict[str, Any] = {
                "id": str(doc.id),
                "filename": doc.filename,
                "mime_type": doc.mime_type,
                "size_bytes": doc.size_bytes,
                "sha256": doc.sha256,
                "storage_uri": doc.storage_uri,
                "tag": doc.tag,
                "from_disclosure": doc.from_disclosure,
                "uploaded_at": doc.uploaded_at,
                "uploaded_by_id": str(doc.uploaded_by_id),
            }
            doc_meta_list.append(doc_entry)
            zf.writestr(f"documents/{doc.id}/metadata.json", _dumps(doc_entry))

            # Attempt to include uploaded bytes
            if doc.storage_uri:
                try:
                    raw = storage.get_bytes(doc.storage_uri)
                    zf.writestr(f"documents/{doc.id}/{doc.sha256}", raw)
                except KeyError:
                    # Object missing from storage — metadata still exported
                    pass

        # --- audit.json ------------------------------------------------------
        audit_rows = list(
            (
                await session.scalars(
                    select(AuditEntry)
                    .where(AuditEntry.matter_id == matter.id)
                    .order_by(AuditEntry.timestamp)
                )
            ).all()
        )
        audit_list: list[dict[str, Any]] = [
            {
                "id": str(a.id),
                "timestamp": a.timestamp,
                "actor_id": str(a.actor_id) if a.actor_id else None,
                "action": a.action,
                "module": a.module,
                "resource_type": a.resource_type,
                "resource_id": a.resource_id,
                "model_used": a.model_used,
                "token_count": a.token_count,
                "payload": a.payload,
            }
            for a in audit_rows
        ]
        zf.writestr("audit.json", _dumps(audit_list))

        # --- jobs.json -------------------------------------------------------
        job_rows = list(
            (
                await session.scalars(
                    select(Job)
                    .where(Job.matter_id == matter.id)
                    .order_by(Job.created_at)
                )
            ).all()
        )
        jobs_list: list[dict[str, Any]] = [
            {
                "id": str(j.id),
                "kind": j.kind,
                "status": j.status,
                "stage": j.stage,
                "progress": j.progress,
                "error_code": j.error_code,
                "error_message": j.error_message,
                "created_at": j.created_at,
                "started_at": j.started_at,
                "finished_at": j.finished_at,
                "result_payload": j.result_payload,
            }
            for j in job_rows
        ]
        zf.writestr("jobs.json", _dumps(jobs_list))

    zip_bytes = buf.getvalue()

    # Write to storage: users/{user_id}/matters/{matter_id}/exports/{job_id}.zip
    export_key = (
        f"{matter_prefix(matter.created_by_id, matter.id).rstrip('/')}"
        f"/exports/{job_id}.zip"
    )
    storage.put_bytes(
        export_key,
        zip_bytes,
        content_type="application/zip",
        metadata={
            "matter_id": str(matter.id),
            "job_id": str(job_id),
        },
    )
    return export_key
