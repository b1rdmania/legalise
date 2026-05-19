"""User model — fastapi-users compatible.

Extends the fastapi-users `SQLAlchemyBaseUserTableUUID` (id, email,
hashed_password, is_active, is_superuser, is_verified) with project-
specific columns: name, role, default model, default privilege posture.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyBaseAccessTokenTableUUID
from sqlalchemy import DateTime, ForeignKey, LargeBinary, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.models.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="solicitor")
    # v0.1 plan field - display only. No enforcement, no billing semantics
    # wired anywhere. Every user is `free`. Real subscription state (plan
    # periods, Stripe references, plan-based gating) lands in v0.2 when
    # billing wires; until then this is honest "what tier are you on"
    # signage and nothing more.
    plan: Mapped[str] = mapped_column(
        String(32), nullable=False, default="free", server_default="free"
    )
    default_model_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_privilege_posture: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default="B_mixed"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


class AccessToken(SQLAlchemyBaseAccessTokenTableUUID, Base):
    """fastapi-users DatabaseStrategy token table.

    Cookie transport stores the token value in an httponly cookie; this
    table is the server-side validator. Lifetime is enforced by the
    strategy config, not a column.

    The fastapi-users mixin declares `user_id` with a FK to `user.id`
    (singular). Our user table is `users`, so we override the column
    here. Migration 0003 already creates the FK against `users.id`;
    this only fixes the ORM-side metadata so flush resolves correctly.
    """

    __tablename__ = "access_token"

    @declared_attr
    def user_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="cascade"),
            nullable=False,
        )


class UserApiKey(Base):
    """Per-user provider API key, encrypted at rest (AES-256-GCM).

    `ciphertext` and `nonce` are the encryption output of
    `app.core.encryption`. Plaintext lives only in-memory during a
    request — never logged, never serialised to audit payloads.
    """

    __tablename__ = "user_api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    nonce: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<UserApiKey user={self.user_id} provider={self.provider}>"
