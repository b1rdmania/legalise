"""Phase 1 capability check helper.

Wraps the existing ``require_capability`` with the
``plugin="core"`` convention for substrate-level capability checks
(architectural decision #1 in PHASE_1_BUILD_PLAN.md).

On denial, emits the Phase 1 canonical ``*.blocked`` audit row
*in addition* to the existing ``module.capability.denied`` row that
``require_capability`` writes (architectural decision #2). Both rows
are needed: the existing row preserves the legacy capability-denial
shape for the existing 403 handler; the Phase 1 row carries the
canonical ``BlockedPayload`` for substrate reconstruction.

The Phase 1 row is written via ``audit_failure`` (independent
transaction) because ``require_capability`` commits the session on
its way out before raising ``CapabilityDenied`` — so a second
``session.add`` would either be in a new transaction the caller
hasn't started or get lost to the caller's eventual rollback. Using
``audit_failure`` keeps the Phase 1 row guaranteed-persisted.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit_failure
from app.core.capabilities import CapabilityDenied, require_capability
from app.core.phase1_runtime.blocked import BlockedPayload, BlockedReason
from app.core.phase1_runtime.exceptions import Phase1Blocked


async def check_or_block(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    capability: str,
    primitive: str,
    block_action: str,
    plugin: str = "core",
    skill: str | None = None,
    actor_id: uuid.UUID | None = None,
    matter_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> None:
    """Check whether ``user_id`` holds ``capability``.

    On success, returns ``None``. The caller proceeds with its work.

    On denial, two audit rows are written and ``Phase1Blocked`` is
    raised:

    1. ``module.capability.denied`` — written by ``require_capability``
       internally. Commits via the session, then commits again
       defensively. Existing 403 handler in ``app.main`` knows this
       row's shape.
    2. ``<block_action>`` — Phase 1 canonical ``*.blocked`` row with
       ``BlockedPayload(blocked_reason=CAPABILITY_DENIED,
       denied_capability=capability)``. Written via
       ``audit_failure`` (independent transaction) so it survives
       rollback.

    Parameters
    ----------
    session
        Request session.
    user_id
        Acting user.
    capability
        Full capability string (e.g.
        ``"matter.context.legalise_memory.accepted_facts.write"``).
    primitive
        Substrate primitive name (e.g. ``"matter_context"``).
        Used for the audit ``module`` column.
    block_action
        Canonical Phase 1 event name for the block, e.g.
        ``"matter_context.write.blocked"``,
        ``"state_machine.transition.blocked"``.
    plugin
        Grant table plugin field. Defaults to ``"core"`` per the
        substrate convention. Modules pass their own plugin id.
    skill
        Grant table skill field. Defaults to ``primitive`` value
        when omitted, so a substrate caller can leave it implicit.
    actor_id, matter_id, resource_type, resource_id
        Forwarded to the Phase 1 audit row.

    Raises
    ------
    Phase1Blocked
        On capability denial, after both audit rows are written.
    """
    effective_skill = skill if skill is not None else primitive
    try:
        await require_capability(
            session,
            user_id=user_id,
            plugin=plugin,
            skill=effective_skill,
            capability=capability,
        )
    except CapabilityDenied:
        # require_capability has already written `module.capability.denied`
        # and committed it. Now write the Phase 1 canonical row via
        # audit_failure so it survives any rollback the caller does after
        # we re-raise.
        blocked = BlockedPayload(
            blocked_reason=BlockedReason.CAPABILITY_DENIED,
            denied_capability=capability,
        )
        composed_payload = {
            "module_id": plugin,
            "capability_id": capability,
            **blocked.to_dict(),
        }
        await audit_failure(
            session,
            block_action,
            actor_id=actor_id if actor_id is not None else user_id,
            matter_id=matter_id,
            module=f"core.{primitive}",
            resource_type=resource_type,
            resource_id=resource_id,
            payload=composed_payload,
        )
        raise Phase1Blocked(blocked) from None
