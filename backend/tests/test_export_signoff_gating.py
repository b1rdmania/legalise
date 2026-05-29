"""Export Gating v1.1 — the matter export respects sign-off status.

The signed record must be operationally meaningful downstream: the export
labels every output by sign-off status, includes the sign-off records, and
the README summarises signed / rejected / unsigned so signed outputs are
the preferred final material and unsigned AI outputs read as drafts.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile

import pytest

from app.core.exports import build_matter_export
from app.core.matter_artifacts import write_artifact
from app.core.signoff import create_signoff
from app.core.storage import get_storage_backend
from app.models import Matter, PRIVILEGE_CLEARED, STATUS_OPEN, User


async def _seed(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"expsign-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role="solicitor",
    )
    db_session.add(user)
    await db_session.flush()
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"expsign-{uuid.uuid4().hex[:8]}",
        title="Export Sign-off Gating Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    signed_art = await write_artifact(
        db_session,
        matter=matter,
        capability_id="summarise",
        module_id="demo.guided-skill",
        invocation_id=uuid.uuid4(),
        kind="skill_response",
        payload={"output": "Signed summary.", "model_id": "stub-echo"},
        actor_user_id=user.id,
    )
    unsigned_art = await write_artifact(
        db_session,
        matter=matter,
        capability_id="summarise",
        module_id="demo.guided-skill",
        invocation_id=uuid.uuid4(),
        kind="skill_response",
        payload={"output": "Unsigned draft.", "model_id": "stub-echo"},
        actor_user_id=user.id,
    )
    signoff = await create_signoff(
        db_session, matter=matter, artifact=signed_art, user=user, decision="signed"
    )
    await db_session.commit()
    return user, matter, signed_art, unsigned_art, signoff


@pytest.mark.asyncio
async def test_export_labels_outputs_by_signoff_status(db_session) -> None:
    _user, matter, signed_art, unsigned_art, signoff = await _seed(db_session)

    export_key = await build_matter_export(db_session, matter, uuid.uuid4())
    raw = get_storage_backend().get_bytes(export_key)

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())
        assert "signoffs.json" in names

        # signoffs.json carries the sign-off record, flagged current.
        signoffs = json.loads(zf.read("signoffs.json"))
        rec = next(s for s in signoffs if s["id"] == str(signoff.id))
        assert rec["decision"] == "signed"
        assert rec["is_current"] is True

        # Each artefact metadata is labelled by sign-off status.
        index = {a["id"]: a for a in json.loads(zf.read("artefacts.json"))}
        assert index[str(signed_art.id)]["signoff_status"] == "signed"
        assert index[str(signed_art.id)]["signoff_hash_matches"] is True
        assert index[str(unsigned_art.id)]["signoff_status"] == "unsigned"

        # README summarises sign-off status; signed are the final material.
        readme = zf.read("README.md").decode("utf-8")
        assert "Signed (final material): 1" in readme
        assert "Unsigned (draft, prepared by AI): 1" in readme
