"""WorkspaceSkillCapabilityGrant — per-user, per-skill capability grants.

Doctrine, locked at HANDOVER_LAUNCH_QA.md:

    Manifest requests capabilities. Workspace grants capabilities.
    Runtime enforces capabilities.

This table is the storage layer for the "Workspace grants" half. A row
asserts that ``user_id`` has authorised ``(plugin, skill)`` to exercise
``capability`` at runtime AT THE SPECIFIED SCOPE. Absence is denial.
The runtime check in ``app.core.capabilities.require_capability``
reads this table on every privileged boundary.

``scope_type`` + ``scope_id`` are first-class columns (migration 0019)
so the same user can hold the same capability at different scopes
(e.g. matter A and matter B) without collision. Uniqueness is the
6-tuple:

    (user_id, plugin, skill, capability, scope_type, scope_id)

…enforced via ``uq_grant_user_plugin_skill_cap_scope`` with the
``NULLS NOT DISTINCT`` modifier so two workspace-scope grants for the
same 4-tuple collide cleanly (Postgres 15+).

``ck_grant_scope_pairing`` enforces ``(scope_type = 'matter') =
(scope_id IS NOT NULL)``; ``ck_grant_scope_type_vocab`` (migration 0020)
pins ``scope_type`` to the two-value vocabulary.

``granted_by_user_id`` records the actor who granted the capability
for audit trails (NULL for system auto-grants at signup).
``granted_permissions_snapshot`` carries provenance from the trust
ceremony — what the user saw at grant time — but is no longer the
uniqueness primitive.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Scope vocabulary (Phase 7 v2 — per Andy's note #2: small constants,
# not raw strings repeated across call sites).
SCOPE_TYPE_WORKSPACE = "workspace"
SCOPE_TYPE_MATTER = "matter"
SCOPE_TYPE_VALUES = frozenset({SCOPE_TYPE_WORKSPACE, SCOPE_TYPE_MATTER})


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
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
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

    # Phase 7 v2 — scope is first-class. Pre-Phase-7 the grant's
    # matter scope lived inside granted_permissions_snapshot.matter_id;
    # that made it impossible to hold the same (plugin, skill,
    # capability) for two matters because the uniqueness primitive
    # didn't include scope. The columns + the new uniqueness close
    # that gap. ``granted_permissions_snapshot`` stays as provenance.
    #
    # ``scope_type`` is one of ``SCOPE_TYPE_VALUES``. ``scope_id``
    # is NULL for workspace scope, the matter UUID for matter scope.
    # The check constraint ensures they always move together.
    scope_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default=SCOPE_TYPE_WORKSPACE
    )
    scope_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "plugin", "skill", "capability", "scope_type", "scope_id",
            name="uq_grant_user_plugin_skill_cap_scope",
        ),
        CheckConstraint(
            "(scope_type = 'matter') = (scope_id IS NOT NULL)",
            name="ck_grant_scope_pairing",
        ),
        CheckConstraint(
            "scope_type IN ('workspace', 'matter')",
            name="ck_grant_scope_type_vocab",
        ),
        Index(
            "ix_capability_grants_user_plugin_skill",
            "user_id", "plugin", "skill",
        ),
        Index(
            "ix_grant_user_plugin_skill_scope",
            "user_id", "plugin", "skill", "scope_type", "scope_id",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<WorkspaceSkillCapabilityGrant user={self.user_id} "
            f"{self.plugin}/{self.skill} cap={self.capability}>"
        )
