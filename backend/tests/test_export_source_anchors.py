"""Source Anchors v1 — SA-6 export + sign-off preservation.

Anchors live in the artifact payload, so they flow through export with no
new structure and are pinned by the sign-off hash for free. This proves
both: exported artifact JSON carries source_anchors, and signing an
anchored artifact yields signoff_hash_matches: true.
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
        email=f"sa6-{uuid.uuid4().hex[:8]}@example.com",
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
        slug=f"sa6-{uuid.uuid4().hex[:8]}",
        title="SA6 Export Anchors",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    artifact = await write_artifact(
        db_session,
        matter=matter,
        capability_id="summarise",
        module_id="demo.guided-skill",
        invocation_id=uuid.uuid4(),
        kind="skill_response",
        payload={
            "output": "Summary.",
            "model_id": "stub-echo",
            "source_anchors": [
                {
                    "id": "src_d1",
                    "source_type": "document",
                    "document_id": "11111111-1111-1111-1111-111111111111",
                    "filename": "khan-dismissal-letter.pdf",
                    "label": "Document · khan-dismissal-letter.pdf",
                    "quote": None,
                    "page": None,
                }
            ],
        },
        actor_user_id=user.id,
    )
    signoff = await create_signoff(
        db_session, matter=matter, artifact=artifact, user=user, decision="signed"
    )
    await db_session.commit()
    return matter, artifact, signoff


@pytest.mark.asyncio
async def test_export_preserves_source_anchors_and_hash(db_session) -> None:
    matter, artifact, _signoff = await _seed(db_session)

    export_key = await build_matter_export(db_session, matter, uuid.uuid4())
    raw = get_storage_backend().get_bytes(export_key)

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        # Anchors survive in the exported artifact JSON (no new structure).
        body = json.loads(zf.read(f"artefacts/{artifact.id}/skill_response.json"))
        assert body["source_anchors"][0]["document_id"] == (
            "11111111-1111-1111-1111-111111111111"
        )
        # Signing an anchored artifact pins the anchors — hash still matches.
        index = {a["id"]: a for a in json.loads(zf.read("artefacts.json"))}
        assert index[str(artifact.id)]["signoff_status"] == "signed"
        assert index[str(artifact.id)]["signoff_hash_matches"] is True
        # README explains source anchors honestly.
        readme = zf.read("README.md").decode("utf-8")
        assert "Source anchors" in readme
        assert "not proof" in readme
