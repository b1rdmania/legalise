"""Phase 6 — signer CLI determinism + roundtrip tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.signing import SignatureStatus, verify_manifest_signature
from scripts.sign_example_module import sign_manifest


def _write_manifest(tmp_path: Path, manifest: dict) -> Path:
    path = tmp_path / "module.json"
    path.write_text(json.dumps(manifest))
    return path


def _minimal_manifest() -> dict:
    return {
        "schema_version": "2.0.0",
        "id": "examples.signtest",
        "name": "Sign Test",
        "version": "1.0.0",
        "publisher": "legalise",
        "visibility": "example",
        "runtime": "native",
        "entrypoint": {"python_module": "x.y", "entry": "Z"},
        "capabilities": [],
    }


def test_signer_is_idempotent(tmp_path: Path) -> None:
    """Re-signing the same manifest produces byte-identical output."""
    path = _write_manifest(tmp_path, _minimal_manifest())
    sign_manifest(path)
    first = path.read_text()
    sign_manifest(path)
    second = path.read_text()
    assert first == second


def test_signature_roundtrips_through_verifier(tmp_path: Path) -> None:
    """The signer's output passes the Phase 3 structural verifier."""
    path = _write_manifest(tmp_path, _minimal_manifest())
    signed = sign_manifest(path)
    result = verify_manifest_signature(signed)
    assert result.status == SignatureStatus.VERIFIED
    assert result.publisher == "legalise"


def test_signer_rejects_missing_publisher(tmp_path: Path) -> None:
    manifest = _minimal_manifest()
    del manifest["publisher"]
    path = _write_manifest(tmp_path, manifest)
    with pytest.raises(ValueError, match="publisher"):
        sign_manifest(path)


def test_signer_rejects_invalid_json(tmp_path: Path) -> None:
    path = tmp_path / "broken.json"
    path.write_text("{not json")
    with pytest.raises(ValueError, match="not valid JSON"):
        sign_manifest(path)
