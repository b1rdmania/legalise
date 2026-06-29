"""Matter lifecycle — the shared destructive-tombstone path.

`tombstone_matter` is the single implementation of "delete a matter" used
by BOTH the HTTP route (`DELETE /api/matters/{slug}`) and the retention
sweeper (`app.tools.retention_sweep`). It encodes the tombstone design:

  - Tombstone over hard delete: sets ``matter.status = 'archived'``.
    Document and event rows stay in the DB for referential integrity;
    binary bytes are removed from storage.
  - Storage cleanup is the gate: if ``storage.delete_prefix`` raises, the
    exception propagates and NO audit row / status change is committed
    (the caller's transaction rolls back). A successful return means the
    bytes are actually gone — fail-closed (HANDOVER_SUBSTRATE_REVIEW_FIXES.md
    §2 P1).
  - Audit FKs preserved: the matter row stays (status=archived), so
    ``audit_entries.matter_id`` keeps resolving. The Unit 6 WORM trigger
    forbids UPDATE/DELETE on audit_entries, so we never touch them.
  - Matter-scoped capability grants are revoked as a cascade.

The helper does NOT commit — the caller owns the transaction so the audit
row(s) and the status change land (or roll back) together, and the audit
advisory lock is released on the caller's commit.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.storage import get_storage_backend, matter_prefix
from app.models import (
    SCOPE_TYPE_MATTER,
    Job,
    Matter,
    STATUS_ARCHIVED,
    WorkspaceSkillCapabilityGrant,
    JOB_ACTIVE_STATUSES,
    JOB_KIND_EXPORT,
    JOB_STATUS_SUCCEEDED,
)


class MatterHasActiveJobsError(Exception):
    """Raised by `tombstone_matter` when the matter has queued/running jobs.

    The matter is left untouched. The route translates this into a 409;
    the sweeper logs and skips.
    """

    def __init__(self, active_count: int) -> None:
        self.active_count = active_count
        super().__init__(f"matter has {active_count} active job(s)")


@dataclass
class TombstoneResult:
    """Outcome of a successful tombstone (after storage purge + audit rows
    are staged, before the caller commits)."""

    export_count: int
    had_export: bool
    grants_revoked: int


async def tombstone_matter(
    session: AsyncSession,
    matter: Matter,
    *,
    actor_id: uuid.UUID | None,
    action: str = "matter.deleted",
    payload: dict | None = None,
    warn_without_export: bool = True,
) -> TombstoneResult:
    """Destructively tombstone a live matter. Caller commits.

    Args:
        session: caller's session. Mutations are staged, NOT committed.
        matter: a LIVE (non-archived) matter owned by some user.
        actor_id: audit actor. The owner's id for the HTTP route; ``None``
            (the system-actor convention, cf. seed.py / bootstrap_admin)
            for the unattended retention sweep.
        action: the primary deletion audit action. Defaults to
            ``matter.deleted`` to keep the HTTP route's external behaviour
            identical; the sweeper passes ``matter.retention.purged``.
        payload: extra audit payload merged over the base
            ``{title, had_export, export_count}``.
        warn_without_export: when True and no successful export exists,
            also write a ``matter.deleted_without_export`` warning row.

    Raises:
        MatterHasActiveJobsError: the matter has active jobs (left untouched).
        StorageDeleteError: storage purge failed (nothing staged survives —
            the caller's transaction must roll back; fail-closed).
    """
    # Refuse if active jobs exist for this matter.
    active_count = (
        await session.scalar(
            select(func.count(Job.id)).where(
                Job.matter_id == matter.id,
                Job.status.in_(JOB_ACTIVE_STATUSES),
            )
        )
    ) or 0
    if active_count > 0:
        raise MatterHasActiveJobsError(active_count)

    # Count successful exports (for the warning + payload).
    export_count = (
        await session.scalar(
            select(func.count(Job.id)).where(
                Job.matter_id == matter.id,
                Job.kind == JOB_KIND_EXPORT,
                Job.status == JOB_STATUS_SUCCEEDED,
            )
        )
    ) or 0
    had_export = export_count > 0

    # Storage cleanup FIRST — the gate. A StorageDeleteError propagates so
    # the caller can fail-closed (no commit, matter stays live). The owner
    # id keys the prefix; matter.created_by_id is the canonical owner.
    storage = get_storage_backend()
    prefix = matter_prefix(matter.created_by_id, matter.id)
    storage.delete_prefix(prefix)

    # Storage gone — stage the deletion audit row(s) and tombstone.
    base_payload = {
        "title": matter.title,
        "had_export": had_export,
        "export_count": export_count,
    }
    await audit.log(
        session,
        action,
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="matter",
        resource_id=matter.slug,
        payload={**base_payload, **(payload or {})},
    )
    if warn_without_export and export_count == 0:
        await audit.log(
            session,
            "matter.deleted_without_export",
            actor_id=actor_id,
            matter_id=matter.id,
            resource_type="matter",
            resource_id=matter.slug,
            payload={"warning": "Matter deleted without a prior successful export."},
        )

    matter.status = STATUS_ARCHIVED

    # Cascade grant revocation. Keyed on first-class scope_type/scope_id
    # (backfilled in migration 0019); workspace-scoped grants are not
    # matter-scoped and are intentionally left.
    grants_to_revoke = (
        await session.scalars(
            select(WorkspaceSkillCapabilityGrant).where(
                WorkspaceSkillCapabilityGrant.scope_type == SCOPE_TYPE_MATTER,
                WorkspaceSkillCapabilityGrant.scope_id == matter.id,
            )
        )
    ).all()
    revoked_count = 0
    for grant_row in grants_to_revoke:
        await session.delete(grant_row)
        revoked_count += 1
    if revoked_count:
        await audit.log(
            session,
            "module.grant.revoked",
            actor_id=actor_id,
            matter_id=matter.id,
            module=None,
            resource_type="capability_grant",
            resource_id=matter.slug,
            payload={
                "count": revoked_count,
                "reason": "matter_archived",
            },
        )

    return TombstoneResult(
        export_count=export_count,
        had_export=had_export,
        grants_revoked=revoked_count,
    )
