"""First-admin bootstrap CLI.

Closes the symmetric gap to HTTP role promotion. Role promotion is
real via HTTP, but ``is_superuser`` previously required direct DB
access. A hosted evaluator or fresh fork couldn't mint a first
operator without DBA access.

Usage::

    python -m app.tools.bootstrap_admin --email <email>
    python -m app.tools.bootstrap_admin --email <email> --role workspace_admin
    LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true \\
        python -m app.tools.bootstrap_admin --email <email> --force

Exit codes:
    0  success
    1  argparse / generic CLI error
    2  user_not_found (target email has no User row)
    3  superuser_already_exists (no ``--force``)
    4  force_requires_env (``--force`` without env var set)
    5  invalid_role

By default refuses if any superuser already exists. The
``LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true`` env var + ``--force``
together unlock the second-admin path (e.g. lost-key recovery).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models import User


# Same vocabulary the HTTP role endpoint locks. ``solicitor`` is
# the default and explicitly allowed for symmetry — it's a no-op
# via the flag.
ALLOWED_ROLES: frozenset[str] = frozenset(
    {"solicitor", "qualified_solicitor", "workspace_admin"}
)

FORCE_ENV_VAR = "LEGALISE_BOOTSTRAP_ADMIN_ALLOWED"


# Exit-code constants — single source of truth so tests can assert.
EXIT_OK = 0
EXIT_USER_NOT_FOUND = 2
EXIT_SUPERUSER_EXISTS = 3
EXIT_FORCE_REQUIRES_ENV = 4
EXIT_INVALID_ROLE = 5


class BootstrapError(Exception):
    """Raised inside the CLI when a structured exit code applies."""

    def __init__(self, code: int, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _build_session_factory():
    """Create an async engine + sessionmaker outside FastAPI's
    lifespan. The CLI runs as a one-shot process; we open a single
    engine, use it once, and let process exit clean up."""
    engine = create_async_engine(settings.postgres_dsn, echo=False)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _bootstrap(
    session: AsyncSession, *, email: str, role: str | None, force: bool
) -> dict:
    """Run the bootstrap. Returns a summary dict on success;
    raises ``BootstrapError`` on any structured failure path."""
    # Role vocabulary check happens before any DB lookups so an
    # invalid role doesn't even touch the DB.
    if role is not None and role not in ALLOWED_ROLES:
        raise BootstrapError(
            EXIT_INVALID_ROLE,
            f"invalid role {role!r}; allowed: {sorted(ALLOWED_ROLES)}",
        )

    # Force requires the env var as a second gate (Decision #3).
    env_allowed = os.environ.get(FORCE_ENV_VAR, "").lower() == "true"
    if force and not env_allowed:
        raise BootstrapError(
            EXIT_FORCE_REQUIRES_ENV,
            f"--force requires {FORCE_ENV_VAR}=true in the environment",
        )

    target = await session.scalar(select(User).where(User.email == email))
    if target is None:
        raise BootstrapError(
            EXIT_USER_NOT_FOUND,
            f"no user found for email {email!r}; register first then bootstrap",
        )

    # Refuse-by-default if any superuser already exists.
    existing = await session.scalar(
        select(User).where(User.is_superuser == True)  # noqa: E712
    )
    if existing is not None and not force:
        raise BootstrapError(
            EXIT_SUPERUSER_EXISTS,
            (
                f"a superuser already exists ({existing.email}); use "
                f"--force with {FORCE_ENV_VAR}=true to bootstrap another"
            ),
        )

    # Capture the pre-mutation state for the audit row's
    # from-to payload. The "any superuser exists" check above
    # guarantees is_superuser_was is False on this code path
    # (unless --force was supplied), so the audit row honestly
    # records the transition.
    is_superuser_was = target.is_superuser
    role_was = target.role

    target.is_superuser = True
    if role is not None:
        target.role = role

    # Audit row — same shape the HTTP role endpoint uses
    # (canonical from-to keys).
    from app.core.api import audit

    await audit.log(
        session,
        "user.admin.bootstrapped",
        actor_id=None,  # system bootstrap, not a user
        module="core.bootstrap_admin",
        resource_type="user",
        resource_id=str(target.id),
        payload={
            "target_user_id": str(target.id),
            "target_email": target.email,
            "is_superuser_was": is_superuser_was,
            "is_superuser_is": True,
            "role_was": role_was,
            "role_is": target.role,
            "forced": force,
            "bootstrapped_at": datetime.now(UTC).isoformat(),
        },
    )
    await session.commit()

    return {
        "ok": True,
        "target_user_id": str(target.id),
        "email": target.email,
        "is_superuser": target.is_superuser,
        "role": target.role,
        "forced": force,
    }


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="bootstrap_admin",
        description=(
            "Promote an existing user to is_superuser. Closes the "
            "first-admin gap the HTTP role endpoint left open."
        ),
    )
    parser.add_argument(
        "--email", required=True, help="target user email (must already exist)"
    )
    # Note: choices NOT used here on purpose. Argparse's built-in
    # choices check would exit with code 2 before our structured
    # error path runs. Validation moves into _bootstrap so invalid
    # roles produce exit code EXIT_INVALID_ROLE (5) with the
    # canonical stderr message.
    parser.add_argument(
        "--role",
        default=None,
        help=(
            "optional: also set the workspace role. Allowed: "
            + ", ".join(sorted(ALLOWED_ROLES))
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "bootstrap even if a superuser already exists. Requires "
            f"{FORCE_ENV_VAR}=true in the environment."
        ),
    )
    return parser.parse_args(argv)


async def _main_async(args: argparse.Namespace) -> int:
    factory = _build_session_factory()
    async with factory() as session:
        try:
            result = await _bootstrap(
                session, email=args.email, role=args.role, force=args.force
            )
        except BootstrapError as exc:
            print(f"error: {exc.message}", file=sys.stderr)
            return exc.code
    print(
        f"bootstrapped {result['email']} (user_id={result['target_user_id']}, "
        f"role={result['role']}, forced={result['forced']})"
    )
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    return asyncio.run(_main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
