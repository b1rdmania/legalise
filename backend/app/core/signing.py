"""Manifest signature verification.

A *structural* signature verifier — the trust ceremony gets a clean
four-state outcome (verified / unsigned / invalid / unknown_publisher)
without depending on the sigstore Python library or a real signing
pipeline. Real cryptographic chain verification (sigstore Rekor lookup
+ X.509 chain + OIDC identity claim) is sigstore-hardening backlog;
the API contract here is designed so the verifier implementation can
swap without touching callers.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from enum import Enum
from typing import Any

from app.core.publishers import is_verified_publisher


class SignatureStatus(str, Enum):
    """Possible outcomes of ``verify_manifest_signature``."""

    VERIFIED = "verified"
    UNSIGNED = "unsigned"
    INVALID = "invalid"
    UNKNOWN_PUBLISHER = "unknown_publisher"


@dataclass(frozen=True)
class SignatureResult:
    """Outcome of a signature check.

    Trust ceremony branches on ``status``:
    - ``verified`` → fast path (3 steps)
    - everything else → full path (7 steps)
    """

    status: SignatureStatus
    publisher: str | None
    signed_by: str | None
    notes: str = ""


def compute_manifest_hash(manifest: dict[str, Any]) -> str:
    """Stable canonical-JSON SHA-256 hash of a manifest.

    Used for: (a) detecting tampering between install time and
    invocation time, (b) sigstore signing input, (c) audit row
    provenance.

    Sorts keys recursively and uses compact separators so the same
    semantic content always hashes to the same digest regardless of
    serialiser whitespace or key ordering.
    """
    canonical = json.dumps(
        manifest, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def verify_manifest_signature(
    manifest: dict[str, Any],
    *,
    signature: str | None = None,
) -> SignatureResult:
    """Verify a manifest's signature against the verified-publisher
    registry.

    Current implementation is structural — it does not perform real
    cryptographic verification. The four outcomes:

    - ``UNSIGNED``: ``signature`` is None or empty. Manifest may still
      install via the unverified full-path ceremony with explicit
      user trust.
    - ``UNKNOWN_PUBLISHER``: the manifest's ``publisher`` field is not
      in ``app.core.publishers``. Same fallback as UNSIGNED.
    - ``INVALID``: ``signature`` is present but malformed (not a
      hex/base64 string of plausible length, or ``signed_by`` doesn't
      match the publisher).
    - ``VERIFIED``: ``signature`` is present, structurally valid, the
      publisher is verified, and ``signed_by`` matches.

    Note: this does NOT verify cryptographic provenance. A
    publisher-key mismatch returns INVALID; a forged signature with
    correct shape returns VERIFIED. Real verification via the
    sigstore Rekor transparency log lands with sigstore hardening.
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

    # Structural pass.
    # TODO(sigstore-hardening): wire sigstore Rekor lookup + X.509 chain
    # verification + OIDC identity claim check here. Until then this is
    # a structural verifier only; a forged signature with the correct
    # shape would pass.
    return SignatureResult(
        status=SignatureStatus.VERIFIED,
        publisher=publisher,
        signed_by=signed_by or publisher,
        notes="structural verification only; cryptographic check is sigstore-hardening backlog",
    )


__all__ = [
    "SignatureStatus",
    "SignatureResult",
    "compute_manifest_hash",
    "verify_manifest_signature",
]
