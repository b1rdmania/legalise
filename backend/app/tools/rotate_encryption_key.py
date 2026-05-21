"""Key rotation CLI for LEGALISE_KEY_ENCRYPTION_SECRET.

Re-encrypts every row in ``user_api_keys`` from an old master key to a
new master key. Designed to be run by an operator from inside the backend
container (or any host with DB access and the correct env vars / flags).

Usage
-----
::

    python -m app.tools.rotate_encryption_key \\
        --old-secret <64-hex-chars> \\
        --new-secret <64-hex-chars> \\
        [--dry-run] \\
        [--batch-size N]

Arguments
---------
--old-secret BASE64
    The current master key as 64 lowercase hex characters (32 bytes).
    All rows are first decrypted with this key. If **any** row fails to
    decrypt the run aborts immediately with no DB writes.

--new-secret BASE64
    The replacement master key, same format. All rows are re-encrypted
    under this key and written atomically per batch.

--dry-run
    Decrypts every row with the old secret, counts them, reports what
    would be rotated. Performs no writes whatsoever.

--batch-size N (default: 200)
    Number of rows processed per database transaction. Each batch commits
    independently; if the run is interrupted mid-way you can re-run with
    the same flags — rows already rotated under the new key will fail to
    decrypt with the old key and the tool will abort. To resume safely,
    pass the new secret as ``--old-secret`` and a fresh secret as
    ``--new-secret`` for the remaining rows, OR restore from backup and
    re-run the full rotation.

Safety guarantees
-----------------
- Wrong old secret: the tool decrypts all rows in a preflight pass
  before any write. If *any* row raises ``InvalidTag`` the run aborts
  with a non-zero exit code and writes nothing.
- Per-batch atomicity: each batch is committed inside its own
  transaction. A crash between batches leaves already-rotated rows under
  the new key (see resume note above).
- No new dependencies: uses only ``cryptography`` which is already in
  pyproject.toml.

Example (production)
--------------------
::

    # 1. Generate a new secret
    python -c "import secrets; print(secrets.token_bytes(32).hex())"

    # 2. Rotate (dry-run first)
    python -m app.tools.rotate_encryption_key \\
        --old-secret $OLD \\
        --new-secret $NEW \\
        --dry-run

    # 3. Rotate for real
    python -m app.tools.rotate_encryption_key \\
        --old-secret $OLD \\
        --new-secret $NEW

    # 4. Update LEGALISE_KEY_ENCRYPTION_SECRET to $NEW and redeploy.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_NONCE_BYTES = 12
_KEY_BYTES = 32


def _parse_secret(value: str, name: str) -> bytes:
    """Parse a 64-hex-char master key, raise SystemExit on bad input."""
    try:
        key = bytes.fromhex(value)
    except ValueError:
        print(f"[rotate] ERROR: {name} is not valid hex", file=sys.stderr)
        sys.exit(1)
    if len(key) != _KEY_BYTES:
        print(
            f"[rotate] ERROR: {name} decoded to {len(key)} bytes; expected {_KEY_BYTES}",
            file=sys.stderr,
        )
        sys.exit(1)
    return key


def _decrypt_with(ciphertext: bytes, nonce: bytes, key: bytes) -> str:
    """AES-GCM decrypt. Raises InvalidTag on wrong key."""
    cipher = AESGCM(key)
    pt = cipher.decrypt(nonce, ciphertext, associated_data=None)
    return pt.decode("utf-8")


def _encrypt_with(plaintext: str, key: bytes) -> tuple[bytes, bytes]:
    """AES-GCM encrypt. Returns (ciphertext, nonce)."""
    nonce = os.urandom(_NONCE_BYTES)
    cipher = AESGCM(key)
    ct = cipher.encrypt(nonce, plaintext.encode("utf-8"), associated_data=None)
    return ct, nonce


async def _rotate(
    dsn: str,
    old_key: bytes,
    new_key: bytes,
    dry_run: bool,
    batch_size: int,
) -> None:
    """Core rotation logic. Raises SystemExit on any failure."""
    from app.models.user import UserApiKey  # import here to avoid circular at module level

    engine = create_async_engine(dsn, echo=False, future=True)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        # ------------------------------------------------------------------
        # Preflight: load all rows and verify every one decrypts with old key
        # ------------------------------------------------------------------
        async with factory() as session:
            result = await session.execute(
                select(UserApiKey.id, UserApiKey.ciphertext, UserApiKey.nonce)
            )
            rows = result.all()

        if not rows:
            print("[rotate] No rows in user_api_keys. Nothing to do.")
            return

        print(f"[rotate] Found {len(rows)} rows.")

        plaintexts: list[tuple] = []  # (id, plaintext)
        for row_id, ct, nonce in rows:
            try:
                pt = _decrypt_with(ct, nonce, old_key)
            except InvalidTag:
                print(
                    f"[rotate] ERROR: row {row_id} failed to decrypt with --old-secret. "
                    "Aborting — no writes made.",
                    file=sys.stderr,
                )
                sys.exit(1)
            plaintexts.append((row_id, pt))

        print(f"[rotate] Preflight OK — all {len(plaintexts)} rows decrypt with old secret.")

        if dry_run:
            print(f"[rotate] DRY-RUN: would re-encrypt {len(plaintexts)} rows. No writes made.")
            return

        # ------------------------------------------------------------------
        # Rotate in batches, each batch its own transaction
        # ------------------------------------------------------------------
        total = len(plaintexts)
        rotated = 0
        for offset in range(0, total, batch_size):
            chunk = plaintexts[offset : offset + batch_size]
            async with factory() as session:
                async with session.begin():
                    for row_id, pt in chunk:
                        new_ct, new_nonce = _encrypt_with(pt, new_key)
                        await session.execute(
                            update(UserApiKey)
                            .where(UserApiKey.id == row_id)
                            .values(ciphertext=new_ct, nonce=new_nonce)
                        )
            rotated += len(chunk)
            print(f"[rotate] Rotated {rotated}/{total} rows.")

        print(f"[rotate] Done. {total} rows re-encrypted under new secret.")
        print("[rotate] Update LEGALISE_KEY_ENCRYPTION_SECRET to the new value and redeploy.")

    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rotate LEGALISE_KEY_ENCRYPTION_SECRET across all user_api_keys rows."
    )
    parser.add_argument(
        "--old-secret",
        required=True,
        metavar="HEX",
        help="Current master key as 64 hex characters (32 bytes).",
    )
    parser.add_argument(
        "--new-secret",
        required=True,
        metavar="HEX",
        help="New master key as 64 hex characters (32 bytes).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Report what would happen; perform no writes.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        metavar="N",
        help="Rows per database transaction (default: 200).",
    )

    args = parser.parse_args()

    old_key = _parse_secret(args.old_secret, "--old-secret")
    new_key = _parse_secret(args.new_secret, "--new-secret")

    dsn = os.environ.get(
        "POSTGRES_DSN",
        "postgresql+asyncpg://legalise:legalise@db:5432/legalise",
    )

    asyncio.run(
        _rotate(
            dsn=dsn,
            old_key=old_key,
            new_key=new_key,
            dry_run=args.dry_run,
            batch_size=args.batch_size,
        )
    )


if __name__ == "__main__":
    main()
