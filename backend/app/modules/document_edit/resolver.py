"""Accept/reject resolver for tracked changes (Phase B W2 §4a).

Single entry point for both per-edit and bulk resolution. Handles the
three thorny invariants from the delta sheet:

1. Anchor-based substitution. Phase A persists `(deleted_text,
   inserted_text, context_before, context_after)` but no offset. We
   reconstruct the anchor `context_before + deleted_text + context_after`
   and locate it in the base text. Unique match → substitute; zero
   matches → record drift and skip; multiple matches → first wins (v0.2
   could lift to diff-match-patch patch_apply).

2. Per-edit concurrency. `UPDATE ... WHERE status='pending' RETURNING *`
   guarantees only one tab wins the resolution; the second sees zero
   rows and gets a 409.

3. Closing-version race. Two tabs both resolving the second-to-last
   edit could both observe `pending_count == 0` and both try to create
   the closing version. A per-version Postgres advisory lock at the top
   of the closing path serialises this.

The base text for substitution comes from the latest non-pending
version's `resolved_text` if one exists, otherwise the original
`DocumentBody(kind='extracted').extracted_text`. This means the chain
is: upload body → v2 assistant_edit pending → v3 user_accept resolved
text → v4 next assistant_edit (against v3 text) → ...
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AuditEntry,
    Document,
    DocumentBody,
    DocumentEdit,
    DocumentVersion,
    Matter,
)
from app.models.document_body import BODY_KIND_EXTRACTED
from app.models.document_edit import (
    EDIT_STATUS_ACCEPTED,
    EDIT_STATUS_PENDING,
    EDIT_STATUS_REJECTED,
)
from app.models.document_version import (
    VERSION_KIND_USER_ACCEPT,
    VERSION_KIND_USER_REJECT,
)


class EditAlreadyResolved(Exception):
    """Raised when an UPDATE ... WHERE status='pending' returns no rows."""


# -- anchor-based substitution --------------------------------------------


def apply_anchor_substitution(
    base_text: str, edit: DocumentEdit
) -> tuple[str, str]:
    """Substitute `edit.deleted_text` → `edit.inserted_text` in base_text.

    Anchor = context_before + deleted_text + context_after. Returns the
    new text plus a status: "applied" | "skipped_no_anchor" | "skipped_drift".
    "skipped_drift" is currently unused (kept for v0.2 patch_apply); on
    multiple matches we take the first.
    """
    deleted = edit.deleted_text or ""
    inserted = edit.inserted_text or ""
    before = edit.context_before or ""
    after = edit.context_after or ""

    # If the model returned no delta at all, nothing to do.
    if not deleted and not inserted:
        return base_text, "applied"

    anchor = before + deleted + after
    if anchor and anchor in base_text:
        replacement = before + inserted + after
        # Replace only the first occurrence — first-match policy.
        return base_text.replace(anchor, replacement, 1), "applied"

    # Fall back: bare deleted_text search if anchors are empty (model
    # didn't supply context) but deleted_text alone is in the body.
    if not before and not after and deleted and deleted in base_text:
        return base_text.replace(deleted, inserted, 1), "applied"

    return base_text, "skipped_no_anchor"


def apply_all_accepted(base_text: str, edits: list[DocumentEdit]) -> tuple[str, list[str]]:
    """Apply every `accepted` edit in `edits` against `base_text`.

    Returns the final text plus a per-edit status list (parallel to
    `edits`) so callers can audit which substitutions skipped.
    """
    text_out = base_text
    statuses: list[str] = []
    for e in edits:
        if e.status != EDIT_STATUS_ACCEPTED:
            statuses.append("not_accepted")
            continue
        text_out, st = apply_anchor_substitution(text_out, e)
        statuses.append(st)
    return text_out, statuses


# -- base text loader ------------------------------------------------------


async def get_base_text(session: AsyncSession, document_id: uuid.UUID) -> str:
    """Return the text to apply edits against.

    Reads the latest non-pending version's `resolved_text` if one exists,
    otherwise falls back to `DocumentBody(kind='extracted').extracted_text`.
    """
    latest_resolved = await session.scalar(
        select(DocumentVersion.resolved_text)
        .where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.resolved_text.isnot(None),
        )
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    if latest_resolved is not None:
        return latest_resolved

    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    if body is None:
        return ""
    return body.extracted_text or ""


# -- single-edit resolver --------------------------------------------------


async def _next_version_number(session: AsyncSession, document_id: uuid.UUID) -> int:
    current = await session.scalar(
        select(func.coalesce(func.max(DocumentVersion.version_number), 0)).where(
            DocumentVersion.document_id == document_id
        )
    )
    return int(current or 0) + 1


async def _matter_for_version(
    session: AsyncSession, version_id: uuid.UUID
) -> tuple[DocumentVersion, Document, Matter] | None:
    row = (
        await session.execute(
            select(DocumentVersion, Document, Matter)
            .join(Document, Document.id == DocumentVersion.document_id)
            .join(Matter, Matter.id == Document.matter_id)
            .where(DocumentVersion.id == version_id)
        )
    ).first()
    if row is None:
        return None
    return row[0], row[1], row[2]


async def _take_advisory_lock(session: AsyncSession, version_id: uuid.UUID) -> None:
    """Serialise the closing-version creation per version_id.

    Released at transaction end. Using `hashtext` keeps the key inside
    bigint range; collisions are harmless (worst case: two unrelated
    version closes briefly queue behind each other).
    """
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:vid))"),
        {"vid": str(version_id)},
    )


async def _maybe_close_version(
    session: AsyncSession,
    *,
    version: DocumentVersion,
    document: Document,
    matter: Matter,
    actor_id: uuid.UUID,
) -> tuple[DocumentVersion | None, str | None]:
    """If no pending edits remain on `version`, create the closing version.

    Returns `(new_version, resolved_text)` or `(None, None)` if pending
    edits still exist. Caller must already hold the advisory lock.
    """
    pending_count = await session.scalar(
        select(func.count(DocumentEdit.id)).where(
            DocumentEdit.document_version_id == version.id,
            DocumentEdit.status == EDIT_STATUS_PENDING,
        )
    )
    if (pending_count or 0) > 0:
        return None, None

    # All edits resolved. Count accepted vs rejected to decide kind.
    edits = (
        await session.execute(
            select(DocumentEdit).where(DocumentEdit.document_version_id == version.id)
        )
    ).scalars().all()
    accepted = [e for e in edits if e.status == EDIT_STATUS_ACCEPTED]
    rejected_count = sum(1 for e in edits if e.status == EDIT_STATUS_REJECTED)

    kind = VERSION_KIND_USER_ACCEPT if accepted else VERSION_KIND_USER_REJECT

    # Re-entrancy guard: if a closing version for this assistant_edit
    # already exists, don't double-create. We detect by looking for a
    # version with version_number > this one created since this one and
    # tagged in notes — simpler heuristic: just check the latest version
    # number is still ours.
    latest = await session.scalar(
        select(func.max(DocumentVersion.version_number)).where(
            DocumentVersion.document_id == document.id
        )
    )
    if (latest or 0) > version.version_number:
        # Another concurrent resolution already closed this version.
        return None, None

    base_text = await get_base_text(session, document.id)
    resolved_text, statuses = apply_all_accepted(base_text, accepted)

    skipped = sum(1 for s in statuses if s.startswith("skipped"))

    new_version = DocumentVersion(
        id=uuid.uuid4(),
        document_id=document.id,
        version_number=(latest or 0) + 1,
        kind=kind,
        created_by_id=actor_id,
        created_at=datetime.utcnow(),
        storage_uri=None,
        notes=(
            f"resolved version_id={version.id} accepted={len(accepted)} "
            f"rejected={rejected_count} skipped={skipped}"
        ),
        resolved_text=resolved_text,
    )
    session.add(new_version)
    await session.flush()

    # Per-skip audit rows for drift visibility.
    for edit, st in zip(accepted, [s for s in statuses if s != "not_accepted"]):
        if st.startswith("skipped"):
            session.add(
                AuditEntry(
                    actor_id=actor_id,
                    matter_id=matter.id,
                    action="document.edit.resolution_skipped",
                    module="document_edit",
                    resource_type="document_edit",
                    resource_id=str(edit.id),
                    payload={
                        "version_id": str(version.id),
                        "new_version_id": str(new_version.id),
                        "reason": st,
                    },
                )
            )

    session.add(
        AuditEntry(
            actor_id=actor_id,
            matter_id=matter.id,
            action="document.version.resolved",
            module="document_edit",
            resource_type="document_version",
            resource_id=str(new_version.id),
            payload={
                "source_version_id": str(version.id),
                "kind": kind,
                "accepted_count": len(accepted),
                "rejected_count": rejected_count,
                "skipped_count": skipped,
                "resolved_text_length": len(resolved_text),
            },
        )
    )

    return new_version, resolved_text


async def resolve_edit(
    session: AsyncSession,
    *,
    edit_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: Literal["accept", "reject"],
) -> tuple[DocumentEdit, DocumentVersion | None, str | None]:
    """Resolve a single edit; close the version if it was the last pending.

    Raises `EditAlreadyResolved` if the row is not currently pending.
    Raises `LookupError` if the edit / version / matter aren't found or
    aren't owned by `actor_id`.
    """
    if action not in ("accept", "reject"):
        raise ValueError(f"unknown action {action!r}")

    new_status = EDIT_STATUS_ACCEPTED if action == "accept" else EDIT_STATUS_REJECTED

    # Authorisation: walk edit → version → document → matter.
    pre = (
        await session.execute(
            select(DocumentEdit, DocumentVersion, Document, Matter)
            .join(DocumentVersion, DocumentVersion.id == DocumentEdit.document_version_id)
            .join(Document, Document.id == DocumentVersion.document_id)
            .join(Matter, Matter.id == Document.matter_id)
            .where(DocumentEdit.id == edit_id)
        )
    ).first()
    if pre is None:
        raise LookupError("edit not found")
    _, version, document, matter = pre
    if matter.created_by_id != actor_id:
        raise LookupError("edit not found")

    # Advisory lock prevents two concurrent resolutions on the same
    # version from both closing it.
    await _take_advisory_lock(session, version.id)

    now = datetime.utcnow()
    result = await session.execute(
        update(DocumentEdit)
        .where(DocumentEdit.id == edit_id, DocumentEdit.status == EDIT_STATUS_PENDING)
        .values(status=new_status, resolved_at=now, resolved_by_id=actor_id)
        .returning(DocumentEdit)
    )
    updated = result.scalar_one_or_none()
    if updated is None:
        raise EditAlreadyResolved("edit already resolved")

    await session.refresh(updated)

    session.add(
        AuditEntry(
            actor_id=actor_id,
            matter_id=matter.id,
            action=f"document.edit.{new_status}",
            module="document_edit",
            resource_type="document_edit",
            resource_id=str(updated.id),
            payload={
                "version_id": str(version.id),
                "document_id": str(document.id),
                "change_id": updated.change_id,
            },
        )
    )

    new_version, resolved_text = await _maybe_close_version(
        session,
        version=version,
        document=document,
        matter=matter,
        actor_id=actor_id,
    )
    await session.flush()
    return updated, new_version, resolved_text


# -- bulk resolver ---------------------------------------------------------


async def resolve_bulk(
    session: AsyncSession,
    *,
    version_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: Literal["accept_all", "reject_all"],
) -> tuple[int, DocumentVersion, str]:
    """Mark every pending edit on `version_id`, then create the closing version.

    Raises `LookupError` if the version isn't found or isn't owned by actor.
    """
    if action not in ("accept_all", "reject_all"):
        raise ValueError(f"unknown bulk action {action!r}")

    new_status = EDIT_STATUS_ACCEPTED if action == "accept_all" else EDIT_STATUS_REJECTED

    pre = await _matter_for_version(session, version_id)
    if pre is None:
        raise LookupError("version not found")
    version, document, matter = pre
    if matter.created_by_id != actor_id:
        raise LookupError("version not found")

    await _take_advisory_lock(session, version_id)

    now = datetime.utcnow()
    result = await session.execute(
        update(DocumentEdit)
        .where(
            DocumentEdit.document_version_id == version_id,
            DocumentEdit.status == EDIT_STATUS_PENDING,
        )
        .values(status=new_status, resolved_at=now, resolved_by_id=actor_id)
        .returning(DocumentEdit.id)
    )
    affected_ids = [row[0] for row in result.all()]
    affected_count = len(affected_ids)

    # Per-edit audit rows so the matter log carries the same shape as
    # the single-edit path (one row per resolution).
    for eid in affected_ids:
        session.add(
            AuditEntry(
                actor_id=actor_id,
                matter_id=matter.id,
                action=f"document.edit.{new_status}",
                module="document_edit",
                resource_type="document_edit",
                resource_id=str(eid),
                payload={
                    "version_id": str(version_id),
                    "document_id": str(document.id),
                    "bulk": True,
                },
            )
        )

    new_version, resolved_text = await _maybe_close_version(
        session,
        version=version,
        document=document,
        matter=matter,
        actor_id=actor_id,
    )

    # If nothing was pending and no new version was created, synthesise an
    # idempotent close: caller still expects (count, new_version, text).
    # Locate the latest version's resolved text; if none, fall back to
    # base text. This keeps the bulk endpoint result-shape stable.
    if new_version is None:
        # Look for the most recent resolved version on this document.
        latest_resolved = (
            await session.execute(
                select(DocumentVersion)
                .where(
                    DocumentVersion.document_id == document.id,
                    DocumentVersion.resolved_text.isnot(None),
                )
                .order_by(DocumentVersion.version_number.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if latest_resolved is not None:
            new_version = latest_resolved
            resolved_text = latest_resolved.resolved_text or ""
        else:
            # No resolved version exists; create an empty user_reject
            # placeholder so the response shape holds. This only fires on
            # a bulk against a version with zero pending edits.
            base_text = await get_base_text(session, document.id)
            next_num = await _next_version_number(session, document.id)
            new_version = DocumentVersion(
                id=uuid.uuid4(),
                document_id=document.id,
                version_number=next_num,
                kind=(
                    VERSION_KIND_USER_ACCEPT
                    if action == "accept_all"
                    else VERSION_KIND_USER_REJECT
                ),
                created_by_id=actor_id,
                created_at=datetime.utcnow(),
                storage_uri=None,
                notes=f"bulk {action} on already-resolved version {version_id}",
                resolved_text=base_text,
            )
            session.add(new_version)
            await session.flush()
            resolved_text = base_text

    await session.flush()
    return affected_count, new_version, resolved_text or ""
