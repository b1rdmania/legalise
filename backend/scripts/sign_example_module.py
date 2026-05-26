"""Phase 6 — example module signer (structural placeholder).

Reads a v2 manifest JSON file, computes its canonical hash with the
``signature`` and ``signed_by`` fields stripped, then writes the
manifest back with:

- ``signature`` = the canonical SHA-256 (hex) of the unsigned manifest
- ``signed_by`` = the manifest's ``publisher`` field

This satisfies Phase 3's structural verifier
(``app.core.signing.verify_manifest_signature``):
- signature is ≥16 chars: SHA-256 hex is 64 chars
- signed_by matches publisher
- publisher must be in the verified registry (Phase 3 hardcoded list)

Phase 11 swaps this CLI for real sigstore + Rekor signing. The
public surface — "the file has a stable signature that the verifier
accepts" — does not change.

Usage::

    python -m backend.scripts.sign_example_module \\
        examples/modules/contract-review/module.json

The script is idempotent: re-signing the same manifest produces the
same signature byte-for-byte. Useful for CI checks that confirm a
manifest hasn't drifted from its signed canonical form.
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path

from app.core.signing import compute_manifest_hash


_SIGNATURE_FIELDS = ("signature", "signed_by")


def sign_manifest(manifest_path: Path) -> dict:
    """Sign the manifest in place. Returns the updated manifest dict.

    Raises ``FileNotFoundError`` if ``manifest_path`` doesn't exist,
    ``ValueError`` if the file is not valid JSON or lacks a
    ``publisher`` field.
    """
    if not manifest_path.exists():
        raise FileNotFoundError(manifest_path)
    raw = manifest_path.read_text(encoding="utf-8")
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{manifest_path} is not valid JSON: {exc}"
        ) from exc
    publisher = manifest.get("publisher")
    if not isinstance(publisher, str) or not publisher:
        raise ValueError(
            f"{manifest_path} missing required 'publisher' field"
        )

    # Strip signature fields so the hash is over the unsigned canonical
    # content. Without this, re-signing would mix the previous signature
    # into the new hash and break idempotence.
    unsigned = deepcopy(manifest)
    for field in _SIGNATURE_FIELDS:
        unsigned.pop(field, None)

    digest = compute_manifest_hash(unsigned)
    manifest["signature"] = digest
    manifest["signed_by"] = publisher

    # Write back with stable formatting so the file diff is minimal
    # on every re-sign.
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Sign a v2 module manifest in place (structural placeholder)."
    )
    parser.add_argument("manifest", type=Path, help="Path to module.json")
    args = parser.parse_args(argv)
    try:
        manifest = sign_manifest(args.manifest)
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"signed {args.manifest} as publisher={manifest['publisher']!r} "
        f"signature={manifest['signature'][:16]}...",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
