"""Register sidecar — external pack ingestion tests.

Covers the honesty boundary end to end with synthetic Mike-shaped
fixtures (no vendored external code):

- normalisation of the project export *manifest* (source hash checked
  against travelled bytes → ``verified_at_source``; no bytes →
  ``claimed_by_source``, unchecked; mismatch → ``attested_at_ingest``
  with the mismatch recorded);
- normalisation of the flat account export (no source hashes →
  ``attested_at_ingest`` from travelled bytes, ``unhashed`` otherwise);
- provenance enum mapping (upload / assistant_edit / user_accept /
  user_reject / generated);
- POST /api/external/packs (multipart) → read-only external matter +
  WORM artifacts + ``external.pack.ingested`` audit row w/ hash
  manifest; GET list;
- sign-off against pack outputs through the existing signoffs surface:
  ``signer_is_author`` is always false (artifacts carry no workspace
  author) and the M13 review-open row wires the review window.
"""

from __future__ import annotations

import hashlib
import io
import json
import uuid
import zipfile

import pytest
from sqlalchemy import select

from app.core.external_pack import (
    AUTHOR_ASSISTANT,
    AUTHOR_HUMAN,
    HASH_ATTESTED_AT_INGEST,
    HASH_CLAIMED_BY_SOURCE,
    HASH_VERIFIED_AT_SOURCE,
    MalformedExport,
    UnknownAdapter,
    normalise_export,
)
from app.models import AuditEntry, Matter, User
from app.models.matter import PRIVILEGE_PAUSED


@pytest.fixture(autouse=True)
def _writable_matters_root(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "matters_root", str(tmp_path), raising=False)


DOC_BYTES = b"PK-fake-docx-bytes: settlement agreement draft"
DOC_SHA = hashlib.sha256(DOC_BYTES).hexdigest()


def mike_manifest(*, with_hashes: bool = True) -> dict:
    """Synthetic project-export manifest in Mike's PR #181 shape."""
    sha = DOC_SHA if with_hashes else None
    return {
        "manifest_version": 1,
        "exported_at": "2026-06-12T09:00:00.000Z",
        "project": {
            "id": "proj-1",
            "name": "Hart v Mercia Logistics",
            "cm_number": "CM-0104",
            "created_at": "2026-05-02T10:00:00.000Z",
        },
        "documents": [
            {
                "id": "doc-1",
                "status": "ready",
                "current_version_id": "v-2",
                "created_at": "2026-05-02T10:05:00.000Z",
                "versions": [
                    {
                        "id": "v-1",
                        "version_number": 1,
                        "source": "upload",
                        "filename": "settlement.docx",
                        "file_type": "docx",
                        "size_bytes": 11,
                        "content_sha256": (
                            hashlib.sha256(b"original").hexdigest()
                            if with_hashes
                            else None
                        ),
                        "deleted_at": None,
                        "created_at": "2026-05-02T10:05:00.000Z",
                    },
                    {
                        "id": "v-2",
                        "version_number": 2,
                        "source": "assistant_edit",
                        "filename": "settlement.docx",
                        "file_type": "docx",
                        "size_bytes": len(DOC_BYTES),
                        "content_sha256": sha,
                        "deleted_at": None,
                        "created_at": "2026-05-03T16:20:00.000Z",
                    },
                ],
                "edits": [
                    {
                        "id": "e-1",
                        "version_id": "v-2",
                        "change_id": "c-1",
                        "status": "accepted",
                        "created_at": "2026-05-03T16:20:00.000Z",
                        "resolved_at": "2026-05-03T16:25:00.000Z",
                    }
                ],
            }
        ],
    }


def mike_account_export() -> dict:
    """Synthetic flat account export — no source hashes anywhere."""
    return {
        "exported_at": "2026-06-12T09:00:00.000Z",
        "user": {"id": "u-1", "email": "claimant@example.com"},
        "documents": [
            {
                "id": "doc-1",
                "project_id": "proj-1",
                "status": "ready",
                "current_version_id": "v-2",
                "created_at": "2026-05-02T10:05:00.000Z",
            },
            {
                "id": "doc-2",
                "project_id": "proj-1",
                "status": "ready",
                "current_version_id": "v-3",
                "created_at": "2026-05-04T09:00:00.000Z",
            },
        ],
        "document_versions": [
            {
                "id": "v-1",
                "document_id": "doc-1",
                "version_number": 1,
                "source": "upload",
                "filename": "settlement.docx",
                "created_at": "2026-05-02T10:05:00.000Z",
            },
            {
                "id": "v-2",
                "document_id": "doc-1",
                "version_number": 2,
                "source": "assistant_edit",
                "filename": "settlement.docx",
                "created_at": "2026-05-03T16:20:00.000Z",
            },
            {
                "id": "v-3",
                "document_id": "doc-2",
                "version_number": 1,
                "source": "user_accept",
                "filename": "particulars.docx",
                "created_at": "2026-05-04T09:00:00.000Z",
            },
        ],
        "document_edits": [
            {
                "id": "e-1",
                "document_id": "doc-1",
                "version_id": "v-2",
                "change_id": "c-1",
                "deleted_text": "without admission",
                "inserted_text": "without any admission of liability",
                "context_before": "settled ",
                "context_after": " by the Respondent",
                "status": "accepted",
                "resolved_at": "2026-05-03T16:25:00.000Z",
            }
        ],
    }


def docs_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Normalisation — the honesty boundary
# ---------------------------------------------------------------------------


def test_manifest_with_checked_source_hashes_is_verified_at_source() -> None:
    # The assistant-edited active version's bytes travel under the
    # decorated download name; the manifest's hash is re-checked
    # against them and matches — the only path to verified_at_source.
    pack = normalise_export(
        "mike",
        mike_manifest(with_hashes=True),
        {"settlement [Edited V2].docx": DOC_BYTES},
    )
    assert len(pack.documents) == 1
    doc = pack.documents[0]
    assert doc.sha256 == DOC_SHA
    assert doc.hash_origin == HASH_VERIFIED_AT_SOURCE
    assert doc.ingest_sha256 == DOC_SHA  # the check that earns the grade
    assert doc.source_sha256 == DOC_SHA
    assert doc.hash_mismatch is False
    assert doc.author == AUTHOR_ASSISTANT
    assert doc.provenance == "assistant_edit"
    assert pack.counts["verified_at_source"] == 1
    assert pack.counts["attested_at_ingest"] == 0
    assert pack.counts["claimed_by_source"] == 0
    assert pack.counts["unhashed"] == 0
    assert pack.source_project and pack.source_project["name"] == (
        "Hart v Mercia Logistics"
    )


def test_manifest_only_source_hash_is_claimed_not_verified() -> None:
    # Manifest-only ingest: no ZIP, so nothing was checked. The source
    # hash is preserved as a claim and graded as one — an arbitrary
    # string in the manifest must never mint verified_at_source.
    pack = normalise_export("mike", mike_manifest(with_hashes=True), {})
    doc = pack.documents[0]
    assert doc.sha256 == DOC_SHA
    assert doc.hash_origin == HASH_CLAIMED_BY_SOURCE
    assert doc.ingest_sha256 is None
    assert doc.source_sha256 == DOC_SHA
    assert doc.hash_mismatch is False
    assert pack.counts["verified_at_source"] == 0
    assert pack.counts["claimed_by_source"] == 1


def test_manifest_hash_mismatch_is_recorded_not_repaired() -> None:
    # Tampered bytes: the source claim fails the check. The document
    # is NOT verified_at_source — the canonical hash is the one
    # computed here, the failed claim stays on the record, and the
    # mismatch is counted.
    pack = normalise_export(
        "mike",
        mike_manifest(with_hashes=True),
        {"settlement [Edited V2].docx": b"tampered bytes"},
    )
    doc = pack.documents[0]
    tampered_sha = hashlib.sha256(b"tampered bytes").hexdigest()
    assert doc.sha256 == tampered_sha  # what this workspace holds
    assert doc.hash_origin == HASH_ATTESTED_AT_INGEST
    assert doc.ingest_sha256 == tampered_sha
    assert doc.source_sha256 == DOC_SHA  # the failed claim, on record
    assert doc.hash_mismatch is True
    assert pack.counts["verified_at_source"] == 0
    assert pack.counts["hash_mismatches"] == 1


def test_manifest_without_source_hashes_falls_back_to_ingest() -> None:
    # A manifest whose versions predate content hashing: null hashes.
    # The fallback is honest — hashed here, attested as received.
    pack = normalise_export(
        "mike",
        mike_manifest(with_hashes=False),
        {"settlement [Edited V2].docx": DOC_BYTES},
    )
    doc = pack.documents[0]
    assert doc.sha256 == DOC_SHA
    assert doc.hash_origin == HASH_ATTESTED_AT_INGEST
    assert doc.hash_mismatch is False
    assert pack.counts["verified_at_source"] == 0
    assert pack.counts["attested_at_ingest"] == 1


def test_account_export_normalises_with_ingest_hashes_and_unhashed() -> None:
    # Flat account export: doc-1's bytes travelled, doc-2's did not.
    pack = normalise_export(
        "mike",
        mike_account_export(),
        {"settlement [Edited V2].docx": DOC_BYTES},
    )
    assert len(pack.documents) == 2
    by_id = {d.external_id: d for d in pack.documents}

    d1 = by_id["doc-1"]
    assert d1.sha256 == DOC_SHA
    assert d1.hash_origin == HASH_ATTESTED_AT_INGEST
    assert d1.author == AUTHOR_ASSISTANT
    assert len(d1.versions) == 2
    assert d1.edit_trail[0].status == "accepted"
    assert d1.edit_trail[0].inserted_text == (
        "without any admission of liability"
    )

    d2 = by_id["doc-2"]
    assert d2.sha256 is None  # no bytes, no hash — never guessed
    assert d2.hash_origin is None
    assert d2.author == AUTHOR_HUMAN  # user_accept is a human decision
    assert d2.provenance == "human_accepted"

    assert pack.counts == {
        "documents": 2,
        "versions": 3,
        "edits": 1,
        "verified_at_source": 0,
        "attested_at_ingest": 1,
        "claimed_by_source": 0,
        "unhashed": 1,
        "hash_mismatches": 0,
    }


def test_unknown_adapter_and_malformed_export_raise() -> None:
    with pytest.raises(UnknownAdapter):
        normalise_export("harvey", {}, {})
    with pytest.raises(MalformedExport):
        normalise_export("mike", {"not_documents": []}, {})


# ---------------------------------------------------------------------------
# API — ingest, list, sign-off against external outputs
# ---------------------------------------------------------------------------


async def _register_and_login(client) -> str:
    email = f"pack-{uuid.uuid4().hex[:8]}@example.com"
    password = "register-sidecar-2026"
    await client.post("/auth/register", json={"email": email, "password": password})
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return email


async def _post_pack(client, export: dict, files: dict[str, bytes] | None = None):
    parts = {
        "export": ("export.json", json.dumps(export).encode(), "application/json"),
    }
    if files:
        parts["documents"] = ("documents.zip", docs_zip(files), "application/zip")
    return await client.post(
        "/api/external/packs", data={"adapter": "mike"}, files=parts
    )


@pytest.mark.asyncio
async def test_ingest_manifest_pack_end_to_end(client) -> None:
    email = await _register_and_login(client)
    resp = await _post_pack(
        client,
        mike_manifest(with_hashes=True),
        {"settlement [Edited V2].docx": DOC_BYTES},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["adapter"] == "mike"
    assert body["source"] == "mike"
    assert body["counts"]["documents"] == 1
    assert body["counts"]["verified_at_source"] == 1
    assert body["title"] == "External pack — mike: Hart v Mercia Logistics"
    assert len(body["document_artifact_ids"]) == 1

    # The matter is external and read-only by construction.
    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(
            select(Matter).where(Matter.slug == body["matter_slug"])
        )
        assert matter is not None
        assert matter.external_source == "mike"
        assert matter.privilege_posture == PRIVILEGE_PAUSED

        owner = await session.scalar(select(User).where(User.email == email))
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "external.pack.ingested",
                AuditEntry.matter_id == matter.id,
            )
        )
        assert row is not None
        assert row.actor_id == owner.id
        manifest = row.payload["hash_manifest"]
        assert manifest[0]["sha256"] == DOC_SHA
        assert manifest[0]["hash_origin"] == "verified_at_source"

    # The pack shows on the list with zero sign-offs.
    listed = await client.get("/api/external/packs")
    assert listed.status_code == 200
    packs = listed.json()["packs"]
    assert len(packs) == 1
    assert packs[0]["matter_slug"] == body["matter_slug"]
    assert packs[0]["signoffs"]["total"] == 0


@pytest.mark.asyncio
async def test_ingest_manifest_only_pack_lands_as_claimed(client) -> None:
    # No ZIP through the API: every hash is an unchecked claim, and the
    # response, manifest artifact and audit row must all say so.
    await _register_and_login(client)
    resp = await _post_pack(client, mike_manifest(with_hashes=True))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["counts"]["verified_at_source"] == 0
    assert body["counts"]["claimed_by_source"] == 1
    assert body["counts"]["hash_mismatches"] == 0

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        matter = await session.scalar(
            select(Matter).where(Matter.slug == body["matter_slug"])
        )
        row = await session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "external.pack.ingested",
                AuditEntry.matter_id == matter.id,
            )
        )
        assert row is not None
        manifest = row.payload["hash_manifest"]
        assert manifest[0]["hash_origin"] == "claimed_by_source"
        assert row.payload["counts"]["verified_at_source"] == 0


@pytest.mark.asyncio
async def test_ingest_rejects_unknown_adapter_and_bad_json(client) -> None:
    await _register_and_login(client)
    r1 = await client.post(
        "/api/external/packs",
        data={"adapter": "harvey"},
        files={"export": ("export.json", b"{}", "application/json")},
    )
    assert r1.status_code == 422
    assert r1.json()["detail"]["error"] == "unknown_adapter"

    r2 = await client.post(
        "/api/external/packs",
        data={"adapter": "mike"},
        files={"export": ("export.json", b"not-json", "application/json")},
    )
    assert r2.status_code == 422


@pytest.mark.asyncio
async def test_signoff_against_external_pack_output(client) -> None:
    """The point of the sidecar: a workspace user signs an external,
    assistant-authored output. ``signer_is_author`` must be false and
    the M13 review window must wire through review-open."""
    await _register_and_login(client)
    resp = await _post_pack(
        client,
        mike_manifest(with_hashes=True),
        {"settlement [Edited V2].docx": DOC_BYTES},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    slug = body["matter_slug"]
    artifact_id = body["document_artifact_ids"][0]

    # M13: open the sign surface first — starts the review window.
    opened = await client.post(
        f"/api/matters/{slug}/signoffs/review-open",
        json={"artifact_id": artifact_id},
    )
    assert opened.status_code == 200
    assert opened.json()["recorded"] is True

    signed = await client.post(
        f"/api/matters/{slug}/signoffs",
        json={"artifact_id": artifact_id, "decision": "signed"},
    )
    assert signed.status_code == 201, signed.text
    s = signed.json()
    # No workspace user authored the external material: never self-sign.
    assert s["signer_is_author"] is False
    assert s["decision"] == "signed"
    # Review window derived from the review-open row, not None.
    assert s["review_seconds"] is not None and s["review_seconds"] >= 0

    # The pack list now tallies the current sign-off.
    listed = await client.get("/api/external/packs")
    pack = listed.json()["packs"][0]
    assert pack["signoffs"]["total"] == 1
    assert pack["signoffs"]["signed"] == 1


@pytest.mark.asyncio
async def test_packs_require_auth(client) -> None:
    r = await client.get("/api/external/packs")
    assert r.status_code == 401
