"""AES-256-GCM encryption for per-user provider API keys.

Master key comes from `LEGALISE_KEY_ENCRYPTION_SECRET` (32-byte hex).
In production, missing master key causes the app to refuse to boot
(`assert_master_key_present`). In dev, a process-lifetime random key is
generated so signups still work for throwaway testing — but anything
encrypted under that key won't decrypt after a restart.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_DEV_ENVIRONMENTS = {"development", "dev", "local"}

DEFAULT_SESSION_SECRET = "change-me-in-deployment"


def assert_auth_secrets_present() -> None:
    """Production startup invariant for session security and email delivery.

    Refuses to boot in non-dev environments when any of:
    - SESSION_SECRET is missing or the placeholder default
    - session_cookie_secure is False (cookies would ride unencrypted)
    - RESEND_API_KEY is missing (verification + reset emails would
      silently fail, leaving unverified accounts that can't log in)

    Dev environments are exempt — local http, the placeholder secret,
    and the dev-log email fallback are acceptable for development.
    Production deploys MUST set `SESSION_SECRET` (non-default),
    `SESSION_COOKIE_SECURE=true`, and `RESEND_API_KEY`.
    """
    if settings.environment in _DEV_ENVIRONMENTS:
        return
    bad: list[str] = []
    if not settings.session_secret or settings.session_secret == DEFAULT_SESSION_SECRET:
        bad.append("SESSION_SECRET must be set to a non-default value in production")
    if not settings.session_cookie_secure:
        bad.append("SESSION_COOKIE_SECURE must be true in production")
    if not settings.resend_api_key:
        bad.append("RESEND_API_KEY must be set in production for verify + reset emails")
    if bad:
        raise RuntimeError(
            "Production startup blocked — fix the following and redeploy:\n  - "
            + "\n  - ".join(bad)
        )
_NONCE_BYTES = 12  # 96-bit GCM nonce
_KEY_BYTES = 32  # AES-256


_master_key: bytes | None = None


def assert_master_key_present() -> None:
    """Resolve and cache the master key. Called from app lifespan startup.

    Production: refuse to boot if the master key is missing/empty.
    Dev: generate a process-lifetime random key with a loud warning.
    """
    global _master_key
    raw = settings.key_encryption_secret
    env = settings.environment

    if raw:
        try:
            key = bytes.fromhex(raw)
        except ValueError as exc:
            raise RuntimeError(
                "LEGALISE_KEY_ENCRYPTION_SECRET is set but not valid hex (expect 64 hex chars)"
            ) from exc
        if len(key) != _KEY_BYTES:
            raise RuntimeError(
                f"LEGALISE_KEY_ENCRYPTION_SECRET is {len(key)} bytes; expected {_KEY_BYTES}"
            )
        _master_key = key
        return

    if env in _DEV_ENVIRONMENTS:
        _master_key = secrets.token_bytes(_KEY_BYTES)
        # Surface loudly; this is a real correctness landmine in dev too.
        print(
            "[encryption] WARNING: LEGALISE_KEY_ENCRYPTION_SECRET not set. "
            "Using a random per-process key. Previously-stored user keys will not decrypt.",
            flush=True,
        )
        return

    raise RuntimeError(
        "LEGALISE_KEY_ENCRYPTION_SECRET is required in production "
        f"(ENVIRONMENT={env!r}). Refusing to boot."
    )


def _key() -> bytes:
    if _master_key is None:
        # Lazy resolve for tests / scripts that import without going through lifespan.
        assert_master_key_present()
    assert _master_key is not None
    return _master_key


@dataclass(frozen=True)
class Encrypted:
    ciphertext: bytes
    nonce: bytes


def encrypt(plaintext: str) -> Encrypted:
    """AES-GCM encrypt with a fresh random nonce."""
    nonce = os.urandom(_NONCE_BYTES)
    cipher = AESGCM(_key())
    ct = cipher.encrypt(nonce, plaintext.encode("utf-8"), associated_data=None)
    return Encrypted(ciphertext=ct, nonce=nonce)


def decrypt(ciphertext: bytes, nonce: bytes) -> str:
    cipher = AESGCM(_key())
    pt = cipher.decrypt(nonce, ciphertext, associated_data=None)
    return pt.decode("utf-8")
