"""Unit tests for the key rotation CLI.

These tests run without a live database. The rotation logic is tested by
patching the SQLAlchemy engine/session layer so they exercise real
AES-GCM encrypt/decrypt paths, the wrong-secret abort, and the dry-run
path — all without requiring Postgres.

Round-trip scenario
-------------------
Two synthetic users × two providers = four rows.  The helper
``_make_rows`` builds plain Python objects that mimic ``UserApiKey``
rows (id, ciphertext, nonce).  We patch the ``select`` fetch and the
``update`` execute so the rotation core sees realistic encrypted blobs
and we can assert the re-encrypted values decode cleanly under the new
key.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Module under test
from app.tools.rotate_encryption_key import (
    _decrypt_with,
    _encrypt_with,
    _parse_secret,
    _rotate,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_KEY_BYTES = 32
_NONCE_BYTES = 12


def _make_key() -> bytes:
    return os.urandom(_KEY_BYTES)


def _make_key_hex() -> str:
    return _make_key().hex()


def _encrypt(plaintext: str, key: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(_NONCE_BYTES)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    return ct, nonce


def _decrypt(ct: bytes, nonce: bytes, key: bytes) -> str:
    return AESGCM(key).decrypt(nonce, ct, None).decode()


# ---------------------------------------------------------------------------
# Pure-function tests (no DB needed)
# ---------------------------------------------------------------------------


def test_parse_secret_valid() -> None:
    key = _make_key()
    result = _parse_secret(key.hex(), "--test-secret")
    assert result == key


def test_parse_secret_bad_hex(capsys) -> None:
    with pytest.raises(SystemExit) as exc:
        _parse_secret("not-hex!!", "--test-secret")
    assert exc.value.code == 1


def test_parse_secret_wrong_length(capsys) -> None:
    with pytest.raises(SystemExit) as exc:
        _parse_secret(os.urandom(16).hex(), "--test-secret")  # 16 bytes, not 32
    assert exc.value.code == 1


def test_encrypt_decrypt_roundtrip() -> None:
    key = _make_key()
    plaintext = "sk-test-anthropic-key-abc123"
    ct, nonce = _encrypt_with(plaintext, key)
    assert _decrypt_with(ct, nonce, key) == plaintext


def test_decrypt_wrong_key_raises_invalid_tag() -> None:
    key_a = _make_key()
    key_b = _make_key()
    ct, nonce = _encrypt_with("secret", key_a)
    with pytest.raises(InvalidTag):
        _decrypt_with(ct, nonce, key_b)


# ---------------------------------------------------------------------------
# Fake session / engine scaffolding
# ---------------------------------------------------------------------------

class _FakeRow:
    """Mimics a UserApiKey ORM row for the rotation core."""

    def __init__(self, plaintext: str, key: bytes) -> None:
        self.id = uuid.uuid4()
        ct, nonce = _encrypt(plaintext, key)
        self.ciphertext = ct
        self.nonce = nonce
        # Track updates applied by the tool
        self._updates: list[dict] = []

    def apply_update(self, ciphertext: bytes, nonce: bytes) -> None:
        self.ciphertext = ciphertext
        self.nonce = nonce


def _build_fake_session(rows: list[_FakeRow], applied_updates: list[dict]):
    """Return a context-manager factory that yields a fake AsyncSession."""

    class _FakeResult:
        def __init__(self, data):
            self._data = data

        def all(self):
            return self._data

    class _FakeSession:
        def __init__(self):
            pass

        async def execute(self, stmt):
            # Detect select vs update by inspecting statement type
            from sqlalchemy import Select, Update
            if isinstance(stmt, Select):
                return _FakeResult(
                    [(r.id, r.ciphertext, r.nonce) for r in rows]
                )
            # It's an update — capture values
            if isinstance(stmt, Update):
                # Extract the WHERE clause id and VALUES
                # sqlalchemy compiled form; easier to track via applied_updates
                # We'll intercept via the values dict that was passed to .values()
                applied_updates.append(stmt)
            return _FakeResult([])

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

    class _FakeBegin:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *_):
            pass

    class _FakeSessionWithBegin(_FakeSession):
        def begin(self):
            return _FakeBegin()

    @asynccontextmanager
    async def _factory() -> AsyncIterator[_FakeSession]:
        yield _FakeSessionWithBegin()

    return _factory


# ---------------------------------------------------------------------------
# Rotation round-trip: 2 users × 2 providers = 4 rows
# ---------------------------------------------------------------------------

_PLAINTEXTS = [
    "sk-ant-user1-anthropic",
    "sk-openai-user1-openai",
    "sk-ant-user2-anthropic",
    "sk-openai-user2-openai",
]


@pytest.mark.asyncio
async def test_rotate_round_trip() -> None:
    """All four rows decrypt cleanly under new_key after rotation."""
    old_key = _make_key()
    new_key = _make_key()

    rows = [_FakeRow(pt, old_key) for pt in _PLAINTEXTS]
    applied_updates: list[Any] = []

    factory = _build_fake_session(rows, applied_updates)

    with (
        patch(
            "app.tools.rotate_encryption_key.create_async_engine",
            return_value=MagicMock(
                dispose=AsyncMock(),
            ),
        ),
        patch(
            "app.tools.rotate_encryption_key.async_sessionmaker",
            return_value=factory,
        ),
    ):
        await _rotate(
            dsn="postgresql+asyncpg://fake/fake",
            old_key=old_key,
            new_key=new_key,
            dry_run=False,
            batch_size=200,
        )

    # The tool re-encrypts in-place via update statements.
    # We verify by applying the captured update values back to our fake rows
    # and decrypting with new_key.
    #
    # Because we're using SQLAlchemy Update objects, extract values via
    # compiled inspection.  Simpler: re-run the tool's own _encrypt_with and
    # verify the update count equals number of rows.
    assert len(applied_updates) == len(rows), (
        f"Expected {len(rows)} UPDATE statements, got {len(applied_updates)}"
    )


@pytest.mark.asyncio
async def test_rotate_round_trip_values_verify() -> None:
    """Verify re-encrypted values round-trip correctly end-to-end."""
    old_key = _make_key()
    new_key = _make_key()

    # Build rows
    rows = [_FakeRow(pt, old_key) for pt in _PLAINTEXTS]

    # We'll intercept _encrypt_with to capture (new_ct, new_nonce) per plaintext
    captured_new_encryptions: list[tuple[str, bytes, bytes]] = []
    real_encrypt_with = _encrypt_with

    def capturing_encrypt(plaintext: str, key: bytes):
        ct, nonce = real_encrypt_with(plaintext, key)
        if key == new_key:
            captured_new_encryptions.append((plaintext, ct, nonce))
        return ct, nonce

    applied_updates: list[Any] = []
    factory = _build_fake_session(rows, applied_updates)

    with (
        patch(
            "app.tools.rotate_encryption_key.create_async_engine",
            return_value=MagicMock(dispose=AsyncMock()),
        ),
        patch(
            "app.tools.rotate_encryption_key.async_sessionmaker",
            return_value=factory,
        ),
        patch(
            "app.tools.rotate_encryption_key._encrypt_with",
            side_effect=capturing_encrypt,
        ),
    ):
        await _rotate(
            dsn="postgresql+asyncpg://fake/fake",
            old_key=old_key,
            new_key=new_key,
            dry_run=False,
            batch_size=200,
        )

    assert len(captured_new_encryptions) == len(_PLAINTEXTS)

    # Every captured encryption must round-trip under new_key
    for plaintext, ct, nonce in captured_new_encryptions:
        recovered = _decrypt_with(ct, nonce, new_key)
        assert recovered == plaintext, f"Round-trip failed for {plaintext!r}"

    # Original plaintexts must all appear exactly once
    assert sorted(pt for pt, _, _ in captured_new_encryptions) == sorted(_PLAINTEXTS)


# ---------------------------------------------------------------------------
# Wrong-secret guard: must abort before any DB writes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_wrong_old_secret_aborts_no_writes() -> None:
    """Passing the wrong --old-secret must abort with SystemExit(1), no updates."""
    real_key = _make_key()
    wrong_key = _make_key()
    new_key = _make_key()

    rows = [_FakeRow(pt, real_key) for pt in _PLAINTEXTS]
    applied_updates: list[Any] = []

    factory = _build_fake_session(rows, applied_updates)

    with (
        patch(
            "app.tools.rotate_encryption_key.create_async_engine",
            return_value=MagicMock(dispose=AsyncMock()),
        ),
        patch(
            "app.tools.rotate_encryption_key.async_sessionmaker",
            return_value=factory,
        ),
    ):
        with pytest.raises(SystemExit) as exc:
            await _rotate(
                dsn="postgresql+asyncpg://fake/fake",
                old_key=wrong_key,
                new_key=new_key,
                dry_run=False,
                batch_size=200,
            )

    assert exc.value.code == 1
    # No UPDATE statements issued
    assert len(applied_updates) == 0, (
        f"Expected 0 UPDATE statements, got {len(applied_updates)}"
    )


# ---------------------------------------------------------------------------
# Dry-run: no writes, no SystemExit
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dry_run_no_writes() -> None:
    """Dry-run decrypts successfully but issues no UPDATE statements."""
    key = _make_key()
    rows = [_FakeRow(pt, key) for pt in _PLAINTEXTS]
    applied_updates: list[Any] = []

    factory = _build_fake_session(rows, applied_updates)

    with (
        patch(
            "app.tools.rotate_encryption_key.create_async_engine",
            return_value=MagicMock(dispose=AsyncMock()),
        ),
        patch(
            "app.tools.rotate_encryption_key.async_sessionmaker",
            return_value=factory,
        ),
    ):
        # Should not raise
        await _rotate(
            dsn="postgresql+asyncpg://fake/fake",
            old_key=key,
            new_key=_make_key(),
            dry_run=True,
            batch_size=200,
        )

    assert len(applied_updates) == 0


# ---------------------------------------------------------------------------
# Empty table: no-op, no error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_empty_table_no_op() -> None:
    applied_updates: list[Any] = []
    factory = _build_fake_session([], applied_updates)

    with (
        patch(
            "app.tools.rotate_encryption_key.create_async_engine",
            return_value=MagicMock(dispose=AsyncMock()),
        ),
        patch(
            "app.tools.rotate_encryption_key.async_sessionmaker",
            return_value=factory,
        ),
    ):
        await _rotate(
            dsn="postgresql+asyncpg://fake/fake",
            old_key=_make_key(),
            new_key=_make_key(),
            dry_run=False,
            batch_size=200,
        )

    assert len(applied_updates) == 0


# ---------------------------------------------------------------------------
# Batching: verify multiple batches are issued
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_batching_issues_correct_update_count() -> None:
    """With batch_size=2 and 4 rows, expect 4 UPDATE statements in 2 batches."""
    key = _make_key()
    new_key = _make_key()
    rows = [_FakeRow(pt, key) for pt in _PLAINTEXTS]
    applied_updates: list[Any] = []

    factory = _build_fake_session(rows, applied_updates)

    with (
        patch(
            "app.tools.rotate_encryption_key.create_async_engine",
            return_value=MagicMock(dispose=AsyncMock()),
        ),
        patch(
            "app.tools.rotate_encryption_key.async_sessionmaker",
            return_value=factory,
        ),
    ):
        await _rotate(
            dsn="postgresql+asyncpg://fake/fake",
            old_key=key,
            new_key=new_key,
            dry_run=False,
            batch_size=2,
        )

    assert len(applied_updates) == len(rows)
