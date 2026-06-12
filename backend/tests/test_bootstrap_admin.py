"""Bootstrap admin — CLI (`app.tools.bootstrap_admin`) + bootstrap-state endpoint.

Merged from test_phase12_bootstrap_admin.py and
test_phase13b_bootstrap_state.py (test-slim Phase 3).

CLI behaviour pinned (structured exit codes map 1:1 to
``BootstrapError(code, message)`` raised by ``_bootstrap()``; tests call
``_bootstrap()`` directly with the test session because subprocess
invocation can't see uncommitted SAVEPOINT-bound fixtures):

1. Missing user -> BootstrapError(EXIT_USER_NOT_FOUND=2)
2. First bootstrap success -> DB reflects + audit row landed
3. Second bootstrap refused -> BootstrapError(EXIT_SUPERUSER_EXISTS=3)
4. --force without env -> BootstrapError(EXIT_FORCE_REQUIRES_ENV=4)
5. --force with env -> success + audit notes forced=True
6. Invalid role -> BootstrapError(EXIT_INVALID_ROLE=5)

GET /api/system/bootstrap-state: user_count/has_superuser shape,
flag flips on promotion, no authentication required (Decision #3).
"""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import select

from app.models import AuditEntry, User
from app.tools.bootstrap_admin import (
    EXIT_FORCE_REQUIRES_ENV,
    EXIT_INVALID_ROLE,
    EXIT_OK,
    EXIT_SUPERUSER_EXISTS,
    EXIT_USER_NOT_FOUND,
    FORCE_ENV_VAR,
    BootstrapError,
    _bootstrap,
    _parse_args,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(
    db_session,
    *,
    email: str | None = None,
    role: str = "solicitor",
    is_superuser: bool = False,
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email or f"p12-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=is_superuser,
        role=role,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture(autouse=True)
def _clear_force_env_var(monkeypatch):
    """Tests must not inherit a stale ``LEGALISE_BOOTSTRAP_ADMIN_ALLOWED``
    from the surrounding env. The env-gated test sets it explicitly."""
    monkeypatch.delenv(FORCE_ENV_VAR, raising=False)


# ---------------------------------------------------------------------------
# 1. Missing user → exit 2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_user_exits_user_not_found(db_session) -> None:
    with pytest.raises(BootstrapError) as exc_info:
        await _bootstrap(
            db_session,
            email=f"ghost-{uuid.uuid4().hex}@example.com",
            role=None,
            force=False,
        )
    assert exc_info.value.code == EXIT_USER_NOT_FOUND
    assert "no user found" in exc_info.value.message


# ---------------------------------------------------------------------------
# 2. First bootstrap success → exit 0 + DB + audit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_first_bootstrap_success(db_session) -> None:
    user = await _make_user(db_session, role="solicitor")
    email = user.email

    result = await _bootstrap(db_session, email=email, role=None, force=False)
    assert result["ok"] is True
    assert result["is_superuser"] is True
    assert result["role"] == "solicitor"
    assert result["forced"] is False

    # DB row reflects the mutation.
    refreshed = await db_session.scalar(
        select(User).where(User.email == email)
    )
    assert refreshed.is_superuser is True
    assert refreshed.role == "solicitor"

    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "user.admin.bootstrapped",
            AuditEntry.resource_id == str(refreshed.id),
        )
    )
    assert audit_row is not None
    assert audit_row.module == "core.bootstrap_admin"
    # System bootstrap — no acting user.
    assert audit_row.actor_id is None
    payload = audit_row.payload
    assert payload["target_user_id"] == str(refreshed.id)
    # PII boundary: raw email is not stored in the immutable audit row;
    # email_present asserts an email was set on the user without
    # disclosing the value.
    assert "target_email" not in payload
    assert payload["email_present"] is True
    assert payload["is_superuser_was"] is False
    assert payload["is_superuser_is"] is True
    assert payload["role_was"] == "solicitor"
    assert payload["role_is"] == "solicitor"
    assert payload["forced"] is False


# ---------------------------------------------------------------------------
# 3. Second bootstrap refused → exit 3
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_second_bootstrap_refused_without_force(db_session) -> None:
    # Pre-existing superuser.
    await _make_user(db_session, is_superuser=True)
    # Target — non-admin.
    target = await _make_user(db_session, role="solicitor")
    target_email = target.email

    with pytest.raises(BootstrapError) as exc_info:
        await _bootstrap(
            db_session, email=target_email, role=None, force=False
        )
    assert exc_info.value.code == EXIT_SUPERUSER_EXISTS
    assert "superuser already exists" in exc_info.value.message

    # DB unchanged for the target.
    refreshed = await db_session.scalar(
        select(User).where(User.email == target_email)
    )
    assert refreshed.is_superuser is False


# ---------------------------------------------------------------------------
# 4. --force without env → exit 4
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_force_without_env_refused(db_session) -> None:
    await _make_user(db_session, is_superuser=True)
    target = await _make_user(db_session)
    target_email = target.email

    # Ensure the env var is NOT set (autouse fixture handles this,
    # but be explicit).
    assert FORCE_ENV_VAR not in os.environ

    with pytest.raises(BootstrapError) as exc_info:
        await _bootstrap(
            db_session, email=target_email, role=None, force=True
        )
    assert exc_info.value.code == EXIT_FORCE_REQUIRES_ENV
    assert FORCE_ENV_VAR in exc_info.value.message

    refreshed = await db_session.scalar(
        select(User).where(User.email == target_email)
    )
    assert refreshed.is_superuser is False


# ---------------------------------------------------------------------------
# 5. --force with env → exit 0 + audit notes forced=True
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_force_with_env_succeeds(db_session, monkeypatch) -> None:
    await _make_user(db_session, is_superuser=True)
    target = await _make_user(db_session)
    target_email = target.email
    target_id = target.id

    monkeypatch.setenv(FORCE_ENV_VAR, "true")

    result = await _bootstrap(
        db_session, email=target_email, role=None, force=True
    )
    assert result["ok"] is True
    assert result["forced"] is True

    refreshed = await db_session.scalar(
        select(User).where(User.id == target_id)
    )
    assert refreshed.is_superuser is True

    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "user.admin.bootstrapped",
            AuditEntry.resource_id == str(target_id),
        )
    )
    assert audit_row is not None
    assert audit_row.payload["forced"] is True


# ---------------------------------------------------------------------------
# 6. Invalid role → exit 5
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_role_refused(db_session) -> None:
    user = await _make_user(db_session, role="solicitor")
    email = user.email

    with pytest.raises(BootstrapError) as exc_info:
        await _bootstrap(
            db_session, email=email, role="banana", force=False
        )
    assert exc_info.value.code == EXIT_INVALID_ROLE
    assert "invalid role" in exc_info.value.message
    assert "qualified_solicitor" in exc_info.value.message

    refreshed = await db_session.scalar(
        select(User).where(User.email == email)
    )
    assert refreshed.is_superuser is False
    assert refreshed.role == "solicitor"


# ---------------------------------------------------------------------------
# Bonus: explicit --role workspace_admin works end-to-end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_with_workspace_admin_role(db_session) -> None:
    user = await _make_user(db_session, role="solicitor")
    email = user.email

    result = await _bootstrap(
        db_session, email=email, role="workspace_admin", force=False
    )
    assert result["ok"] is True
    assert result["role"] == "workspace_admin"

    refreshed = await db_session.scalar(
        select(User).where(User.email == email)
    )
    assert refreshed.is_superuser is True
    assert refreshed.role == "workspace_admin"


# ---------------------------------------------------------------------------
# argparse contract — pins the CLI shape independent of DB state
# ---------------------------------------------------------------------------


def test_argparse_requires_email() -> None:
    """Missing --email exits with the argparse default code (2).
    Pins the CLI contract; documented behaviour is "argparse generic
    error" but tests guard against accidental code drift."""
    with pytest.raises(SystemExit) as exc_info:
        _parse_args([])
    # argparse exits 2 by default for missing required args.
    assert exc_info.value.code == 2


def test_argparse_accepts_email_only() -> None:
    args = _parse_args(["--email", "test@example.com"])
    assert args.email == "test@example.com"
    assert args.role is None
    assert args.force is False


def test_argparse_accepts_role_and_force() -> None:
    args = _parse_args(
        [
            "--email",
            "test@example.com",
            "--role",
            "workspace_admin",
            "--force",
        ]
    )
    assert args.role == "workspace_admin"
    assert args.force is True


# ===========================================================================
# GET /api/system/bootstrap-state
# ===========================================================================

async def _register(client) -> tuple[str, str]:
    email = f"p13bc-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase13bc-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    return email, password


# ---------------------------------------------------------------------------
# 1. After register, no superuser
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_after_register_no_superuser(client, db_session) -> None:
    # Snapshot the count before this test's register.
    initial = await client.get("/api/system/bootstrap-state")
    assert initial.status_code == 200
    initial_count = initial.json()["user_count"]
    initial_has_super = initial.json()["has_superuser"]

    await _register(client)

    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    # Register added at least one user; cleaning up here doesn't
    # control other parallel tests, so assert the bound rather than
    # equality.
    assert body["user_count"] >= initial_count + 1
    # has_superuser flag does not change just from register.
    assert body["has_superuser"] == initial_has_super


# ---------------------------------------------------------------------------
# 2. After promotion: has_superuser=True
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_after_superuser_promotion_flag_flips(client) -> None:
    email, _ = await _register(client)

    # Promote.
    from app.main import app
    factory = app.state.session_factory
    async with factory() as session:
        u = await session.scalar(select(User).where(User.email == email))
        u.is_superuser = True
        await session.commit()

    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_count"] >= 1
    assert body["has_superuser"] is True


# ---------------------------------------------------------------------------
# 3. No authentication required (Decision #3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_authentication_required(client) -> None:
    """The endpoint MUST be callable without a session cookie.

    The shared client fixture may or may not have a logged-in user;
    we explicitly clear cookies to be sure no auth state leaks in.
    """
    # Clear any session cookies in the test client.
    client.cookies.clear()
    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    assert "user_count" in body
    assert "has_superuser" in body


@pytest.mark.asyncio
async def test_response_shape(client) -> None:
    """Body has exactly the expected keys; no unexpected fields leak.
    Phase 17.5 added firm_role_gates_enabled so the SPA knows whether to
    present the firm role hierarchy."""
    resp = await client.get("/api/system/bootstrap-state")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {
        "user_count",
        "has_superuser",
        "firm_role_gates_enabled",
    }
    assert isinstance(body["user_count"], int)
    assert isinstance(body["has_superuser"], bool)
    assert isinstance(body["firm_role_gates_enabled"], bool)
