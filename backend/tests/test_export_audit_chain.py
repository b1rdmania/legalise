"""Matter export — audit hash chain travels with the pack (F5).

The export must be verifiable offline: ``audit_chain.json`` carries every
chain row in canonical string form plus the head hash, and ``verify_chain.py``
(a copy of ``app/core/export_chain_verifier.py``) recomputes the chain with
nothing but the standard library.

Two anti-drift properties are pinned here:
  1. The standalone verifier validates a chain produced by the real
     database trigger — if the canonical recipe in the verifier drifts from
     the PL/pgSQL / ``audit_chain.py`` recipe, these tests fail.
  2. A tampered export fails loudly: flip one byte in one exported entry
     and the verifier exits non-zero.
"""

from __future__ import annotations

import importlib.util
import io
import json
import subprocess
import sys
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.audit_chain import AuditEntryCanonical, chain_link_hash
from app.core.exports import build_matter_export
from app.core.storage import get_storage_backend
from app.models import PRIVILEGE_CLEARED, STATUS_OPEN, AuditEntry, Matter, User

VERIFIER_SOURCE = (
    Path(__file__).parents[1] / "app" / "core" / "export_chain_verifier.py"
)


def _load_verifier_module():
    spec = importlib.util.spec_from_file_location("export_chain_verifier", VERIFIER_SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# No-DB drift guard: standalone recipe == app recipe
# ---------------------------------------------------------------------------


def test_standalone_verifier_recipe_matches_app_recipe() -> None:
    """The verifier ships without app imports, so its hash recipe is a copy.

    This pins the copy to the original: an entry hashed by
    ``app.core.audit_chain`` must hash identically in the standalone
    verifier, given the exported canonical field strings.
    """
    verifier = _load_verifier_module()

    canonical = AuditEntryCanonical(
        id=uuid.uuid4(),
        timestamp=datetime(2026, 7, 5, 12, 30, 45, 123456, tzinfo=UTC),
        actor_id=uuid.uuid4(),
        matter_id=uuid.uuid4(),
        action="model.call",
        module="assistant",
        resource_type="thread",
        resource_id="t-1",
        model_used="claude-sonnet-4-5",
        prompt_hash="a" * 64,
        response_hash=None,
        token_count=1234,
        latency_ms=None,
        tokens_in=1000,
        tokens_out=234,
        cost_micros=4200,
        currency="GBP",
        provider="anthropic",
        model_id="claude-sonnet-4-5",
        payload_text='{"kind": "chain-drift-probe", "text": "quoted \\"bytes\\" — £ ünïcode"}',
    )

    app_entry_hash = canonical.entry_hash()
    exported = canonical.canonical_fields()
    assert verifier.entry_hash(exported) == app_entry_hash

    link_kwargs = {
        "chain_version": 1,
        "scope_type": "matter",
        "matter_id": canonical.matter_id,
        "scope_sequence": 7,
        "audit_entry_id": canonical.id,
        "previous_chain_hash": "b" * 64,
        "entry_hash": app_entry_hash,
    }
    app_chain_hash = chain_link_hash(**link_kwargs)
    exported_entry = {
        **exported,
        "scope_type": "matter",
        "scope_sequence": 7,
        "chain_version": 1,
        "previous_chain_hash": "b" * 64,
    }
    assert verifier.chain_link_hash(exported_entry, app_entry_hash) == app_chain_hash


# ---------------------------------------------------------------------------
# DB-backed: real trigger-built chain → export → offline verification
# ---------------------------------------------------------------------------


async def _seed(db_session) -> Matter:
    user = User(
        id=uuid.uuid4(),
        email=f"chain-exp-{uuid.uuid4().hex[:8]}@example.com",
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
        slug=f"chain-exp-{uuid.uuid4().hex[:8]}",
        title="Chain Export Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="stub-echo",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    for n in range(3):
        db_session.add(
            AuditEntry(
                action=f"chain.export.step{n}",
                module="test",
                matter_id=matter.id,
                actor_id=user.id,
                payload={"n": n, "note": "seeded for export chain test — £"},
            )
        )
    await db_session.flush()
    await db_session.commit()
    return matter


def _unzip_export(export_key: str, target: Path) -> None:
    raw = get_storage_backend().get_bytes(export_key)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        zf.extractall(target)


def _run_verifier(pack_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(pack_dir / "verify_chain.py")],
        capture_output=True,
        text=True,
        cwd=pack_dir,
    )


@pytest.mark.asyncio
async def test_export_carries_chain_and_verifies_offline(db_session, tmp_path) -> None:
    matter = await _seed(db_session)

    export_key = await build_matter_export(db_session, matter, uuid.uuid4())
    _unzip_export(export_key, tmp_path)

    chain_doc = json.loads((tmp_path / "audit_chain.json").read_text(encoding="utf-8"))
    assert chain_doc["format"] == "legalise-audit-chain-export-v1"
    assert chain_doc["matter_id"] == str(matter.id)
    assert chain_doc["entry_count"] >= 3
    assert chain_doc["head"]["entry_count"] == chain_doc["entry_count"]
    assert len(chain_doc["head"]["chain_hash"]) == 64
    assert chain_doc["head"]["timestamp"] == chain_doc["entries"][-1]["timestamp"]

    entries = chain_doc["entries"]
    assert entries[0]["scope_sequence"] == 1
    assert entries[0]["previous_chain_hash"] is None
    assert all(len(e["entry_hash"]) == 64 and len(e["chain_hash"]) == 64 for e in entries)

    # The chain and the human-readable log describe the same rows.
    audit_rows = json.loads((tmp_path / "audit.json").read_text(encoding="utf-8"))
    assert {e["id"] for e in entries} == {r["id"] for r in audit_rows}

    # README points at the verifier.
    readme = (tmp_path / "README.md").read_text(encoding="utf-8")
    assert "audit_chain.json" in readme
    assert "verify_chain.py" in readme

    # Offline verification: no DB, no app imports, just the pack.
    result = _run_verifier(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS" in result.stdout
    assert chain_doc["head"]["chain_hash"] in result.stdout


@pytest.mark.asyncio
async def test_tampered_export_fails_verification(db_session, tmp_path) -> None:
    matter = await _seed(db_session)

    export_key = await build_matter_export(db_session, matter, uuid.uuid4())
    _unzip_export(export_key, tmp_path)

    chain_path = tmp_path / "audit_chain.json"
    chain_doc = json.loads(chain_path.read_text(encoding="utf-8"))

    # Flip one byte in one exported entry's payload.
    target = chain_doc["entries"][1]
    payload_text = target["payload_text"]
    flipped = chr(ord(payload_text[0]) ^ 1) + payload_text[1:]
    assert flipped != payload_text
    target["payload_text"] = flipped
    chain_path.write_text(json.dumps(chain_doc, ensure_ascii=False), encoding="utf-8")

    result = _run_verifier(tmp_path)
    assert result.returncode == 1
    assert "FAIL" in result.stdout
    assert "entry hash does not match" in result.stdout


@pytest.mark.asyncio
async def test_truncated_chain_fails_verification(db_session, tmp_path) -> None:
    """Dropping the newest entry (and keeping its head) must fail —
    truncation is the cheap rewrite the head hash exists to catch."""
    matter = await _seed(db_session)

    export_key = await build_matter_export(db_session, matter, uuid.uuid4())
    _unzip_export(export_key, tmp_path)

    chain_path = tmp_path / "audit_chain.json"
    chain_doc = json.loads(chain_path.read_text(encoding="utf-8"))
    chain_doc["entries"] = chain_doc["entries"][:-1]
    chain_path.write_text(json.dumps(chain_doc, ensure_ascii=False), encoding="utf-8")

    result = _run_verifier(tmp_path)
    assert result.returncode == 1
    assert "FAIL" in result.stdout
