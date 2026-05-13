"""Auth stub.

v0.1 ships a single hardcoded solicitor user. The user row is upserted at app
startup so foreign keys hold. Real session-based auth (WorkOS/Stytch) lands
v0.2 — at which point `current_user` becomes the single integration point.
"""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models import User


STUB_USER_EMAIL = "jasmine.solicitor@birdlegal.co.uk"
STUB_USER_NAME = "Jasmine K."
STUB_USER_ROLE = "solicitor"


async def ensure_stub_user(session: AsyncSession) -> User:
    """Create the stub solicitor user if absent. Returns the row."""
    user = await session.scalar(select(User).where(User.email == STUB_USER_EMAIL))
    if user is None:
        user = User(
            email=STUB_USER_EMAIL,
            name=STUB_USER_NAME,
            role=STUB_USER_ROLE,
        )
        session.add(user)
        await session.flush()
    return user


async def current_user(session: AsyncSession = Depends(get_session)) -> User:
    """FastAPI dependency: returns the active user.

    v0.1: always the hardcoded solicitor. v0.2 will read a signed session cookie.
    """
    return await ensure_stub_user(session)
