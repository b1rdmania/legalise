"""Export logic for the matter working-pack bundle.

This is an application-level working pack, not a certified legal record.
The bundle includes:

  - matter_metadata.json   — matter row fields
  - documents/             — one subdir per document
      {doc_id}/metadata.json
      {doc_id}/{sha256}    — uploaded bytes (if storage_uri exists)
  - document_comments.json — human review notes on documents
  - document_versions.json — saved document snapshots and editor state
  - document_edits.json    — proposed/accepted/rejected edit rows
  - artefacts.json         — generated artefact metadata (storage_uri list,
                             no bytes)
  - audit.json             — all audit rows for the matter
  - jobs.json              — all job rows for the matter

Out of scope:
  - chronology events
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
from app.core.matter_artifacts import ArtifactBytesUnavailable, load_artifact_bytes
from app.core.audit_reconstruction import reconstruct
from app.core.signoff import (
    compute_signoff_hash,
    current_signoff_ids,
    list_signoffs,
)
from app.models import (
    AuditEntry,
    Document,
    Job,
    Matter,
    MatterArtifact,
    MatterReview,
    SIGNOFF_REJECTED,
    SIGNOFF_SIGNED,
    SIGNOFF_SIGNED_WITH_OBSERVATIONS,
    DocumentComment,
    DocumentEdit,
    DocumentVersion,
)


def _json_default(obj: Any) -> Any:
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _dumps(obj: Any) -> bytes:
    return json.dumps(obj, default=_json_default, indent=2, ensure_ascii=False).encode("utf-8")


def _build_readme(
    *,
    matter: Matter,
    doc_count: int,
    document_comment_count: int,
    document_version_count: int,
    document_edit_count: int,
    artifact_count: int,
    review_count: int,
    recon_count: int,
    unavailable_artifacts: list[str],
    signed_count: int,
    signed_with_observations_count: int,
    rejected_count: int,
    unsigned_count: int,
) -> str:
    # Total of both "signed" decision types — preserved under the existing
    # "Signed (final material)" label so consumers that key off that copy
    # keep working. Observations are also broken out on the next line.
    signed_final_count = signed_count + signed_with_observations_count

    lines = [
        f"# Matter export — {matter.title}",
        "",
        f"Slug: `{matter.slug}`  ·  Matter id: `{matter.id}`",
        "",
        "## What this is",
        "A working record of one Legalise matter. AI prepared the outputs; a",
        "human signed (or did not sign) each one. This pack is for review,",
        "not court filing — it is not a certified legal record.",
        "",
        "For a one-page orientation, read `WORKING_PACK.md` first.",
        "",
        "## Contents",
        "- `WORKING_PACK.md` — one-page summary; read first.",
        "- `matter_metadata.json` — the matter record.",
        f"- `documents/` — {doc_count} document(s): per-document `metadata.json` + the original uploaded bytes (where retrievable).",
        f"- `document_comments.json` — {document_comment_count} human review note(s) on documents.",
        f"- `document_versions.json` — {document_version_count} saved document version(s), including editor JSON where available.",
        f"- `document_edits.json` — {document_edit_count} proposed, accepted, or rejected document edit row(s).",
        f"- `artefacts/` — {artifact_count} artefact(s): per-artefact `metadata.json` (incl. `signoff_status`) + the artefact JSON (where retrievable).",
        "- `artefacts.json` — artefact metadata index (each labelled by sign-off status).",
        "- `signoffs.json` — Professional Sign-Off records.",
        f"- `reviews.json` — {review_count} supervisor review decision(s).",
        f"- `reconstruction.json` — the rebuilt decision timeline ({recon_count} entries).",
        "- `audit.json` — raw audit entries for this matter.",
        "- `jobs.json` — job records for this matter.",
        "",
        "## Sign-off status of outputs",
        f"- **Signed (final material): {signed_final_count}** — a solicitor reviewed and took professional ownership of these outputs.",
        f"  - of which signed with observations: {signed_with_observations_count} — signer stands behind the output but recorded points to consider.",
        f"- Rejected: {rejected_count} — the signer did not stand behind these drafts.",
        f"- Unsigned (draft, prepared by AI): {unsigned_count} — no one has signed these; treat them as drafts, not final work product.",
        "",
        "Each artefact's `metadata.json` carries `signoff_status` and, where",
        "the bytes are present, `signoff_hash_matches` (false means the",
        "output drifted after it was signed).",
        "",
        "## Source anchors",
        "Some outputs include `source_anchors` in their artefact JSON. These",
        "are the documents (and any quoted excerpts) the output cited, for",
        "review — not proof that the cited material supports the output. A",
        "`quote_found_in_source: false` flag means Legalise could not locate",
        "the quoted text in the source body it holds.",
        "",
        "## What a human still needs to verify",
        "Before relying on anything in this pack:",
        "",
        "- [ ] Cited sources reviewed against the original documents.",
        "- [ ] Unsigned outputs treated as drafts, not final work product.",
        "- [ ] Rejected outputs not used as final material.",
        "- [ ] Sign-off and review state checked per artefact.",
        "- [ ] Any onward use (client advice, court filing, regulator-facing",
        "      record) judged by a qualified solicitor — this pack does not",
        "      replace that judgement.",
        "",
        "## Limitations",
        "- This is an application-level export, not a certified legal record.",
        "- Original files or artefacts whose stored bytes are no longer available are listed in metadata but not included.",
    ]
    if unavailable_artifacts:
        lines.append(
            f"- Artefact bytes unavailable for {len(unavailable_artifacts)} row(s): "
            + ", ".join(unavailable_artifacts)
            + "."
        )
    lines.append("")
    return "\n".join(lines)


def _build_working_pack(
    *,
    matter: Matter,
    doc_count: int,
    document_comment_count: int,
    document_version_count: int,
    document_edit_count: int,
    artifact_count: int,
    review_count: int,
    signed_count: int,
    signed_with_observations_count: int,
    rejected_count: int,
    unsigned_count: int,
) -> str:
    """One-page orientation file (`WORKING_PACK.md`).

    Written into the export zip alongside README.md. Solicitor or evaluator
    opens the zip, reads this, and knows what they have without parsing
    JSON. Keeps the same honesty boundaries as the README — no
    "court-ready", "verified", "certified", or "SRA-approved" copy.
    """
    signed_final_count = signed_count + signed_with_observations_count
    lines = [
        f"# Working pack — {matter.title}",
        "",
        f"Matter slug: `{matter.slug}`",
        "",
        "## What this pack is",
        "A working record of one Legalise matter. AI prepared the outputs;",
        "a human signed, signed with observations, rejected, or did not yet",
        "sign each one. This pack is for review and onward solicitor",
        "judgement — not a court filing, not a certified legal record.",
        "",
        "## At a glance",
        f"- Documents in scope: {doc_count}",
        f"- Document review notes: {document_comment_count}",
        f"- Saved document versions: {document_version_count}",
        f"- Document edit decisions: {document_edit_count}",
        f"- Outputs produced: {artifact_count}",
        f"  - Signed (final material): {signed_final_count}",
        f"    (of which signed with observations: {signed_with_observations_count})",
        f"  - Rejected: {rejected_count}",
        f"  - Unsigned (draft): {unsigned_count}",
        f"- Supervisor review decisions recorded: {review_count}",
        "",
        "## Where to look for what",
        "- Final material → `artefacts/` entries with `signoff_status` of",
        "  `signed` or `signed_with_observations`, plus the matching record",
        "  in `signoffs.json`.",
        "- Drafts → `artefacts/` entries with `signoff_status` of `unsigned`.",
        "- Rejected drafts → `artefacts/` entries with `signoff_status` of",
        "  `rejected`. The signer did not stand behind these. Do not use as",
        "  final material.",
        "- Source citations → `source_anchors` in each artefact JSON. These",
        "  are pointers for review, not proof of correctness.",
        "- Document review notes → `document_comments.json`.",
        "- Document versions and edit decisions → `document_versions.json`",
        "  and `document_edits.json`.",
        "- The decision timeline → `reconstruction.json`.",
        "- The raw audit chain → `audit.json`.",
        "- Supervisor review state → `reviews.json`.",
        "",
        "## Before relying on this pack",
        "- Treat unsigned outputs as drafts.",
        "- Treat rejected outputs as not-for-use.",
        "- Re-read cited sources against the original documents.",
        "- Have a qualified solicitor judge any onward use.",
        "",
        "See `README.md` for the full file index and limitations.",
        "",
    ]
    return "\n".join(lines)


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
                "comment_count": 0,
                "version_count": 0,
                "edit_count": 0,
            }
            doc_meta_list.append(doc_entry)

            # Attempt to include uploaded bytes
            if doc.storage_uri:
                try:
                    raw = storage.get_bytes(doc.storage_uri)
                    zf.writestr(f"documents/{doc.id}/{doc.sha256}", raw)
                except KeyError:
                    # Object missing from storage — metadata still exported
                    pass

        # --- document_comments.json -----------------------------------------
        comment_rows = list(
            (
                await session.scalars(
                    select(DocumentComment)
                    .where(DocumentComment.document_id.in_([doc.id for doc in doc_rows]))
                    .order_by(DocumentComment.created_at)
                )
            ).all()
        )
        comment_counts: dict[uuid.UUID, int] = {}
        comments_list: list[dict[str, Any]] = []
        for comment in comment_rows:
            comment_counts[comment.document_id] = comment_counts.get(comment.document_id, 0) + 1
            comments_list.append(
                {
                    "id": str(comment.id),
                    "document_id": str(comment.document_id),
                    "author_id": str(comment.author_id),
                    "quote_text": comment.quote_text,
                    "body_sha256": comment.body_sha256,
                    "anchor_start": comment.anchor_start,
                    "anchor_end": comment.anchor_end,
                    "body": comment.body,
                    "status": comment.status,
                    "created_at": comment.created_at,
                    "resolved_at": comment.resolved_at,
                    "resolved_by_id": str(comment.resolved_by_id) if comment.resolved_by_id else None,
                }
            )
        for doc_entry in doc_meta_list:
            doc_id = uuid.UUID(str(doc_entry["id"]))
            doc_entry["comment_count"] = comment_counts.get(doc_id, 0)
        zf.writestr("document_comments.json", _dumps(comments_list))

        # --- document_versions.json + document_edits.json -------------------
        version_rows: list[DocumentVersion] = []
        edit_rows: list[DocumentEdit] = []
        version_counts: dict[uuid.UUID, int] = {}
        edit_counts_by_document: dict[uuid.UUID, int] = {}
        version_document_ids: dict[uuid.UUID, uuid.UUID] = {}
        if doc_rows:
            version_rows = list(
                (
                    await session.scalars(
                        select(DocumentVersion)
                        .where(DocumentVersion.document_id.in_([doc.id for doc in doc_rows]))
                        .order_by(
                            DocumentVersion.document_id,
                            DocumentVersion.version_number,
                        )
                    )
                ).all()
            )
            version_document_ids = {version.id: version.document_id for version in version_rows}
            for version in version_rows:
                version_counts[version.document_id] = version_counts.get(version.document_id, 0) + 1

            if version_rows:
                edit_rows = list(
                    (
                        await session.scalars(
                            select(DocumentEdit)
                            .where(DocumentEdit.document_version_id.in_([v.id for v in version_rows]))
                            .order_by(DocumentEdit.created_at)
                        )
                    ).all()
                )
                for edit in edit_rows:
                    doc_id = version_document_ids.get(edit.document_version_id)
                    if doc_id:
                        edit_counts_by_document[doc_id] = edit_counts_by_document.get(doc_id, 0) + 1

        versions_list = [
            {
                "id": str(version.id),
                "document_id": str(version.document_id),
                "version_number": version.version_number,
                "kind": version.kind,
                "created_by_id": str(version.created_by_id),
                "created_at": version.created_at,
                "storage_uri": version.storage_uri,
                "filename": version.filename,
                "mime_type": version.mime_type,
                "size_bytes": version.size_bytes,
                "sha256": version.sha256,
                "notes": version.notes,
                "resolved_text": version.resolved_text,
                "resolved_json": version.resolved_json,
            }
            for version in version_rows
        ]
        edits_list = [
            {
                "id": str(edit.id),
                "document_id": (
                    str(version_document_ids[edit.document_version_id])
                    if edit.document_version_id in version_document_ids
                    else None
                ),
                "document_version_id": str(edit.document_version_id),
                "change_id": edit.change_id,
                "correlation_id": edit.correlation_id,
                "deleted_text": edit.deleted_text,
                "inserted_text": edit.inserted_text,
                "context_before": edit.context_before,
                "context_after": edit.context_after,
                "status": edit.status,
                "rationale": edit.rationale,
                "created_at": edit.created_at,
                "resolved_at": edit.resolved_at,
                "resolved_by_id": str(edit.resolved_by_id) if edit.resolved_by_id else None,
            }
            for edit in edit_rows
        ]
        for doc_entry in doc_meta_list:
            doc_id = uuid.UUID(str(doc_entry["id"]))
            doc_entry["version_count"] = version_counts.get(doc_id, 0)
            doc_entry["edit_count"] = edit_counts_by_document.get(doc_id, 0)
            zf.writestr(f"documents/{doc_entry['id']}/metadata.json", _dumps(doc_entry))
        zf.writestr("document_versions.json", _dumps(versions_list))
        zf.writestr("document_edits.json", _dumps(edits_list))

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

        # --- artefacts/ (metadata + bytes; LMF-2) ----------------------------
        artifact_rows = list(
            (
                await session.scalars(
                    select(MatterArtifact)
                    .where(MatterArtifact.matter_id == matter.id)
                    .order_by(MatterArtifact.created_at)
                )
            ).all()
        )
        # Current sign-off per artifact (Export Gating v1.1): label every
        # output by its sign-off status so the bundle respects the
        # signature downstream — signed outputs are the final material,
        # unsigned AI outputs are drafts.
        signoff_rows = await list_signoffs(session, matter=matter)
        current_ids = current_signoff_ids(signoff_rows)
        current_by_artifact = {
            s.artifact_id: s for s in signoff_rows if s.id in current_ids
        }

        unavailable_artifacts: list[str] = []
        artifact_meta_list: list[dict[str, Any]] = []
        for art in artifact_rows:
            cur = current_by_artifact.get(art.id)
            art_entry = {
                "id": str(art.id),
                "module_id": art.module_id,
                "capability_id": art.capability_id,
                "invocation_id": str(art.invocation_id),
                "kind": art.kind,
                "size_bytes": art.size_bytes,
                "created_at": art.created_at,
                "created_by_id": (
                    str(art.created_by_id) if art.created_by_id else None
                ),
                # Sign-off status: signed | signed_with_observations |
                # rejected | unsigned.
                "signoff_status": cur.decision if cur else "unsigned",
                "signed_by_id": str(cur.signer_id) if cur else None,
                "signed_at": cur.signed_at if cur else None,
                "signoff_hash": cur.artifact_hash if cur else None,
                # null for unsigned outputs or unavailable legacy bytes;
                # boolean for signed/rejected outputs whose payload bytes
                # were available to recompute.
                "signoff_hash_matches": None,
            }
            try:
                raw = load_artifact_bytes(art.storage_path)
                zf.writestr(f"artefacts/{art.id}/{art.kind}.json", raw)
                # Integrity: does the current payload still match what was
                # signed? A mismatch means the output drifted after sign-off.
                if cur is not None:
                    art_entry["signoff_hash_matches"] = (
                        compute_signoff_hash(art) == cur.artifact_hash
                    )
            except ArtifactBytesUnavailable:
                # Legacy local-fs / missing object — metadata still exported;
                # note it in the manifest rather than crashing the export.
                unavailable_artifacts.append(str(art.id))
            artifact_meta_list.append(art_entry)
            zf.writestr(f"artefacts/{art.id}/metadata.json", _dumps(art_entry))
        zf.writestr("artefacts.json", _dumps(artifact_meta_list))

        # --- signoffs.json (Professional Sign-Off records; v1.1) -------------
        signoffs_list = [
            {
                "id": str(s.id),
                "artifact_id": str(s.artifact_id),
                "invocation_id": str(s.invocation_id),
                "module_id": s.module_id,
                "capability_id": s.capability_id,
                "kind": s.kind,
                "artifact_hash": s.artifact_hash,
                "decision": s.decision,
                "reasoning": s.reasoning,
                "signer_id": str(s.signer_id),
                "signed_at": s.signed_at,
                "is_current": s.id in current_ids,
            }
            for s in signoff_rows
        ]
        zf.writestr("signoffs.json", _dumps(signoffs_list))

        # Counts for the README + WORKING_PACK sign-off summary. The two
        # affirmative tiers (signed and signed_with_observations) are
        # broken out separately so the human-facing copy can name them
        # explicitly, while signed_count below preserves the historical
        # "signed (final material)" semantics for callers that read the
        # broader category.
        signed_count = sum(
            1 for s in current_by_artifact.values() if s.decision == SIGNOFF_SIGNED
        )
        signed_with_observations_count = sum(
            1
            for s in current_by_artifact.values()
            if s.decision == SIGNOFF_SIGNED_WITH_OBSERVATIONS
        )
        rejected_count = sum(
            1 for s in current_by_artifact.values() if s.decision == SIGNOFF_REJECTED
        )
        unsigned_count = len(artifact_rows) - len(current_by_artifact)

        # --- reviews.json (supervisor review decisions; LMF-2) ---------------
        review_rows = list(
            (
                await session.scalars(
                    select(MatterReview)
                    .where(MatterReview.matter_id == matter.id)
                    .order_by(MatterReview.requested_at)
                )
            ).all()
        )
        reviews_list = [
            {
                "id": str(r.id),
                "artifact_id": str(r.artifact_id),
                "invocation_id": str(r.invocation_id),
                "module_id": r.module_id,
                "capability_id": r.capability_id,
                "kind": r.kind,
                "artifact_hash": r.artifact_hash,
                "state": r.state,
                "requested_by_id": str(r.requested_by_id),
                "requested_at": r.requested_at,
                "decided_by_id": str(r.decided_by_id) if r.decided_by_id else None,
                "decided_at": r.decided_at,
                "note": r.note,
            }
            for r in review_rows
        ]
        zf.writestr("reviews.json", _dumps(reviews_list))

        # --- reconstruction.json (the rebuilt decision timeline; LMF-2) ------
        recon_entries: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            page = await reconstruct(
                session, matter_id=matter.id, cursor=cursor, limit=200
            )
            recon_entries.extend(e.to_dict() for e in page.entries)
            if not page.next_cursor:
                break
            cursor = page.next_cursor
        zf.writestr("reconstruction.json", _dumps(recon_entries))

        # --- WORKING_PACK.md (one-page orientation) --------------------------
        working_pack = _build_working_pack(
            matter=matter,
            doc_count=len(doc_rows),
            document_comment_count=len(comment_rows),
            document_version_count=len(version_rows),
            document_edit_count=len(edit_rows),
            artifact_count=len(artifact_rows),
            review_count=len(review_rows),
            signed_count=signed_count,
            signed_with_observations_count=signed_with_observations_count,
            rejected_count=rejected_count,
            unsigned_count=unsigned_count,
        )
        zf.writestr("WORKING_PACK.md", working_pack.encode("utf-8"))

        # --- README.md (full file index + human verification + limits) ------
        readme = _build_readme(
            matter=matter,
            doc_count=len(doc_rows),
            document_comment_count=len(comment_rows),
            document_version_count=len(version_rows),
            document_edit_count=len(edit_rows),
            artifact_count=len(artifact_rows),
            review_count=len(review_rows),
            recon_count=len(recon_entries),
            unavailable_artifacts=unavailable_artifacts,
            signed_count=signed_count,
            signed_with_observations_count=signed_with_observations_count,
            rejected_count=rejected_count,
            unsigned_count=unsigned_count,
        )
        zf.writestr("README.md", readme.encode("utf-8"))

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
