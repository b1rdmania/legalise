"""Manifest signature verification.

Two tiers of verification:

1. **Cryptographic (ed25519)** — when the publisher has a registered
   ed25519 public key in ``app.core.publishers`` and the manifest
   carries a signature, the signature is verified over the manifest's
   canonical hash. Outcome: ``VERIFIED`` (valid) or ``INVALID``.
2. **Structural** — when the publisher has no registered key, the
   verifier falls back to shape checks only (signature present and
   plausible, publisher in registry, ``signed_by`` matches). Outcome:
   ``STRUCTURE_VERIFIED`` — deliberately not named ``verified``,
   because it asserts shape and registry membership, never provenance.

The five-state outcome (verified / structure_verified / unsigned /
invalid / unknown_publisher) is stable; callers branch on status
strings and never need to know which tier produced them.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from dataclasses import dataclass
from enum import Enum
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519

from app.core.publishers import is_verified_publisher, publisher_signing_key


class SignatureStatus(str, Enum):
    """Possible outcomes of ``verify_manifest_signature``."""

    VERIFIED = "verified"
    STRUCTURE_VERIFIED = "structure_verified"
    UNSIGNED = "unsigned"
    INVALID = "invalid"
    UNKNOWN_PUBLISHER = "unknown_publisher"


@dataclass(frozen=True)
class SignatureResult:
    """Outcome of a signature check.

    Trust ceremony branches on ``status``:
    - ``verified`` / ``structure_verified`` → fast path (3 steps)
    - everything else → full path (7 steps)
    """

    status: SignatureStatus
    publisher: str | None
    signed_by: str | None
    notes: str = ""


# Fields stripped from the manifest before hashing, so the signature
# is computed over the *unsigned* canonical content. Must match the
# signer (scripts/sign_manifest.py).
SIGNATURE_FIELDS = ("signature", "signed_by")


def compute_manifest_hash(manifest: dict[str, Any]) -> str:
    """Stable canonical-JSON SHA-256 hash of a manifest.

    Used for: (a) detecting tampering between install time and
    invocation time, (b) ed25519 signing input, (c) audit row
    provenance.

    Sorts keys recursively and uses compact separators so the same
    semantic content always hashes to the same digest regardless of
    serialiser whitespace or key ordering.
    """
    canonical = json.dumps(
        manifest, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def manifest_signing_digest(manifest: dict[str, Any]) -> bytes:
    """The exact bytes that get ed25519-signed for a manifest.

    Byte contract (must match ``scripts/sign_manifest.py``):

    1. Remove ``signature`` and ``signed_by`` from a copy of the
       manifest (top level only).
    2. Canonicalise: ``json.dumps(..., sort_keys=True,
       separators=(",", ":"))``, UTF-8 encoded.
    3. SHA-256 the canonical bytes.
    4. The ed25519 message is the **raw 32-byte digest**
       (``bytes.fromhex(compute_manifest_hash(unsigned))``), not the
       hex string and not the canonical JSON itself.
    """
    unsigned = {k: v for k, v in manifest.items() if k not in SIGNATURE_FIELDS}
    return bytes.fromhex(compute_manifest_hash(unsigned))


def _verify_ed25519(
    manifest: dict[str, Any],
    signature_b64: str,
    public_key_b64: str,
) -> tuple[bool, str]:
    """Verify an ed25519 manifest signature. Returns (ok, note)."""
    try:
        public_key_bytes = base64.b64decode(public_key_b64, validate=True)
        public_key = ed25519.Ed25519PublicKey.from_public_bytes(
            public_key_bytes
        )
    except (binascii.Error, ValueError) as exc:
        return False, f"registered publisher key is malformed: {exc}"
    try:
        signature_bytes = base64.b64decode(signature_b64, validate=True)
    except binascii.Error:
        return False, "signature is not valid base64"
    try:
        public_key.verify(signature_bytes, manifest_signing_digest(manifest))
    except InvalidSignature:
        return False, "ed25519 signature does not match manifest content"
    return True, "ed25519 signature verified against registered publisher key"


def verify_manifest_signature(
    manifest: dict[str, Any],
    *,
    signature: str | None = None,
) -> SignatureResult:
    """Verify a manifest's signature against the verified-publisher
    registry.

    The five outcomes:

    - ``UNSIGNED``: ``signature`` is None or empty. Manifest may still
      install via the unverified full-path ceremony with explicit
      user trust.
    - ``UNKNOWN_PUBLISHER``: the manifest's ``publisher`` field is not
      in ``app.core.publishers``. Same fallback as UNSIGNED.
    - ``INVALID``: ``signature`` is present but malformed, or
      ``signed_by`` doesn't match the publisher, or — when the
      publisher has a registered ed25519 key — the signature fails
      cryptographic verification over the manifest's signing digest
      (see ``manifest_signing_digest`` for the exact byte contract).
    - ``VERIFIED``: the publisher has a registered ed25519 public key
      and the manifest's base64 signature cryptographically verifies
      over the canonical manifest digest. This is real provenance:
      only the holder of the publisher's private key could have
      produced it.
    - ``STRUCTURE_VERIFIED``: the publisher has **no** registered key;
      the signature is present, structurally plausible, the publisher
      is in the registry, and ``signed_by`` matches. Shape only —
      a forged signature with correct shape still passes, which is
      why the status name says exactly what was checked.
    """
    publisher = manifest.get("publisher")
    signed_by = manifest.get("signed_by")

    if not isinstance(publisher, str) or not publisher:
        return SignatureResult(
            status=SignatureStatus.INVALID,
            publisher=None,
            signed_by=None,
            notes="manifest missing publisher field",
        )

    if signature is None and not manifest.get("signature"):
        return SignatureResult(
            status=SignatureStatus.UNSIGNED,
            publisher=publisher,
            signed_by=signed_by,
            notes="no signature on manifest",
        )

    # The signature can come from a separate arg (e.g. detached
    # signature file) or from the manifest's signature field.
    effective_signature = signature or manifest.get("signature")
    if not isinstance(effective_signature, str) or len(effective_signature) < 16:
        return SignatureResult(
            status=SignatureStatus.INVALID,
            publisher=publisher,
            signed_by=signed_by,
            notes="signature payload missing or too short",
        )

    if not is_verified_publisher(publisher):
        return SignatureResult(
            status=SignatureStatus.UNKNOWN_PUBLISHER,
            publisher=publisher,
            signed_by=signed_by,
            notes=(
                f"publisher {publisher!r} not in verified registry; "
                "install requires explicit user trust"
            ),
        )

    # signed_by must match the publisher when both are present.
    if signed_by is not None and signed_by != publisher:
        return SignatureResult(
            status=SignatureStatus.INVALID,
            publisher=publisher,
            signed_by=signed_by,
            notes=(
                f"signed_by {signed_by!r} does not match publisher "
                f"{publisher!r}"
            ),
        )

    # Cryptographic tier: publisher has a registered ed25519 key.
    public_key_b64 = publisher_signing_key(publisher)
    if public_key_b64 is not None:
        ok, note = _verify_ed25519(
            manifest, effective_signature, public_key_b64
        )
        return SignatureResult(
            status=SignatureStatus.VERIFIED if ok else SignatureStatus.INVALID,
            publisher=publisher,
            signed_by=signed_by or publisher,
            notes=note,
        )

    # Structural tier: no registered key, shape checks only.
    return SignatureResult(
        status=SignatureStatus.STRUCTURE_VERIFIED,
        publisher=publisher,
        signed_by=signed_by or publisher,
        notes=(
            "structural verification only; publisher has no registered "
            "ed25519 key"
        ),
    )


__all__ = [
    "SignatureStatus",
    "SignatureResult",
    "SIGNATURE_FIELDS",
    "compute_manifest_hash",
    "manifest_signing_digest",
    "verify_manifest_signature",
]
