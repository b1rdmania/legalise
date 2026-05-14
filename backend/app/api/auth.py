"""Auth router — mounts fastapi-users' built-in flows under `/auth`.

Routes (mounted at `/auth` in main.py):
- POST /auth/login                  — cookie login {username, password}
- POST /auth/logout                 — clears cookie
- POST /auth/register               — signup
- POST /auth/forgot-password
- POST /auth/reset-password
- POST /auth/request-verify-token
- POST /auth/verify
- GET  /auth/users/me               — current user
- PATCH /auth/users/me              — update current user

The frontend can call these directly. We keep fastapi-users' standard
names (login/logout/register) rather than aliasing to signin/signout —
matching upstream docs reduces surprise for self-hosters.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.auth_schemas import UserCreate, UserRead, UserUpdate
from app.core.auth import auth_backend, fastapi_users

router = APIRouter()

router.include_router(
    fastapi_users.get_auth_router(auth_backend, requires_verification=False)
)
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))
router.include_router(fastapi_users.get_reset_password_router())
router.include_router(fastapi_users.get_verify_router(UserRead))
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
)
