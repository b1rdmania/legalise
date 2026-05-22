"""Key rotation CLI — real-DB smoke test.

Proves that `_rotate()` correctly re-encrypts all `user_api_keys` rows
from an old master secret to a new master secret against actual Postgres
and the actual AES-GCM helpers in `app.core.encryption`.

Skips cleanly when Postgres is unreachable (same `_probe_dsn` guard used
by other smoke tests in this suite).

Round-trip scenario
-------------------
Two synthetic users × two providers = four rows.  We:
1. Seed rows encrypted under `secret_old` using the real encryption helpers.
2. Call `_rotate()` (no subprocess, no mocks below `os.environ`).
3. Switch the encryption module to `secret_new`.
4. Decrypt every row and assert the plaintext is the original fake key.
5. Bonus: confirm `secret_old` no longer decrypts any row (InvalidTag).
"""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# Reuse the conftest helpers for skip-if-no-postgres
# ---------------------------------------------------------------------------

from tests.conftest import TEST_DSN, _probe_dsn

# ---------------------------------------------------------------------------
# Subjects under test
# ---------------------------------------------------------------------------

from app.tools.rotate_encryption_key import _rotate
import app.core.encryption as _enc_module

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_KEYS = {
    ("user1", "anthropic"): "sk-ant-test-user1",
    ("user1", "openai"):    "sk-openai-test-user1",
    ("user2", "anthropic"): "sk-ant-test-user2",
    ("user2", "openai"):    "sk-openai-test-user2",
}


def _make_secret_hex() -> str:
    """Generate a fresh 32-byte (64 hex-char) master secret."""
    return os.urandom(32).hex()


def _force_master_key(hex_secret: str) -> None:
    """Bypass the lazy resolver and inject a master key directly into the
    encryption module's global.  Resets the cached `_master_key` so the
    next call to `encrypt()` / `decrypt()` uses the supplied key."""
    _enc_module._master_key = bytes.fromhex(hex_secret)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def _smoke_engine():
    """Dedicated engine for the smoke; disposed after the test."""
    if not _probe_dsn(TEST_DSN):
        pytest.skip(
            f"DB-backed smoke skipped: {TEST_DSN} unreachable. "
            "Run inside the backend container; see conftest.py docstring."
        )
    eng = create_async_engine(TEST_DSN, echo=False, future=True)
    try:
        yield eng
    finally:
        await eng.dispose()


# ---------------------------------------------------------------------------
# The smoke test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_key_rotation_real_db_round_trip(_smoke_engine) -> None:
    """Full round-trip: seed → rotate → verify → confirm old key is dead."""
    from app.models.user import User, UserApiKey

    secret_old = _make_secret_hex()
    secret_new = _make_secret_hex()

    factory = async_sessionmaker(
        _smoke_engine, class_=AsyncSession, expire_on_commit=False
    )

    # ------------------------------------------------------------------
    # 1. Create two synthetic users and four user_api_keys rows,
    #    encrypted under secret_old.
    # ------------------------------------------------------------------
    _force_master_key(secret_old)

    user_ids: dict[str, uuid.UUID] = {}

    async with factory() as session:
        async with session.begin():
            for label in ("user1", "user2"):
                u = User(
                    id=uuid.uuid4(),
                    email=f"smoke-keyrot-{label}-{uuid.uuid4().hex[:8]}@example.com",
                    hashed_password="$2b$12$notarealhashjustforsmoke",
                    is_active=True,
                    is_superuser=False,
                    is_verified=True,
                    name=f"Smoke {label}",
                    role="solicitor",
                )
                session.add(u)
                user_ids[label] = u.id

            for (label, provider), plaintext in _FAKE_KEYS.items():
                from app.core.encryption import encrypt
                enc = encrypt(plaintext)
                row = UserApiKey(
                    user_id=user_ids[label],
                    provider=provider,
                    ciphertext=enc.ciphertext,
                    nonce=enc.nonce,
                )
                session.add(row)

    # ------------------------------------------------------------------
    # 2. Invoke the CLI's rotation logic directly against the test DB.
    #    No mocks — this hits real Postgres with real SQLAlchemy.
    # ------------------------------------------------------------------
    await _rotate(
        dsn=TEST_DSN,
        old_key=bytes.fromhex(secret_old),
        new_key=bytes.fromhex(secret_new),
        dry_run=False,
        batch_size=200,
    )

    # ------------------------------------------------------------------
    # 3. Switch the encryption module to secret_new.
    # ------------------------------------------------------------------
    _force_master_key(secret_new)

    # ------------------------------------------------------------------
    # 4. Re-read every row and assert the plaintext matches the original.
    # ------------------------------------------------------------------
    from sqlalchemy import select
    from app.core.encryption import decrypt

    async with factory() as session:
        result = await session.execute(
            select(UserApiKey).where(
                UserApiKey.user_id.in_(user_ids.values())
            )
        )
        rows = result.scalars().all()

    assert len(rows) == 4, f"Expected 4 rows, found {len(rows)}"

    recovered: dict[tuple[str, str], str] = {}
    for row in rows:
        label = next(lbl for lbl, uid in user_ids.items() if uid == row.user_id)
        plaintext = decrypt(row.ciphertext, row.nonce)
        recovered[(label, row.provider)] = plaintext

    for (label, provider), expected in _FAKE_KEYS.items():
        got = recovered.get((label, provider))
        assert got == expected, (
            f"Row ({label}, {provider}): expected {expected!r}, got {got!r}"
        )

    # ------------------------------------------------------------------
    # 5. Bonus: confirm secret_old can no longer decrypt any row.
    # ------------------------------------------------------------------
    old_key_bytes = bytes.fromhex(secret_old)
    cipher_old = AESGCM(old_key_bytes)
    for row in rows:
        with pytest.raises(InvalidTag):
            cipher_old.decrypt(row.nonce, row.ciphertext, None)

    # ------------------------------------------------------------------
    # 6. Teardown: remove the rows we inserted so the test is isolated.
    #    (The outer transaction rollback approach from conftest doesn't
    #    apply here because _rotate() creates its own engine+sessions and
    #    commits independently, so we clean up explicitly.)
    # ------------------------------------------------------------------
    from sqlalchemy import delete

    async with factory() as session:
        async with session.begin():
            await session.execute(
                delete(UserApiKey).where(
                    UserApiKey.user_id.in_(user_ids.values())
                )
            )
            await session.execute(
                delete(User).where(User.id.in_(user_ids.values()))
            )
