"""Manifest signature verification + example-signer CLI tests.

Merged from test_phase3_signing.py + test_phase6_sign_example_module.py.
The structural happy path (verified publisher + plausible signature →
STRUCTURE_VERIFIED) lives in test_signing_ed25519.py
(test_no_registered_key_falls_back_to_structural) — not repeated here.
Real ed25519 keypair sign/verify is also test_signing_ed25519.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.signing import (
    SignatureResult,
    SignatureStatus,
    compute_manifest_hash,
    verify_manifest_signature,
)
from scripts.sign_example_module import sign_manifest


def _base_manifest(**overrides) -> dict:
    m = {
        "schema_version": "2.0.0",
        "id": "test.module",
        "name": "Test",
        "version": "1.0.0",
        "publisher": "legalise",
        "visibility": "first_party",
        "runtime": "native",
        "entrypoint": {"python_module": "test.fixture", "entry": "M"},
        "capabilities": [],
    }
    m.update(overrides)
    return m


# ---------------------------------------------------------------------------
# Structural verifier
# ---------------------------------------------------------------------------


def test_unsigned_manifest_returns_unsigned() -> None:
    result = verify_manifest_signature(_base_manifest())
    assert isinstance(result, SignatureResult)
    assert result.status is SignatureStatus.UNSIGNED


def test_missing_publisher_returns_invalid() -> None:
    m = _base_manifest()
    m["publisher"] = ""
    result = verify_manifest_signature(m)
    assert result.status is SignatureStatus.INVALID


def test_unknown_publisher_with_signature_returns_unknown_publisher() -> None:
    m = _base_manifest(publisher="random-org", signed_by="random-org")
    result = verify_manifest_signature(
        m,
        signature="a" * 64,  # length-plausible payload
    )
    assert result.status is SignatureStatus.UNKNOWN_PUBLISHER


def test_signed_by_mismatch_returns_invalid() -> None:
    m = _base_manifest(publisher="legalise", signed_by="someone-else")
    result = verify_manifest_signature(m, signature="c" * 64)
    assert result.status is SignatureStatus.INVALID


def test_short_signature_returns_invalid() -> None:
    m = _base_manifest(publisher="legalise", signed_by="legalise")
    result = verify_manifest_signature(m, signature="short")
    assert result.status is SignatureStatus.INVALID


def test_compute_manifest_hash_is_stable() -> None:
    m = _base_manifest()
    h1 = compute_manifest_hash(m)
    h2 = compute_manifest_hash(m)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_compute_manifest_hash_is_canonical() -> None:
    """Key reordering must not change the hash."""
    m1 = {"a": 1, "b": 2, "c": 3}
    m2 = {"c": 3, "b": 2, "a": 1}
    assert compute_manifest_hash(m1) == compute_manifest_hash(m2)


# ---------------------------------------------------------------------------
# Example-module signer CLI (scripts/sign_example_module.py)
# ---------------------------------------------------------------------------


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
    """The signer's output passes the structural verifier."""
    path = _write_manifest(tmp_path, _minimal_manifest())
    signed = sign_manifest(path)
    result = verify_manifest_signature(signed)
    assert result.status == SignatureStatus.STRUCTURE_VERIFIED
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
