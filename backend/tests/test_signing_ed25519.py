"""Real ed25519 manifest signatures — keygen, sign, verify.

Pure unit tests (no DB). Covers the three contract points:
keypair roundtrip → VERIFIED, tampered manifest → INVALID, and the
structural fallback when the publisher has no registered key.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

import app.core.signing as signing
from app.core.signing import (
    SignatureStatus,
    manifest_signing_digest,
    verify_manifest_signature,
)
from scripts.sign_manifest import keygen, load_private_key, sign_manifest


def _minimal_manifest() -> dict:
    return {
        "schema_version": "2.0.0",
        "id": "examples.ed25519test",
        "name": "Ed25519 Test",
        "version": "1.0.0",
        "publisher": "legalise",
        "visibility": "example",
        "runtime": "native",
        "entrypoint": {"python_module": "x.y", "entry": "Z"},
        "capabilities": [],
    }


@pytest.fixture()
def publisher_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Generate a keypair and register the public key for 'legalise'."""
    key_path = tmp_path / "priv.key"
    public_b64 = keygen(key_path)
    monkeypatch.setattr(
        signing,
        "publisher_signing_key",
        lambda publisher_id: public_b64 if publisher_id == "legalise" else None,
    )
    return key_path


def _write_manifest(tmp_path: Path, manifest: dict) -> Path:
    path = tmp_path / "module.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path


def test_keypair_roundtrip_returns_verified(
    tmp_path: Path, publisher_key: Path
) -> None:
    path = _write_manifest(tmp_path, _minimal_manifest())
    signed = sign_manifest(path, publisher_key)
    result = verify_manifest_signature(signed)
    assert result.status is SignatureStatus.VERIFIED
    assert result.publisher == "legalise"
    assert result.signed_by == "legalise"


def test_signing_is_deterministic_and_idempotent(
    tmp_path: Path, publisher_key: Path
) -> None:
    path = _write_manifest(tmp_path, _minimal_manifest())
    sign_manifest(path, publisher_key)
    first = path.read_text()
    sign_manifest(path, publisher_key)
    assert path.read_text() == first


def test_tampered_manifest_returns_invalid(
    tmp_path: Path, publisher_key: Path
) -> None:
    path = _write_manifest(tmp_path, _minimal_manifest())
    signed = sign_manifest(path, publisher_key)
    signed["capabilities"] = [{"reads": ["matter.documents"]}]
    result = verify_manifest_signature(signed)
    assert result.status is SignatureStatus.INVALID
    assert "does not match" in result.notes


def test_signature_from_wrong_key_returns_invalid(
    tmp_path: Path, publisher_key: Path
) -> None:
    other_key = tmp_path / "other.key"
    keygen(other_key)  # public key NOT registered
    path = _write_manifest(tmp_path, _minimal_manifest())
    signed = sign_manifest(path, other_key)
    result = verify_manifest_signature(signed)
    assert result.status is SignatureStatus.INVALID


def test_non_base64_signature_returns_invalid(publisher_key: Path) -> None:
    manifest = _minimal_manifest()
    manifest["signed_by"] = "legalise"
    result = verify_manifest_signature(
        manifest, signature="not-valid-base64!!!!"
    )
    assert result.status is SignatureStatus.INVALID


def test_no_registered_key_falls_back_to_structural() -> None:
    """Without a registered key the verifier never claims VERIFIED."""
    manifest = _minimal_manifest()
    manifest["signed_by"] = "legalise"
    result = verify_manifest_signature(manifest, signature="b" * 64)
    assert result.status is SignatureStatus.STRUCTURE_VERIFIED


def test_signing_digest_excludes_signature_fields() -> None:
    """signature/signed_by must not feed the signed digest (idempotence)."""
    manifest = _minimal_manifest()
    unsigned_digest = manifest_signing_digest(manifest)
    manifest["signature"] = "anything"
    manifest["signed_by"] = "legalise"
    assert manifest_signing_digest(manifest) == unsigned_digest


def test_keygen_writes_private_key_loadable(tmp_path: Path) -> None:
    key_path = tmp_path / "priv.key"
    public_b64 = keygen(key_path)
    private_key = load_private_key(key_path)
    derived = base64.b64encode(
        private_key.public_key().public_bytes_raw()
    ).decode("ascii")
    assert derived == public_b64
    assert (key_path.stat().st_mode & 0o777) == 0o600
