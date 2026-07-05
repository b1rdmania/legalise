"""Verified publisher registry.

Modules in the v2 catalogue declare a ``publisher`` string. The trust
ceremony reads this registry when checking signatures. The 3-step
fast path requires a signature that cryptographically verifies against
the publisher's registered ed25519 key; registry membership alone (no
key) only reaches STRUCTURE_VERIFIED and takes the full 7-step path.

Ships a hardcoded in-memory registry. May move to a DB-backed
config so workspace admins can verify their firm's own publisher id.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PublisherInfo:
    """Public-facing info about a verified publisher.

    The trust ceremony renders this to the user when deciding whether
    to take the fast path. ``trust_root`` documents how the publisher
    is verified (e.g. ``"github_org:legalise"`` means trust derives
    from membership in the GitHub org).
    """

    publisher_id: str
    display_name: str
    trust_root: str
    notes: str = ""
    # Optional ed25519 public key: base64-encoded raw 32-byte key.
    # When present, ``verify_manifest_signature`` upgrades from
    # structural checking to real cryptographic verification for this
    # publisher's manifests. None keeps the structural-only path.
    ed25519_public_key: str | None = None


# First-party + dev/test publishers. Hardcoded for now.
#
# May move to DB-backed. When sigstore signing lands, the
# trust_root wires to sigstore identity claims (e.g.
# ``OIDC:github:legalise``).
_VERIFIED: dict[str, PublisherInfo] = {
    "legalise": PublisherInfo(
        publisher_id="legalise",
        display_name="Legalise (first-party)",
        trust_root="github_org:b1rdmania/legalise",
        notes=(
            "First-party publisher. All modules under this id are "
            "shipped from the legalise repo and (once sigstore lands) "
            "signed by the legalise release pipeline."
        ),
    ),
    "example": PublisherInfo(
        publisher_id="example",
        display_name="Examples (dev/test)",
        trust_root="repo:examples/modules",
        notes=(
            "Reserved for modules under examples/modules/. Marked "
            "verified so dev/test workflows take the fast path."
        ),
    ),
}


def is_verified_publisher(publisher_id: str) -> bool:
    """True if the publisher is in the verified registry."""
    return publisher_id in _VERIFIED


def publisher_signing_key(publisher_id: str) -> str | None:
    """Base64 raw ed25519 public key for a publisher, or None.

    None means the publisher has no registered signing key and its
    manifests can only reach STRUCTURE_VERIFIED, never VERIFIED.
    """
    info = _VERIFIED.get(publisher_id)
    return info.ed25519_public_key if info else None


def publisher_info(publisher_id: str) -> PublisherInfo | None:
    """Return the PublisherInfo for a verified publisher, or None."""
    return _VERIFIED.get(publisher_id)


def all_verified_publishers() -> list[PublisherInfo]:
    """Stable list of all verified publishers for catalogue + admin UI."""
    return sorted(_VERIFIED.values(), key=lambda p: p.publisher_id)


__all__ = [
    "PublisherInfo",
    "is_verified_publisher",
    "publisher_signing_key",
    "publisher_info",
    "all_verified_publishers",
]
