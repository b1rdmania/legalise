"""WorkspaceSkillCapabilityGrant — per-user, per-skill capability grants.

Doctrine, locked at HANDOVER_LAUNCH_QA.md:

    Manifest requests capabilities. Workspace grants capabilities.
    Runtime enforces capabilities.

This table is the storage layer for the "Workspace grants" half. A row
asserts that `user_id` has authorised `(plugin, skill)` to exercise
`capability` at runtime. Absence is denial. The runtime check in
`app.core.capabilities.require_capability` reads this table on every
privileged boundary.

`(user_id, plugin, skill, capability)` is unique by composite constraint.
`granted_by_user_id` records the actor who granted the capability for
audit trails (NULL for system auto-grants at signup).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkspaceSkillCapabilityGrant(Base):
    __tablename__ = "workspace_skill_capability_grants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    plugin: Mapped[str] = mapped_column(String(128), nullable=False)
    skill: Mapped[str] = mapped_column(String(128), nullable=False)
    # Widened from String(64) to String(256) in migration 0015 — v2
    # capability strings are longer than the 7-string v1 vocabulary
    # (e.g. `matter.context.legalise_memory.accepted_facts.write`).
    # Matches the capability_id field on state_machine_transitions.
    capability: Mapped[str] = mapped_column(String(256), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow(), nullable=False
    )
    granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Phase 2 v2 manifest support — all three columns nullable so
    # existing v1 grants (capability_version=NULL,
    # granted_at_module_version=NULL, granted_permissions_snapshot=NULL)
    # continue to resolve via require_capability unchanged.

    # Semver of the capability vocabulary the grant was made under.
    # v2 grants carry the module's manifest schema_version here so
    # Phase 4 grant-lifecycle can detect grammar drift.
    capability_version: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    # The module's version at grant time. Phase 4 reads this on
    # module update to detect whether the grant set has changed and
    # whether a re-prompt is required.
    granted_at_module_version: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    # Snapshot of what was granted (reads, writes, gates, data_movement,
    # advice_tier_max, external_destinations). Phase 4 diffs this
    # against the new manifest on update to detect permission
    # expansion. Empty/NULL for legacy v1 grants.
    granted_permissions_snapshot: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "plugin", "skill", "capability",
            name="uq_capability_grants_user_plugin_skill_capability",
        ),
        Index(
            "ix_capability_grants_user_plugin_skill",
            "user_id", "plugin", "skill",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<WorkspaceSkillCapabilityGrant user={self.user_id} "
            f"{self.plugin}/{self.skill} cap={self.capability}>"
        )
