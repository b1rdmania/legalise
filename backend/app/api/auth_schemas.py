"""fastapi-users Pydantic schemas for User read/create/update."""

from __future__ import annotations

import uuid

from email_validator import EmailNotValidError, validate_email
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

    # The raw email-validator message ("The part after the @-sign is a
    # special-use or reserved name...") leaks library internals on signup.
    # Catch it before EmailStr runs and return one human line instead.
    # Same validator (check_deliverability=False) as EmailStr, so which
    # addresses pass is unchanged — only the failure message is friendlier.
    @field_validator("email", mode="before")
    @classmethod
    def _friendly_email(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                validate_email(v, check_deliverability=False)
            except EmailNotValidError as exc:
                raise ValueError(
                    "Enter a valid email address. Test or reserved domains "
                    "(such as .test or .local) are not accepted."
                ) from exc
        return v

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
