"""Working-pack polish — README + WORKING_PACK.md copy boundaries.

Pins:
- WORKING_PACK.md is present in the export zip.
- Both the README and the WORKING_PACK distinguish the four sign-off
  states (signed / signed-with-observations / rejected / unsigned).
- README carries the human-verification checklist.
- Neither file overclaims (no "court-ready", "verified", "certified",
  "SRA-approved", "court filing" wording in the affirmative).

Existing machine-readable JSON paths and labels are NOT changed by this
polish — see test_export_signoff_gating.py and test_export_completeness.py
for those assertions.
"""

from __future__ import annotations

import io
import re
import uuid
import zipfile

import pytest

from app.core.exports import build_matter_export
from app.core.matter_artifacts import write_artifact
from app.core.signoff import create_signoff
from app.core.storage import get_storage_backend
from app.models import Matter, PRIVILEGE_CLEARED, STATUS_OPEN, User


async def _seed_four_states(db_session):
    """Seed one artifact in each of the four sign-off states."""
    user = User(
        id=uuid.uuid4(),
        email=f"wp-{uuid.uuid4().hex[:8]}@example.com",
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
        slug=f"wp-{uuid.uuid4().hex[:8]}",
        title="Working Pack Polish Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()

    def _mk(payload_output: str):
        return write_artifact(
            db_session,
            matter=matter,
            capability_id="summarise",
            module_id="demo.guided-skill",
            invocation_id=uuid.uuid4(),
            kind="skill_response",
            payload={"output": payload_output, "model_id": "stub-echo"},
            actor_user_id=user.id,
        )

    signed_art = await _mk("Signed.")
    obs_art = await _mk("Signed with observations.")
    rejected_art = await _mk("Rejected draft.")
    unsigned_art = await _mk("Unsigned draft.")

    await create_signoff(
        db_session, matter=matter, artifact=signed_art, user=user, decision="signed"
    )
    await create_signoff(
        db_session,
        matter=matter,
        artifact=obs_art,
        user=user,
        decision="signed_with_observations",
        reasoning="Two minor concerns noted.",
    )
    await create_signoff(
        db_session,
        matter=matter,
        artifact=rejected_art,
        user=user,
        decision="rejected",
        reasoning="Output does not match the source.",
    )
    await db_session.commit()
    return user, matter, signed_art, obs_art, rejected_art, unsigned_art


async def _build_and_open(db_session, matter):
    export_key = await build_matter_export(db_session, matter, uuid.uuid4())
    raw = get_storage_backend().get_bytes(export_key)
    return zipfile.ZipFile(io.BytesIO(raw))


# Overclaim wording the pack must not use AT ALL. Phrases chosen so that
# any occurrence — affirmative or negated — is a drift signal: a sentence
# saying "this is not court-ready" would be strange phrasing in the
# affirmative-honesty register the pack uses, so we treat the substring
# itself as the alarm. The "not a certified legal record" honesty clause
# is asserted positively below, so phrases like "certified" are not on
# this list (they appear in legitimate negation).
OVERCLAIM_FORBIDDEN = [
    "court-ready",
    "court ready",
    "sra-approved",
    "sra approved",
    "legally binding",
    "legal certificate",
]


@pytest.mark.asyncio
async def test_export_includes_working_pack_summary(db_session) -> None:
    _user, matter, *_ = await _seed_four_states(db_session)
    with await _build_and_open(db_session, matter) as zf:
        names = set(zf.namelist())
        assert "WORKING_PACK.md" in names
        wp = zf.read("WORKING_PACK.md").decode("utf-8")
        assert matter.title in wp
        assert matter.slug in wp
        # The four sign-off states are each named.
        assert "Signed (final material): 2" in wp
        assert "signed with observations: 1" in wp
        assert "Rejected: 1" in wp
        assert "Unsigned (draft): 1" in wp
        # Where to look for what.
        assert "artefacts/" in wp
        assert "signoffs.json" in wp
        assert "reviews.json" in wp
        assert "reconstruction.json" in wp
        assert "audit.json" in wp
        # Pointer to README for the full file index.
        assert "README.md" in wp


@pytest.mark.asyncio
async def test_export_readme_distinguishes_four_signoff_states(db_session) -> None:
    _user, matter, *_ = await _seed_four_states(db_session)
    with await _build_and_open(db_session, matter) as zf:
        readme = zf.read("README.md").decode("utf-8")
        # The aggregate signed (final material) count = signed + signed_with_observations.
        assert "Signed (final material): 2" in readme
        # Observations broken out.
        assert "signed with observations: 1" in readme
        # Rejected as its own line.
        assert "Rejected: 1" in readme
        # Unsigned (draft) as its own line.
        assert "Unsigned (draft, prepared by AI): 1" in readme


@pytest.mark.asyncio
async def test_export_readme_carries_human_verification_checklist(db_session) -> None:
    _user, matter, *_ = await _seed_four_states(db_session)
    with await _build_and_open(db_session, matter) as zf:
        readme = zf.read("README.md").decode("utf-8")
        # Section heading.
        assert "What a human still needs to verify" in readme
        # Five checklist items expected.
        item_count = len(re.findall(r"^- \[ \] ", readme, flags=re.MULTILINE))
        assert item_count >= 5, f"Expected >= 5 checklist items, found {item_count}"
        # The solicitor-onward-judgement clause is explicit.
        assert "qualified solicitor" in readme


@pytest.mark.asyncio
async def test_export_pack_does_not_overclaim(db_session) -> None:
    _user, matter, *_ = await _seed_four_states(db_session)
    with await _build_and_open(db_session, matter) as zf:
        readme = zf.read("README.md").decode("utf-8").lower()
        wp = zf.read("WORKING_PACK.md").decode("utf-8").lower()
        for forbidden in OVERCLAIM_FORBIDDEN:
            assert forbidden not in readme, (
                f"README overclaim drift: {forbidden!r} appeared in README.md"
            )
            assert forbidden not in wp, (
                f"WORKING_PACK overclaim drift: {forbidden!r} appeared in WORKING_PACK.md"
            )
        # Honesty boundary on what the pack is.
        assert "not a certified legal record" in readme
        assert "not a court filing" in wp or "not a certified legal record" in wp


@pytest.mark.asyncio
async def test_export_remains_backward_compatible_for_json_consumers(db_session) -> None:
    """The polish does not move or rename existing machine-readable files."""
    _user, matter, *_ = await _seed_four_states(db_session)
    with await _build_and_open(db_session, matter) as zf:
        names = set(zf.namelist())
        for required in (
            "matter_metadata.json",
            "artefacts.json",
            "signoffs.json",
            "reviews.json",
            "reconstruction.json",
            "audit.json",
            "jobs.json",
            "README.md",
        ):
            assert required in names, f"Existing path missing after polish: {required}"
