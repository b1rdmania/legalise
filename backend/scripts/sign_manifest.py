"""Publisher CLI — ed25519 manifest signing.

Real cryptographic counterpart to ``sign_example_module.py`` (the
structural placeholder). Two modes:

Generate a keypair::

    python -m scripts.sign_manifest --keygen --out priv.key
    # writes priv.key (base64 raw 32-byte private key, mode 0600)
    # prints the base64 raw 32-byte public key to stdout — register
    # it as ``ed25519_public_key`` on the publisher's entry in
    # app/core/publishers.py

Sign a manifest in place::

    python -m scripts.sign_manifest --sign module.json --key priv.key
    # embeds ``signature`` (base64 ed25519 signature) and
    # ``signed_by`` (= the manifest's publisher) into module.json

Byte contract (must match ``app.core.signing.manifest_signing_digest``):
the message signed is the raw 32-byte SHA-256 digest of the canonical
JSON (sorted keys, compact separators, UTF-8) of the manifest with the
top-level ``signature`` and ``signed_by`` fields removed. Re-signing
the same content with the same key is deterministic (ed25519 is), so
the script is idempotent and CI can diff for drift.

Dependencies: stdlib + the ``cryptography`` package only.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ed25519

from app.core.signing import SIGNATURE_FIELDS, manifest_signing_digest


def keygen(out_path: Path) -> str:
    """Generate an ed25519 keypair.

    Writes the base64 raw private key to ``out_path`` (mode 0600) and
    returns the base64 raw public key.
    """
    private_key = ed25519.Ed25519PrivateKey.generate()
    private_b64 = base64.b64encode(
        private_key.private_bytes_raw()
    ).decode("ascii")
    public_b64 = base64.b64encode(
        private_key.public_key().public_bytes_raw()
    ).decode("ascii")
    out_path.write_text(private_b64 + "\n", encoding="utf-8")
    out_path.chmod(0o600)
    return public_b64


def load_private_key(key_path: Path) -> ed25519.Ed25519PrivateKey:
    """Load a base64 raw 32-byte ed25519 private key from a file."""
    raw = base64.b64decode(key_path.read_text(encoding="utf-8").strip())
    return ed25519.Ed25519PrivateKey.from_private_bytes(raw)


def sign_manifest(manifest_path: Path, key_path: Path) -> dict:
    """Sign the manifest in place. Returns the updated manifest dict.

    Embeds ``signature`` = base64 ed25519 signature over the manifest
    signing digest, and ``signed_by`` = the manifest's ``publisher``.
    """
    if not manifest_path.exists():
        raise FileNotFoundError(manifest_path)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{manifest_path} is not valid JSON: {exc}") from exc
    publisher = manifest.get("publisher")
    if not isinstance(publisher, str) or not publisher:
        raise ValueError(f"{manifest_path} missing required 'publisher' field")

    private_key = load_private_key(key_path)

    # Strip prior signature fields so the digest is over the unsigned
    # canonical content (manifest_signing_digest does this too; the
    # explicit pop keeps the written file clean of stale fields).
    for field in SIGNATURE_FIELDS:
        manifest.pop(field, None)

    signature = private_key.sign(manifest_signing_digest(manifest))
    manifest["signature"] = base64.b64encode(signature).decode("ascii")
    manifest["signed_by"] = publisher

    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate ed25519 publisher keys and sign v2 module manifests."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--keygen",
        action="store_true",
        help="generate a keypair; write private key to --out, print public key",
    )
    mode.add_argument(
        "--sign",
        type=Path,
        metavar="MANIFEST",
        help="sign a manifest JSON file in place (requires --key)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("publisher.key"),
        help="private key output path for --keygen (default: publisher.key)",
    )
    parser.add_argument(
        "--key",
        type=Path,
        help="private key file (base64 raw 32 bytes) for --sign",
    )
    args = parser.parse_args(argv)

    try:
        if args.keygen:
            public_b64 = keygen(args.out)
            print(
                f"private key written to {args.out} (keep it out of the repo)",
                file=sys.stderr,
            )
            # Public key on stdout so it can be piped/captured.
            print(public_b64)
            return 0

        if args.key is None:
            parser.error("--sign requires --key")
        manifest = sign_manifest(args.sign, args.key)
        print(
            f"signed {args.sign} as publisher={manifest['publisher']!r} "
            f"signature={manifest['signature'][:16]}... (ed25519)",
            file=sys.stderr,
        )
        return 0
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
