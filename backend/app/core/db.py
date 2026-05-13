"""Database session dependency.

The async engine and session factory are created in `main.lifespan` and stored
on `app.state`. This dependency yields a session bound to the active request.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory = request.app.state.session_factory
    async with factory() as session:
        yield session
