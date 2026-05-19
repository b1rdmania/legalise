"""fastapi-users Pydantic schemas for User read/create/update."""

from __future__ import annotations

import uuid

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    name: str = ""
    role: str = "solicitor"
    # v0.1 plan tier - display only. No billing enforcement.
    plan: str = "free"
    default_model_id: str | None = None
    default_privilege_posture: str | None = "B_mixed"


class UserCreate(schemas.BaseUserCreate):
    name: str = ""


class UserUpdate(schemas.BaseUserUpdate):
    name: str | None = None
    default_model_id: str | None = None
    default_privilege_posture: str | None = None
