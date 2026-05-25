"""Phase 3 — manifest signature verification tests."""

from __future__ import annotations

from app.core.signing import (
    SignatureResult,
    SignatureStatus,
    compute_manifest_hash,
    verify_manifest_signature,
)


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


def test_verified_publisher_with_signature_returns_verified() -> None:
    m = _base_manifest(publisher="legalise", signed_by="legalise")
    result = verify_manifest_signature(m, signature="b" * 64)
    assert result.status is SignatureStatus.VERIFIED


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
