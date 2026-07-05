"""External pack endpoints — the register sidecar's front door.

Two endpoints under ``/api/external``:

- ``POST /packs`` — authed multipart ingest: ``adapter`` (form field,
  e.g. ``mike``), ``export`` (the export JSON — project manifest
  preferred, account export accepted), optional ``documents`` (the
  documents ZIP), optional ``title``. Creates one read-only external
  matter (``external_source`` set, ``C_paused`` posture — no model
  calls, no skills), one WORM artifact per document, a pack manifest
  artifact, and the ``external.pack.ingested`` audit row carrying the
  hash manifest.
- ``GET /packs`` — list this user's external packs with their manifest
  summary (source, counts: verified-at-source / attested-at-ingest /
  claimed-by-source) and sign-off tallies. Feeds the register face.

Sign-off over pack documents goes through the existing
``/api/matters/{slug}/signoffs`` surface — external artifacts carry
``created_by_id=NULL``, so ``signer_is_author`` is always false there.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.external_pack import (
    ExternalPackError,
    KIND_MANIFEST,
    MalformedExport,
    UnknownAdapter,
    ingest_external_pack,
)
from app.core.matter_artifacts import (
    ArtifactBytesUnavailable,
    load_artifact_payload,
)
from app.core.signoff import current_signoff_ids
from app.models import MatterArtifact, MatterSignoff, User
from app.models.matter import STATUS_ARCHIVED, Matter

router = APIRouter()

# 25 MB ceiling per upload part — packs are records, not data lakes.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class PackSignoffSummary(BaseModel):
    total: int
    signed: int
    signed_with_observations: int
    rejected: int


class PackRead(BaseModel):
    matter_id: str
    matter_slug: str
    title: str
    adapter: str
    source: str
    exported_at: str | None
    ingested_at: str | None
    counts: dict[str, int]
    manifest_artifact_id: str
    document_artifact_ids: list[str]
    signoffs: PackSignoffSummary


class PackListResponse(BaseModel):
    packs: list[PackRead]


async def _signoff_summary(
    session: AsyncSession, matter: Matter
) -> PackSignoffSummary:
    """Tally the *current* sign-off per artifact on this matter."""
    signoffs = await session.scalars(
        select(MatterSignoff)
        .where(MatterSignoff.matter_id == matter.id)
        .order_by(MatterSignoff.signed_at.desc(), MatterSignoff.id.desc())
    )
    rows = list(signoffs.all())
    current = current_signoff_ids(rows)
    tally = {"signed": 0, "signed_with_observations": 0, "rejected": 0}
    for s in rows:
        if s.id in current and s.decision in tally:
            tally[s.decision] += 1
    return PackSignoffSummary(total=len(current), **tally)


def _pack_read(
    matter: Matter,
    manifest: MatterArtifact,
    payload: dict,
    signoffs: PackSignoffSummary,
) -> PackRead:
    counts = payload.get("counts")
    doc_ids = payload.get("document_artifact_ids")
    return PackRead(
        matter_id=str(matter.id),
        matter_slug=matter.slug,
        title=matter.title,
        adapter=str(payload.get("adapter") or matter.external_source or ""),
        source=str(payload.get("source") or matter.external_source or ""),
        exported_at=payload.get("exported_at"),
        ingested_at=payload.get("ingested_at"),
        counts={
            k: v for k, v in (counts or {}).items() if isinstance(v, int)
        },
        manifest_artifact_id=str(manifest.id),
        document_artifact_ids=[
            str(d) for d in (doc_ids or []) if isinstance(d, str)
        ],
        signoffs=signoffs,
    )


async def _read_upload(part: UploadFile, label: str) -> bytes:
    data = await part.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail=f"{label} exceeds {MAX_UPLOAD_BYTES} bytes"
        )
    return data


def _zip_entries(data: bytes) -> dict[str, bytes]:
    """Flatten a documents ZIP to ``basename -> bytes``. Directories and
    duplicate basenames resolve last-wins; the adapter matches by the
    export's own filename convention."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="documents is not a valid ZIP")
    out: dict[str, bytes] = {}
    for info in archive.infolist():
        if info.is_dir():
            continue
        name = info.filename.rsplit("/", 1)[-1]
        if not name or name.startswith("."):
            continue
        out[name] = archive.read(info)
    return out


@router.post("/packs", response_model=PackRead, status_code=201)
async def ingest_pack_endpoint(
    adapter: str = Form(...),
    export: UploadFile = File(...),
    documents: UploadFile | None = File(None),
    title: str | None = Form(None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> PackRead:
    export_bytes = await _read_upload(export, "export")
    try:
        export_json = json.loads(export_bytes)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=422, detail="export is not valid JSON")

    files: dict[str, bytes] = {}
    if documents is not None:
        files = _zip_entries(await _read_upload(documents, "documents"))

    try:
        result = await ingest_external_pack(
            session,
            user=user,
            adapter_name=adapter,
            export=export_json,
            files=files,
            title=(title or "").strip() or None,
        )
    except UnknownAdapter as exc:
        raise HTTPException(
            status_code=422, detail={"error": "unknown_adapter", "message": str(exc)}
        )
    except MalformedExport as exc:
        raise HTTPException(
            status_code=422, detail={"error": "malformed_export", "message": str(exc)}
        )
    except ExternalPackError as exc:
        raise HTTPException(
            status_code=422, detail={"error": "external_pack", "message": str(exc)}
        )

    await session.commit()
    payload = load_artifact_payload(result.manifest.storage_path)
    return _pack_read(
        result.matter,
        result.manifest,
        payload,
        PackSignoffSummary(total=0, signed=0, signed_with_observations=0, rejected=0),
    )


@router.get("/packs", response_model=PackListResponse)
async def list_packs_endpoint(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> PackListResponse:
    matters = await session.scalars(
        select(Matter)
        .where(
            Matter.created_by_id == user.id,
            Matter.external_source.is_not(None),
            Matter.status != STATUS_ARCHIVED,
        )
        .order_by(Matter.opened_at.desc())
    )
    packs: list[PackRead] = []
    for matter in matters.all():
        manifest = await session.scalar(
            select(MatterArtifact)
            .where(
                MatterArtifact.matter_id == matter.id,
                MatterArtifact.kind == KIND_MANIFEST,
            )
            .order_by(MatterArtifact.created_at.desc())
            .limit(1)
        )
        if manifest is None:
            continue
        try:
            payload = load_artifact_payload(manifest.storage_path)
        except (ArtifactBytesUnavailable, ValueError):
            payload = {}
        summary = await _signoff_summary(session, matter)
        packs.append(_pack_read(matter, manifest, payload, summary))
    return PackListResponse(packs=packs)


__all__ = ["router"]
