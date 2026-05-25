"""WorkspaceDisabledSkill — per-user toggle for plugin skills.

Semantic: **absence = enabled** (default), **presence = disabled**. This
inverts the plan's wording but is the only model that doesn't require
enumerating the filesystem-discovered skill catalogue at signup.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkspaceDisabledSkill(Base):
    __tablename__ = "workspace_disabled_skills"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    plugin: Mapped[str] = mapped_column(String(64), primary_key=True)
    skill: Mapped[str] = mapped_column(String(128), primary_key=True)
    disabled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    def __repr__(self) -> str:
        return f"<WorkspaceDisabledSkill user={self.user_id} {self.plugin}/{self.skill}>"
