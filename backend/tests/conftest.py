"""Shared fixtures for tests.

Existing stub-based tests do not touch DB-backed fixtures and continue
to run anywhere `pytest` is installed.

DB-backed fixtures (`engine`, `db_connection`, `db_session`, `client`)
require a Postgres reachable at `TEST_DATABASE_URL`. The default URL
points at the dev docker-compose `db` service on its container
network, so tests must run inside the backend container:

    docker compose -f infra/docker-compose.yml exec -T \\
      -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \\
      backend python -m pytest -x

The schema is provisioned once via:

    docker compose -f infra/docker-compose.yml exec -T \\
      -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \\
      backend python -m alembic upgrade head

Each DB-using test runs inside an outer transaction that rolls back at
teardown. The TestClient overrides `get_session` to yield sessions
joined to that outer transaction via SAVEPOINT, so every request inside
a test sees uncommitted setup data and every write is reverted after.
"""

from __future__ import annotations

import os
import socket
from collections.abc import AsyncIterator
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


TEST_DSN = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://legalise:legalise@db:5432/legalise_test",
)


def _probe_dsn(dsn: str) -> bool:
    parsed = urlparse(dsn.replace("+asyncpg", "").replace("+psycopg", ""))
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


@pytest.fixture(autouse=True)
def _firm_role_gates_enforced_in_tests(monkeypatch):
    """Phase 17.5: production defaults firm role gates to DORMANT
    (``LEGALISE_FIRM_ROLE_GATES_ENABLED=false``), but the suite asserts
    firm-mode (enforced) behaviour throughout — B_mixed requires
    qualified_solicitor, advice tiers enforce roles, etc. Default every
    test to enforced so that existing coverage keeps proving the
    law-firm policy; dormant-specific tests override
    ``settings.firm_role_gates_enabled`` to False explicitly.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "firm_role_gates_enabled", True, raising=False)


@pytest_asyncio.fixture
async def engine():
    """Function-scoped on purpose. pytest-asyncio uses a per-test event
    loop by default; a session-scoped engine outlives its loop and dies
    on the second test with 'Event loop is closed'. Engine creation is
    cheap (low ms); the per-test cost is negligible compared to the
    reliability win.
    """
    if not _probe_dsn(TEST_DSN):
        pytest.skip(
            f"DB-backed tests skipped: {TEST_DSN} unreachable. "
            "Run inside the backend container; see conftest.py docstring."
        )
    eng = create_async_engine(TEST_DSN, echo=False, future=True)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def db_connection(engine) -> AsyncIterator[AsyncConnection]:
    """Outer transaction per test. Rolled back at teardown."""
    async with engine.connect() as conn:
        trans = await conn.begin()
        try:
            yield conn
        finally:
            await trans.rollback()


@pytest_asyncio.fixture
async def db_session(db_connection: AsyncConnection) -> AsyncIterator[AsyncSession]:
    factory = async_sessionmaker(
        bind=db_connection,
        class_=AsyncSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_connection: AsyncConnection) -> AsyncIterator[AsyncClient]:
    """ASGI test client wired to the same outer transaction.

    `get_session` is overridden so every request inside a test joins
    the test's transaction via SAVEPOINT. `app.state.session_factory`
    is also set so any code path that reads from there (e.g. router
    background tasks) lands in the same place.
    """
    from app.core.db import get_session
    from app.main import app

    factory = async_sessionmaker(
        bind=db_connection,
        class_=AsyncSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    async def _override_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    had_previous_factory = hasattr(app.state, "session_factory")
    previous_factory = getattr(app.state, "session_factory", None)
    app.state.session_factory = factory
    app.dependency_overrides[get_session] = _override_session

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_session, None)
        # Always restore. If lifespan never ran (the usual test case),
        # delete the attribute outright so the next test's middleware
        # path does not pick up our now-disposed factory.
        if had_previous_factory:
            app.state.session_factory = previous_factory
        else:
            try:
                delattr(app.state, "session_factory")
            except AttributeError:
                pass
