"""replicate_document tool — clone the latest version into a new working copy.

Used at the start of an edit session: the canonical version stays
untouched; edits land on the replicated version. The new row's
`storage_uri` mirrors the latest version's (or, if no versions exist, the
parent document's) so a downloader can resolve a binary in either case.

If the document somehow has no `document_versions` rows (e.g. legacy
upload that pre-dates the 0004 backfill), we seed v1 as `upload` first,
then create v2 as `replicated`. The 0004 migration backfills v1 for all
existing rows so this branch should be cold.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tools.schemas import (
    DocumentVersionRead,
    ReplicateDocumentInput,
    ReplicateDocumentOutput,
)
from app.core.api import audit
from app.models.document import Document
from app.models.document_version import (
    DocumentVersion,
    VERSION_KIND_REPLICATED,
    VERSION_KIND_UPLOAD,
)
from app.models.matter import Matter


class _ReplicateAuthError(RuntimeError):
    """Raised when the actor doesn't own the matter for the document."""


async def handle_replicate_document(
    inputs: ReplicateDocumentInput,
    *,
    session: AsyncSession,
    actor_id: uuid.UUID,
    matter_id: uuid.UUID | None,
) -> ReplicateDocumentOutput:
    row = await session.execute(
        select(Document, Matter)
        .join(Matter, Document.matter_id == Matter.id)
        .where(Document.id == inputs.document_id)
    )
    found = row.first()
    if found is None:
        raise _ReplicateAuthError(f"document {inputs.document_id} not found")
    document, matter = found
    if matter.created_by_id != actor_id:
        raise _ReplicateAuthError(
            f"document {inputs.document_id} not owned by actor"
        )

    latest = await session.scalar(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
        .order_by(DocumentVersion.version_number.desc())
    )

    if latest is None:
        # Cold path — seed v1 first so the new row gets v2.
        seed = DocumentVersion(
            id=uuid.uuid4(),
            document_id=document.id,
            version_number=1,
            kind=VERSION_KIND_UPLOAD,
            created_by_id=actor_id,
            storage_uri=document.storage_uri,
            notes="auto-seeded on first replicate (missing v1 backfill)",
        )
        session.add(seed)
        await session.flush()
        latest = seed

    new_version = DocumentVersion(
        id=uuid.uuid4(),
        document_id=document.id,
        version_number=latest.version_number + 1,
        kind=VERSION_KIND_REPLICATED,
        created_by_id=actor_id,
        storage_uri=latest.storage_uri or document.storage_uri,
        notes=f"replicated from v{latest.version_number}",
    )
    session.add(new_version)
    await session.flush()

    await audit.log(
        session,
        "document.replicated",
        actor_id=actor_id,
        matter_id=matter.id,
        module="document_edit",
        resource_type="document",
        resource_id=str(document.id),
        payload={
            "new_version_id": str(new_version.id),
            "new_version_number": new_version.version_number,
            "source_version_id": str(latest.id),
        },
    )

    return ReplicateDocumentOutput(
        new_version=DocumentVersionRead(
            id=new_version.id,
            document_id=new_version.document_id,
            version_number=new_version.version_number,
            kind=new_version.kind,
            created_at=new_version.created_at,
            storage_uri=new_version.storage_uri,
            notes=new_version.notes,
        )
    )


__all__ = ["handle_replicate_document"]
