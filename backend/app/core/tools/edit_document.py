"""edit_document tool — persist a batch of pending edits against a version.

Authorisation: the supplied `version_id` must resolve to a Document whose
Matter is owned by `actor_id`. We deliberately re-check ownership at the
tool boundary even though the calling endpoint may already have — tools
are a public-ish surface (registered globally on the gateway) and a future
caller may not enforce the same checks.

`change_id` is a server-assigned UUID. The model's `c1`/`c2` tag is stored
separately in `correlation_id` (see G2.3).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tools.schemas import (
    EditDocumentInput,
    EditDocumentOutput,
    PendingEditRead,
)
from app.core.api import audit
from app.models.document import Document
from app.models.document_edit import DocumentEdit, EDIT_STATUS_PENDING
from app.models.document_version import DocumentVersion
from app.models.matter import Matter


class _EditAuthError(RuntimeError):
    """Raised when the actor doesn't own the matter for the given version."""


async def handle_edit_document(
    inputs: EditDocumentInput,
    *,
    session: AsyncSession,
    actor_id: uuid.UUID,
    matter_id: uuid.UUID | None,
) -> EditDocumentOutput:
    # Resolve version → document → matter, asserting ownership.
    row = await session.execute(
        select(DocumentVersion, Document, Matter)
        .join(Document, DocumentVersion.document_id == Document.id)
        .join(Matter, Document.matter_id == Matter.id)
        .where(DocumentVersion.id == inputs.version_id)
    )
    found = row.first()
    if found is None:
        raise _EditAuthError(f"document version {inputs.version_id} not found")
    version, _document, matter = found
    if matter.created_by_id != actor_id:
        raise _EditAuthError(
            f"document version {inputs.version_id} not owned by actor"
        )

    created: list[DocumentEdit] = []
    for change in inputs.changes:
        edit = DocumentEdit(
            id=uuid.uuid4(),
            document_version_id=version.id,
            change_id=str(uuid.uuid4()),
            correlation_id=change.correlation_id,
            deleted_text=change.deleted_text,
            inserted_text=change.inserted_text,
            context_before=change.context_before,
            context_after=change.context_after,
            status=EDIT_STATUS_PENDING,
            rationale=change.rationale,
        )
        session.add(edit)
        created.append(edit)

    await session.flush()

    await audit.log(
        session,
        "document.edits.persisted",
        actor_id=actor_id,
        matter_id=matter.id,
        module="document_edit",
        resource_type="document_version",
        resource_id=str(version.id),
        payload={
            "version_id": str(version.id),
            "count": len(created),
        },
    )

    return EditDocumentOutput(
        pending_edits=[
            PendingEditRead(
                id=e.id,
                document_version_id=e.document_version_id,
                change_id=e.change_id,
                status=e.status,
                correlation_id=e.correlation_id,
            )
            for e in created
        ]
    )


__all__ = ["handle_edit_document"]
