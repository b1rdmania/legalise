"""Per-user provider API key resolution.

Looks up the `UserApiKey` row for `(user_id, provider)`, decrypts it,
and returns the plaintext. Plaintext lives in memory for the duration
of one model call — never logged, never serialised.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt, encrypt
from app.models import UserApiKey


class ProviderKeyMissing(RuntimeError):
    """Raised by the gateway when the calling user has no key for the
    chosen provider and the server-key fallback isn't permitted."""

    def __init__(self, provider: str):
        self.provider = provider
        super().__init__(
            f"Add a {provider} API key in Settings → API Keys to run this call."
        )


async def get_user_provider_key(
    session: AsyncSession, user_id: uuid.UUID, provider: str
) -> str | None:
    """Decrypt and return the plaintext key for `(user_id, provider)`."""
    row = await session.execute(
        select(UserApiKey.ciphertext, UserApiKey.nonce).where(
            UserApiKey.user_id == user_id, UserApiKey.provider == provider
        )
    )
    record = row.first()
    if record is None:
        return None
    ct, nonce = record
    return decrypt(ct, nonce)


async def mark_user_key_used(
    session: AsyncSession, user_id: uuid.UUID, provider: str
) -> None:
    await session.execute(
        update(UserApiKey)
        .where(UserApiKey.user_id == user_id, UserApiKey.provider == provider)
        .values(last_used_at=datetime.now(timezone.utc))
    )


async def upsert_user_provider_key(
    session: AsyncSession, user_id: uuid.UUID, provider: str, plaintext: str
) -> UserApiKey:
    """Insert or replace the user's key for this provider. Plaintext is
    encrypted before any DB write. Returns the row."""
    enc = encrypt(plaintext)
    existing = await session.scalar(
        select(UserApiKey).where(
            UserApiKey.user_id == user_id, UserApiKey.provider == provider
        )
    )
    if existing is not None:
        existing.ciphertext = enc.ciphertext
        existing.nonce = enc.nonce
        existing.last_used_at = None
        return existing
    row = UserApiKey(
        user_id=user_id,
        provider=provider,
        ciphertext=enc.ciphertext,
        nonce=enc.nonce,
    )
    session.add(row)
    await session.flush()
    return row
