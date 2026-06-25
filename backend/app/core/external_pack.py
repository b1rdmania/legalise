"""External workspace pack ingestion — the register sidecar.

Normalises an export from an external AI legal workspace into a
working-pack-shaped record this workspace can supervise: one read-only
matter per pack, one WORM artifact per document, sign-off through the
existing ``core/signoff.py`` path.

The honesty boundary: this workspace did not
watch the external work happen. There are exactly two grades of hash
claim, and each document records which one it carries:

- ``verified_at_source`` — the export is a *manifest* whose versions
  carry ``content_sha256`` computed by the source workspace at write
  time. The hash predates the export; where the document bytes also
  travelled, they are re-hashed at ingest and any mismatch is recorded
  (``hash_mismatch``), never papered over.
- ``attested_at_ingest`` — the export carried bytes but no source hash,
  so the sha256 is computed HERE, at ingest. It proves what this
  workspace received, not what the source workspace held.

The provenance trail is the export's own claim, preserved verbatim and
mapped, never improved.

Adapter registry: each adapter understands one external workspace's
export shape. ``mike`` is first — it PREFERS the project export
manifest (``manifest_version`` / nested ``documents[].versions[]`` with
``content_sha256`` + ``source`` provenance enum + ``edits``), and falls
back to the flat account-export JSON (``documents`` /
``document_versions`` / ``document_edits`` tables). Either may arrive
with the optional documents ZIP. No external code is vendored; the
adapter is written against the export *shape* only.

Read-only by construction: external matters are created with
``privilege_posture=C_paused``, which the posture gate maps to
"nobody may run a capability" — no model calls, no skills. The matter
exists to be supervised and signed, not worked.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.matter_artifacts import write_artifact
from app.models import Matter, MatterArtifact
from app.models.matter import PRIVILEGE_PAUSED, STATUS_OPEN
from app.models.user import User


PACK_SCHEMA = "legalise.external-pack/v1"

# Module/capability identity the ingested artifacts carry. There is no
# installed module behind these ids — they name the ingest surface so
# audit and reconstruction read cleanly.
PACK_MODULE_ID = "external.pack"
PACK_INGEST_CAPABILITY = "external.pack.ingest"
PACK_DOCUMENT_CAPABILITY = "external.pack.document"

KIND_MANIFEST = "external_pack_manifest"
KIND_DOCUMENT = "external_document"

PACK_INGESTED_ACTION = "external.pack.ingested"


class ExternalPackError(Exception):
    """Base for ingest errors (422 at the API)."""


class UnknownAdapter(ExternalPackError):
    """No adapter registered under that name."""


class MalformedExport(ExternalPackError):
    """The export does not match the adapter's expected shape."""


# ---------------------------------------------------------------------------
# Normalised shapes
# ---------------------------------------------------------------------------

AUTHOR_HUMAN = "human"
AUTHOR_ASSISTANT = "assistant"
AUTHOR_UNKNOWN = "unknown"

# The two grades of hash claim — the honesty boundary, as data.
HASH_VERIFIED_AT_SOURCE = "verified_at_source"
HASH_ATTESTED_AT_INGEST = "attested_at_ingest"


@dataclass
class NormalisedVersion:
    external_id: str | None
    version_number: int | None
    source: str | None  # the export's own value, verbatim
    author: str  # human | assistant | unknown
    provenance: str  # mapped label (see adapter table)
    filename: str | None
    created_at: str | None
    # The source workspace's own sha256 of this version's bytes, when
    # the export was a manifest that carried one. Verbatim claim.
    content_sha256: str | None = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "version_number": self.version_number,
            "source": self.source,
            "author": self.author,
            "provenance": self.provenance,
            "filename": self.filename,
            "created_at": self.created_at,
            "content_sha256": self.content_sha256,
        }


@dataclass
class NormalisedEdit:
    external_id: str | None
    version_id: str | None
    change_id: str | None
    deleted_text: str | None
    inserted_text: str | None
    context_before: str | None
    context_after: str | None
    status: str | None  # pending | accepted | rejected (export's claim)
    resolved_at: str | None

    def as_payload(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "version_id": self.version_id,
            "change_id": self.change_id,
            "deleted_text": self.deleted_text,
            "inserted_text": self.inserted_text,
            "context_before": self.context_before,
            "context_after": self.context_after,
            "status": self.status,
            "resolved_at": self.resolved_at,
        }


@dataclass
class NormalisedDocument:
    external_id: str | None
    filename: str
    # Canonical sha256 (hex) for this document's current version. Where
    # the export manifest carried a source hash, this IS that hash
    # (``hash_origin=verified_at_source``); otherwise it is computed at
    # ingest from the bytes the export carried
    # (``hash_origin=attested_at_ingest``). None when neither existed —
    # recorded as unhashed, never guessed.
    sha256: str | None
    size_bytes: int | None
    current_version: NormalisedVersion | None
    # verified_at_source | attested_at_ingest | None — WHICH claim the
    # sha256 makes. Recorded per document; the register face counts it.
    hash_origin: str | None = None
    # sha256 recomputed at ingest from travelled bytes (when present).
    # Equal to ``sha256`` for attested-at-ingest documents; for
    # verified-at-source documents it is the cross-check.
    ingest_sha256: str | None = None
    # True when a source hash AND travelled bytes both exist and
    # disagree. Recorded, never repaired.
    hash_mismatch: bool = False
    versions: list[NormalisedVersion] = field(default_factory=list)
    edit_trail: list[NormalisedEdit] = field(default_factory=list)

    @property
    def author(self) -> str:
        return self.current_version.author if self.current_version else AUTHOR_UNKNOWN

    @property
    def provenance(self) -> str:
        return (
            self.current_version.provenance
            if self.current_version
            else "unknown"
        )

    def as_payload(self) -> dict[str, Any]:
        return {
            "schema": PACK_SCHEMA,
            "record": "document",
            "external_id": self.external_id,
            "filename": self.filename,
            "sha256": self.sha256,
            "hash_origin": self.hash_origin,
            "ingest_sha256": self.ingest_sha256,
            "hash_mismatch": self.hash_mismatch,
            "size_bytes": self.size_bytes,
            "author": self.author,
            "provenance": self.provenance,
            "current_version": (
                self.current_version.as_payload() if self.current_version else None
            ),
            "versions": [v.as_payload() for v in self.versions],
            "edit_trail": [e.as_payload() for e in self.edit_trail],
        }


@dataclass
class NormalisedPack:
    adapter: str
    source: str
    exported_at: str | None
    source_user: dict[str, Any] | None
    documents: list[NormalisedDocument]
    # Project/matter metadata the export carried about itself (the
    # manifest's ``project`` block). Verbatim claim, may be None.
    source_project: dict[str, Any] | None = None

    @property
    def counts(self) -> dict[str, int]:
        return {
            "documents": len(self.documents),
            "versions": sum(len(d.versions) for d in self.documents),
            "edits": sum(len(d.edit_trail) for d in self.documents),
            "verified_at_source": sum(
                1 for d in self.documents if d.hash_origin == HASH_VERIFIED_AT_SOURCE
            ),
            "attested_at_ingest": sum(
                1 for d in self.documents if d.hash_origin == HASH_ATTESTED_AT_INGEST
            ),
            "unhashed": sum(1 for d in self.documents if d.sha256 is None),
            "hash_mismatches": sum(1 for d in self.documents if d.hash_mismatch),
        }

    @property
    def hash_manifest(self) -> list[dict[str, Any]]:
        """Per-document hash manifest — the audit row's spine."""
        return [
            {
                "external_id": d.external_id,
                "filename": d.filename,
                "sha256": d.sha256,
                "hash_origin": d.hash_origin,
                "hash_mismatch": d.hash_mismatch,
                "provenance": d.provenance,
            }
            for d in self.documents
        ]


# ---------------------------------------------------------------------------
# Adapter registry
# ---------------------------------------------------------------------------


class PackAdapter(Protocol):
    name: str
    source: str

    def normalise(
        self, export: dict[str, Any], files: dict[str, bytes]
    ) -> NormalisedPack: ...


# Mike `document_versions.source` → (author, normalised provenance).
# `user_accept` / `user_reject` are versions created when the human
# resolved an assistant edit — human decisions, recorded as such.
MIKE_SOURCE_MAP: dict[str, tuple[str, str]] = {
    "upload": (AUTHOR_HUMAN, "uploaded"),
    "user_upload": (AUTHOR_HUMAN, "uploaded"),
    "assistant_edit": (AUTHOR_ASSISTANT, "assistant_edit"),
    "user_accept": (AUTHOR_HUMAN, "human_accepted"),
    "user_reject": (AUTHOR_HUMAN, "human_rejected"),
    "generated": (AUTHOR_ASSISTANT, "generated"),
}


def _s(row: dict[str, Any], key: str) -> str | None:
    v = row.get(key)
    return v if isinstance(v, str) and v else None


def _i(row: dict[str, Any], key: str) -> int | None:
    v = row.get(key)
    return v if isinstance(v, int) else None


class MikeAdapter:
    """Adapter for Mike's exports — manifest preferred, account fallback.

    Two shapes, tried in order of honesty:

    1. **Project export manifest** (``GET /projects/:id/export``) —
       detected by ``manifest_version``. Documents nest their
       ``versions`` (each carrying the source-computed
       ``content_sha256`` and the ``source`` provenance enum) and
       ``edits``. Hashes here are *verified at source*: the source
       workspace hashed the bytes at write time, before any export.
    2. **Account export** (``GET /user/export``) — flat ``documents`` /
       ``document_versions`` / ``document_edits`` tables. No source
       hashes; documents are hashed at ingest from travelled bytes,
       *attested as received*.

    Optional ``files`` are the entries of the documents ZIP, matched per
    document by the export's download-filename convention: ``<name>.ext``
    or ``<stem> [Edited V<n>].ext`` for assistant-edited active versions.
    """

    name = "mike"
    source = "mike"

    def normalise(
        self, export: dict[str, Any], files: dict[str, bytes]
    ) -> NormalisedPack:
        if not isinstance(export, dict):
            raise MalformedExport("export must be a JSON object")
        if "manifest_version" in export:
            return self._normalise_manifest(export, files)
        docs_raw = export.get("documents")
        if not isinstance(docs_raw, list):
            raise MalformedExport("mike export: missing 'documents' list")
        versions_raw = export.get("document_versions")
        versions_raw = versions_raw if isinstance(versions_raw, list) else []
        edits_raw = export.get("document_edits")
        edits_raw = edits_raw if isinstance(edits_raw, list) else []

        versions_by_doc: dict[str, list[dict[str, Any]]] = {}
        for row in versions_raw:
            if not isinstance(row, dict):
                continue
            doc_id = _s(row, "document_id")
            if doc_id:
                versions_by_doc.setdefault(doc_id, []).append(row)
        edits_by_doc: dict[str, list[dict[str, Any]]] = {}
        for row in edits_raw:
            if not isinstance(row, dict):
                continue
            doc_id = _s(row, "document_id")
            if doc_id:
                edits_by_doc.setdefault(doc_id, []).append(row)

        documents: list[NormalisedDocument] = []
        for raw in docs_raw:
            if not isinstance(raw, dict):
                continue
            documents.append(
                self._normalise_document(
                    raw,
                    versions_by_doc.get(_s(raw, "id") or "", []),
                    edits_by_doc.get(_s(raw, "id") or "", []),
                    files,
                )
            )

        user = export.get("user")
        return NormalisedPack(
            adapter=self.name,
            source=self.source,
            exported_at=_s(export, "exported_at"),
            source_user=user if isinstance(user, dict) else None,
            documents=documents,
        )

    def _normalise_manifest(
        self, export: dict[str, Any], files: dict[str, bytes]
    ) -> NormalisedPack:
        """The preferred shape: per-document versions nested, hashes at
        source (``content_sha256`` computed by the source workspace at
        write time)."""
        docs_raw = export.get("documents")
        if not isinstance(docs_raw, list):
            raise MalformedExport("mike manifest: missing 'documents' list")

        documents: list[NormalisedDocument] = []
        for raw in docs_raw:
            if not isinstance(raw, dict):
                continue
            version_rows = [
                r for r in (raw.get("versions") or []) if isinstance(r, dict)
            ]
            edit_rows = [r for r in (raw.get("edits") or []) if isinstance(r, dict)]
            documents.append(
                self._normalise_document(raw, version_rows, edit_rows, files)
            )

        project = export.get("project")
        return NormalisedPack(
            adapter=self.name,
            source=self.source,
            exported_at=_s(export, "exported_at"),
            source_user=None,
            documents=documents,
            source_project=project if isinstance(project, dict) else None,
        )

    def _normalise_version(self, row: dict[str, Any]) -> NormalisedVersion:
        source = _s(row, "source")
        author, provenance = MIKE_SOURCE_MAP.get(
            source or "", (AUTHOR_UNKNOWN, f"unrecognised:{source}")
        )
        return NormalisedVersion(
            external_id=_s(row, "id"),
            version_number=_i(row, "version_number"),
            source=source,
            author=author,
            provenance=provenance,
            filename=_s(row, "filename"),
            created_at=_s(row, "created_at"),
            content_sha256=_s(row, "content_sha256"),
        )

    def _normalise_document(
        self,
        raw: dict[str, Any],
        version_rows: list[dict[str, Any]],
        edit_rows: list[dict[str, Any]],
        files: dict[str, bytes],
    ) -> NormalisedDocument:
        versions = [
            self._normalise_version(r)
            for r in sorted(
                version_rows, key=lambda r: (r.get("version_number") or 0)
            )
        ]
        current_id = _s(raw, "current_version_id")
        current = next(
            (v for v in versions if v.external_id == current_id), None
        ) or (versions[-1] if versions else None)

        filename = (
            (current.filename if current else None)
            or _s(raw, "name")
            or f"document-{_s(raw, 'id') or 'unknown'}"
        )

        edits = [
            NormalisedEdit(
                external_id=_s(r, "id"),
                version_id=_s(r, "version_id"),
                change_id=_s(r, "change_id"),
                deleted_text=_s(r, "deleted_text"),
                inserted_text=_s(r, "inserted_text"),
                context_before=_s(r, "context_before"),
                context_after=_s(r, "context_after"),
                status=_s(r, "status"),
                resolved_at=_s(r, "resolved_at"),
            )
            for r in edit_rows
        ]

        data = self._match_bytes(filename, current, files)
        ingest_sha256 = (
            hashlib.sha256(data).hexdigest() if data is not None else None
        )
        source_sha256 = current.content_sha256 if current else None
        if source_sha256:
            # The manifest carried a hash computed at the source — the
            # stronger claim. Travelled bytes, when present, cross-check
            # it; a disagreement is recorded, never repaired.
            sha256 = source_sha256
            hash_origin = HASH_VERIFIED_AT_SOURCE
            hash_mismatch = (
                ingest_sha256 is not None and ingest_sha256 != source_sha256
            )
        elif ingest_sha256 is not None:
            sha256 = ingest_sha256
            hash_origin = HASH_ATTESTED_AT_INGEST
            hash_mismatch = False
        else:
            sha256 = None
            hash_origin = None
            hash_mismatch = False

        return NormalisedDocument(
            external_id=_s(raw, "id"),
            filename=filename,
            sha256=sha256,
            hash_origin=hash_origin,
            ingest_sha256=ingest_sha256,
            hash_mismatch=hash_mismatch,
            size_bytes=len(data) if data is not None else None,
            current_version=current,
            versions=versions,
            edit_trail=edits,
        )

    @staticmethod
    def _match_bytes(
        filename: str,
        current: NormalisedVersion | None,
        files: dict[str, bytes],
    ) -> bytes | None:
        """Find this document's bytes among the ZIP entries.

        Mike's ZIP names entries with the active version's filename,
        decorated as ``<stem> [Edited V<n>]<ext>`` when the active
        version is an assistant edit. Try the decorated name first
        (exact intent), then the plain filename.
        """
        candidates: list[str] = []
        if (
            current is not None
            and current.source == "assistant_edit"
            and current.version_number
        ):
            m = re.match(r"^(?P<stem>.*?)(?P<ext>\.[^.]+)?$", filename)
            stem = m.group("stem") if m else filename
            ext = (m.group("ext") if m else None) or ""
            candidates.append(f"{stem} [Edited V{current.version_number}]{ext}")
        candidates.append(filename)
        for name in candidates:
            if name in files:
                return files[name]
        return None


_ADAPTERS: dict[str, PackAdapter] = {MikeAdapter.name: MikeAdapter()}


def get_adapter(name: str) -> PackAdapter:
    adapter = _ADAPTERS.get(name)
    if adapter is None:
        raise UnknownAdapter(
            f"unknown adapter '{name}' (available: {sorted(_ADAPTERS)})"
        )
    return adapter


def normalise_export(
    adapter_name: str, export: dict[str, Any], files: dict[str, bytes] | None = None
) -> NormalisedPack:
    """Normalise an external export into the working-pack shape."""
    return get_adapter(adapter_name).normalise(export, files or {})


# ---------------------------------------------------------------------------
# Ingest — pack → read-only matter + WORM artifacts + audit row
# ---------------------------------------------------------------------------


@dataclass
class IngestResult:
    matter: Matter
    manifest: MatterArtifact
    documents: list[tuple[MatterArtifact, NormalisedDocument]]
    pack: NormalisedPack


async def _unique_external_slug(
    session: AsyncSession, source: str, user_id: uuid.UUID
) -> str:
    for _ in range(8):
        candidate = f"external-{source}-{uuid.uuid4().hex[:8]}"
        exists = await session.scalar(
            select(Matter.id).where(
                Matter.slug == candidate, Matter.created_by_id == user_id
            )
        )
        if exists is None:
            return candidate
    raise ExternalPackError("could not allocate a unique pack slug")


async def ingest_external_pack(
    session: AsyncSession,
    *,
    user: User,
    adapter_name: str,
    export: dict[str, Any],
    files: dict[str, bytes] | None = None,
    title: str | None = None,
) -> IngestResult:
    """Ingest one external pack. Caller commits.

    Creates a C_paused (read-only) matter marked ``external_source``,
    one WORM document artifact per normalised document, a pack manifest
    artifact, and the ``external.pack.ingested`` audit row carrying the
    source, doc counts and hash manifest.

    Document artifacts are written with ``created_by_id=None``: no
    workspace user authored the external material, so a later sign-off
    always carries ``signer_is_author=false`` — explicitly so for
    assistant-authored versions.
    """
    pack = normalise_export(adapter_name, export, files)
    adapter = get_adapter(adapter_name)

    slug = await _unique_external_slug(session, adapter.source, user.id)
    project_name = (
        pack.source_project.get("name") if pack.source_project else None
    )
    default_title = (
        f"External pack — {adapter.source}: {project_name}"
        if isinstance(project_name, str) and project_name
        else f"External pack — {adapter.source} ({datetime.now(UTC).date().isoformat()})"
    )
    matter = Matter(
        id=uuid.uuid4(),
        slug=slug,
        title=title or default_title,
        matter_type="external_pack",
        status=STATUS_OPEN,
        # C_paused → posture gate denies every capability run: the pack
        # is supervised here, never worked here.
        privilege_posture=PRIVILEGE_PAUSED,
        default_model_id="stub-echo",
        facts={"external_pack": True, "adapter": adapter.name},
        external_source=adapter.source,
        created_by_id=user.id,
    )
    session.add(matter)
    await session.flush()

    pack_id = uuid.uuid4()
    documents: list[tuple[MatterArtifact, NormalisedDocument]] = []
    for doc in pack.documents:
        artifact = await write_artifact(
            session,
            matter=matter,
            capability_id=PACK_DOCUMENT_CAPABILITY,
            module_id=PACK_MODULE_ID,
            invocation_id=uuid.uuid4(),
            kind=KIND_DOCUMENT,
            payload=doc.as_payload(),
            actor_user_id=None,
        )
        documents.append((artifact, doc))

    manifest_payload = {
        "schema": PACK_SCHEMA,
        "record": "manifest",
        "adapter": pack.adapter,
        "source": pack.source,
        "exported_at": pack.exported_at,
        "source_user": pack.source_user,
        "source_project": pack.source_project,
        "counts": pack.counts,
        "hash_manifest": pack.hash_manifest,
        "document_artifact_ids": [str(a.id) for a, _ in documents],
        "ingested_at": datetime.now(UTC).isoformat(),
        # The honesty boundary, stated in the record itself.
        "attestation": (
            "Two grades of hash claim, recorded per document: "
            "verified_at_source (the source workspace hashed the bytes at "
            "write time; travelled bytes cross-checked where present) and "
            "attested_at_ingest (hashed here from the bytes the export "
            "carried). This workspace did not watch the work happen."
        ),
    }
    manifest = await write_artifact(
        session,
        matter=matter,
        capability_id=PACK_INGEST_CAPABILITY,
        module_id=PACK_MODULE_ID,
        invocation_id=pack_id,
        kind=KIND_MANIFEST,
        payload=manifest_payload,
        actor_user_id=user.id,
    )

    await audit.log(
        session,
        PACK_INGESTED_ACTION,
        actor_id=user.id,
        matter_id=matter.id,
        module=PACK_MODULE_ID,
        resource_type="matter_artifact",
        resource_id=str(manifest.id),
        payload={
            "adapter": pack.adapter,
            "source": pack.source,
            "counts": pack.counts,
            "hash_manifest": pack.hash_manifest,
            "matter_slug": matter.slug,
        },
    )
    return IngestResult(
        matter=matter, manifest=manifest, documents=documents, pack=pack
    )
