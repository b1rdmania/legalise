"""fastapi-users Pydantic schemas for User read/create/update."""

from __future__ import annotations

import uuid

from fastapi_users import schemas
from pydantic import AliasChoices, Field, field_validator

from app.core.demand_capture import normalise_channel, normalise_persona


class UserRead(schemas.BaseUser[uuid.UUID]):
    name: str = ""
    role: str = "solicitor"
    # v0.1 plan tier - display only. No billing enforcement.
    plan: str = "free"
    default_model_id: str | None = None
    default_privilege_posture: str | None = "B_mixed"


class UserCreate(schemas.BaseUserCreate):
    name: str = ""
    # Gate 4 demand capture — both OPTIONAL, both allowlisted. Invalid
    # values normalise to None rather than failing the signup; demand
    # analytics never blocks registration. `channel` is the wire name
    # (the frontend forwards the ?c= launch tag); it lands on the
    # `signup_channel` column. email_domain/domain_class are deliberately
    # NOT accepted here — they are derived server-side at registration.
    persona: str | None = None
    signup_channel: str | None = Field(
        default=None,
        validation_alias=AliasChoices("channel", "signup_channel"),
    )

    @field_validator("persona", mode="before")
    @classmethod
    def _persona_allowlist(cls, v: str | None) -> str | None:
        return normalise_persona(v)

    @field_validator("signup_channel", mode="before")
    @classmethod
    def _channel_allowlist(cls, v: str | None) -> str | None:
        return normalise_channel(v)


class UserUpdate(schemas.BaseUserUpdate):
    name: str | None = None
    default_model_id: str | None = None
    default_privilege_posture: str | None = None
