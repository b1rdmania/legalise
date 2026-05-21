"""Tabular Review .docx export — verifies the writes go to object
storage (Unit 1) and NOT to the matters_root filesystem.

Per HANDOVER_SUBSTRATE_REVIEW_FIXES.md §2 P1: pre-fix the export wrote
to ``settings.matters_root`` while the download endpoint read via
``get_storage_backend()``. In S3 production this meant the bytes were
on the Fly machine but the download endpoint looked in R2 — silent
breakage. Test asserts the producer-side fix.
"""

from __future__ import annotations

import io
import os
import uuid
import zipfile
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_export_writes_to_object_storage_not_filesystem(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """`export_review_docx` writes the .docx bytes to the storage
    backend and records `storage_uri` as an object key. It must NOT
    write to settings.matters_root."""
    # Route the singleton to LocalStorageBackend rooted at tmp_path.
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path))

    from app.core.storage import _reset_backend, get_storage_backend

    _reset_backend()
    try:
        # Late import so the env override is in effect.
        from app.modules.tabular_review.export import export_review_docx

        matter_id = uuid.uuid4()
        user_id = uuid.uuid4()
        review_id = uuid.uuid4()
        actor_id = user_id

        # Matter stub
        matter = MagicMock()
        matter.id = matter_id
        matter.slug = "khan-v-acme-trading-2026"
        matter.title = "Khan v Acme"
        matter.created_by_id = user_id

        # Review stub with two columns
        review = MagicMock()
        review.id = review_id
        review.title = "Disclosure Audit"
        review.columns_config = [
            {"key": "topic", "label": "Topic", "prompt": "Extract the topic."},
            {"key": "outcome", "label": "Outcome", "prompt": "Outcome reached."},
        ]

        # Empty grid is fine — we only care about the write path.
        async def _scalars_side_effect(query):
            r = MagicMock()
            r.all.return_value = []
            return r

        session = AsyncMock()
        session.scalars.side_effect = _scalars_side_effect

        file_uuid, byte_count, storage_uri = await export_review_docx(
            session=session,
            review=review,
            matter=matter,
            actor_id=actor_id,
        )

        # Storage URI is now an object key, not a relative filesystem path.
        assert storage_uri.startswith(f"users/{user_id}/matters/{matter_id}/generated/"), (
            f"storage_uri must be the canonical object key — got {storage_uri!r}"
        )
        assert storage_uri.endswith(f"{file_uuid}.docx"), storage_uri

        # Bytes are readable via the storage abstraction.
        backend = get_storage_backend()
        raw = backend.get_bytes(storage_uri)
        assert len(raw) == byte_count

        # And it really is a valid .docx (zip with the OOXML core).
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            names = set(zf.namelist())
        assert "word/document.xml" in names

        # Nothing was written to the legacy filesystem location.
        # `settings.matters_root` defaults to "/data/matters" in prod
        # and is overridden per env in CI. Walk it (if present) and
        # confirm no .docx file matches our file_uuid.
        from app.core.config import settings

        matters_root = settings.matters_root
        if os.path.isdir(matters_root):
            for root, _dirs, files in os.walk(matters_root):
                for f in files:
                    assert str(file_uuid) not in f, (
                        f"tabular review export must not write to "
                        f"matters_root; found {root}/{f}"
                    )
    finally:
        _reset_backend()
