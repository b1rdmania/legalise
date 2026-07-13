"""Magic-link (passwordless email) sign-in.

Self-issued signed JWT, the same mechanism fastapi-users uses internally
for its own verification/reset tokens and OAuth state
(`generate_jwt`/`decode_jwt` from `fastapi_users.jwt`) — no DB row, no
extra table, no expiry sweep job. See ADR-012.

Unlike password verification, which only proves an EXISTING unverified
account's email, a magic link can also CREATE the account: clicking the
link is itself the ownership proof, so there is no separate "verify,
then set a password" round-trip. The creation path lives in
`app/api/magic_link.py`, deliberately NOT reusing `UserManager.create()`
— that method unconditionally sends its own verification email via
`on_after_register` in production, which would double-email a user who
just proved ownership by clicking this link.
"""

from __future__ import annotations

import jwt as _pyjwt
from fastapi_users.jwt import decode_jwt, generate_jwt

from app.core.config import settings

MAGIC_LINK_AUDIENCE = "legalise:magic-link"
# Tighter than the 1-hour password-reset token: a magic link both logs in
# and can create an account, so a shorter window limits the blast radius
# of a leaked link (forwarded email, shared inbox, etc).
MAGIC_LINK_LIFETIME_SECONDS = 15 * 60


class InvalidMagicLinkToken(Exception):
    """Expired, tampered, wrong-audience, or malformed token."""


def generate_magic_link_token(email: str) -> str:
    return generate_jwt(
        {"email": email, "aud": MAGIC_LINK_AUDIENCE},
        settings.session_secret,
        MAGIC_LINK_LIFETIME_SECONDS,
    )


def decode_magic_link_token(token: str) -> str:
    """Returns the email the token was issued for."""
    try:
        payload = decode_jwt(token, settings.session_secret, audience=[MAGIC_LINK_AUDIENCE])
    except _pyjwt.PyJWTError as exc:
        raise InvalidMagicLinkToken(str(exc)) from exc
    email = payload.get("email")
    if not email:
        raise InvalidMagicLinkToken("token missing email claim")
    return str(email)
