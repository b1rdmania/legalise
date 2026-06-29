"""Matter model — the spine of the workspace.

Every other resource (documents, events, audit entries, model calls) hangs off
a Matter. Privilege posture is a first-class property: A_cleared / B_mixed /
C_paused gates which model providers can be called.
"""

from __future__ import annotations

import uuid
from datetime import datetime, date, UTC

from sqlalchemy import String, DateTime, Date, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Privilege postures — string constants used in `privilege_posture` column.
PRIVILEGE_CLEARED = "A_cleared"
PRIVILEGE_MIXED = "B_mixed"
PRIVILEGE_PAUSED = "C_paused"
PRIVILEGE_VALUES = {PRIVILEGE_CLEARED, PRIVILEGE_MIXED, PRIVILEGE_PAUSED}

# Status values.
STATUS_OPEN = "open"
STATUS_SETTLEMENT = "settlement"
STATUS_CLOSED = "closed"
STATUS_ARCHIVED = "archived"  # tombstone — matter logically deleted; excluded from list views
STATUS_VALUES = {STATUS_OPEN, STATUS_SETTLEMENT, STATUS_CLOSED, STATUS_ARCHIVED}


class Matter(Base):
    __tablename__ = "matters"
    __table_args__ = (UniqueConstraint("created_by_id", "slug", name="uq_matters_owner_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Slug uniqueness is per-owner (composite with created_by_id) so two users
    # can hold matters with the same human-readable slug without collision.
    # Filesystem materialisation paths shard by user_id (matter_fs.py) to
    # mirror the database invariant on disk.
    slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    matter_type: Mapped[str] = mapped_column(String(64), nullable=False, default="employment_tribunal")
    cause: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=STATUS_OPEN)

    case_theory: Mapped[str | None] = mapped_column(Text, nullable=True)
    pivot_fact: Mapped[str | None] = mapped_column(Text, nullable=True)

    privilege_posture: Mapped[str] = mapped_column(String(32), nullable=False, default=PRIVILEGE_MIXED)
    default_model_id: Mapped[str] = mapped_column(String(64), nullable=False, default="claude-sonnet-4-6")

    # Free-form key/value bag for matter-type-specific fields (EDT, ACAS dates, etc.)
    facts: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Register sidecar: adapter name ("mike") when this matter is an
    # ingested external-workspace pack; NULL for native matters. External
    # matters are created C_paused so the posture gate keeps them
    # read-only — no capability runs, no model calls, no skills.
    external_source: Mapped[str | None] = mapped_column(String(64), nullable=True)

    @property
    def required_provider(self) -> str | None:
        """The keyed provider this matter's default model needs, or None
        for keyless models (stub-echo / ollama). Single source of truth:
        the same ``provider_for_model`` the runtime gateway uses, so the
        frontend reads this instead of re-deriving model families and the
        two can't drift. Deferred import avoids the model_gateway↔models
        import cycle."""
        from app.core.model_gateway import provider_for_model

        return provider_for_model(self.default_model_id)

    def __repr__(self) -> str:
        return f"<Matter {self.slug} [{self.status}]>"
