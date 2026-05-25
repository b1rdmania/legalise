"""Phase 1 audit emission helper.

Thin wrapper over ``app.core.api.audit.log`` that enforces the Phase 1
convention: every audit row written by a substrate primitive carries
``module_id``, ``capability_id``, and ``actor_id`` in the payload where
applicable, and the ``module`` column on ``audit_entries`` is set to
``core.<primitive>`` (e.g. ``core.state_machine``).

This helper does NOT commit. Caller commits — same contract as the
underlying ``audit.log``. The single exception is when ``audit_phase1``
is called from a path that will raise before the caller commits (e.g.
inside ``check_or_block`` re-raising ``Phase1Blocked``); in that case
the caller should use ``app.core.api.audit_failure`` instead so the
row survives rollback.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.phase1_runtime.blocked import BlockedPayload


async def audit_phase1(
    session: AsyncSession,
    *,
    action: str,
    primitive: str,
    actor_id: uuid.UUID | None = None,
    matter_id: uuid.UUID | None = None,
    module_id: str | None = None,
    capability_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    payload: dict[str, Any] | None = None,
    blocked: BlockedPayload | None = None,
    latency_ms: int | None = None,
) -> None:
    """Emit a Phase 1 audit row to ``session``. Does not commit.

    Parameters
    ----------
    session
        Caller's request session. Row is added to this session and
        commits alongside the caller's work.
    action
        Canonical Phase 1 event name, e.g.
        ``state_machine.transition.completed``,
        ``matter_context.item.created``,
        ``advice_boundary.check.blocked``.
    primitive
        Which substrate primitive emitted this. One of
        ``"state_machine"``, ``"matter_context"``, ``"advice_boundary"``.
        Stored in the ``module`` column as ``core.<primitive>``.
    actor_id, matter_id
        Standard ``AuditEntry`` fields.
    module_id, capability_id
        Phase 1 fields packed into the payload JSONB. ``module_id``
        names the module that owns the capability (for substrate-level
        operations this is typically ``"core"``); ``capability_id`` is
        the full capability string (e.g.
        ``"matter.context.legalise_memory.accepted_facts.write"``).
    resource_type, resource_id
        Standard ``AuditEntry`` fields.
    payload
        Additional payload fields. Merged with ``blocked.to_dict()``
        if both supplied; ``blocked`` takes precedence on conflicting
        keys (``status``, ``blocked_reason``, etc.).
    blocked
        Canonical ``BlockedPayload``. Use for any ``*.blocked`` audit
        row. The blocked payload is merged into ``payload`` before
        write.
    latency_ms
        Optional latency measurement.
    """
    composed: dict[str, Any] = dict(payload or {})
    if module_id is not None:
        composed["module_id"] = module_id
    if capability_id is not None:
        composed["capability_id"] = capability_id
    if blocked is not None:
        composed.update(blocked.to_dict())

    await audit.log(
        session,
        action,
        actor_id=actor_id,
        matter_id=matter_id,
        module=f"core.{primitive}",
        resource_type=resource_type,
        resource_id=resource_id,
        payload=composed,
        latency_ms=latency_ms,
    )
