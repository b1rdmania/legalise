"""Audit reconstruction API.

Single endpoint:

- ``GET /api/matters/{slug}/audit/reconstruction`` returns a
  paginated, source-merged timeline of every event the matter
  produced.

Authorisation
-------------
Strict matter-access predicate. The reconstruction view is
privileged inspection — it exposes every actor, model call, gate
decision, payload, and failure on the matter. A capability grant
on the matter does NOT, on its own, satisfy access. Only:

- the matter owner (``Matter.created_by_id``), OR
- a workspace superuser (``User.is_superuser``)

are admitted. **A grant lets you RUN a capability; it does not let
you READ the audit trail of every other capability the matter has
run.** That separation is the reason this endpoint does not honour
``WorkspaceSkillCapabilityGrant`` rows for access.

Audit emission: every successful view writes an
``audit.reconstruction.viewed`` row so the inspector is themselves
auditable.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.audit_reconstruction import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    VALID_SOURCES,
    reconstruct,
)
from app.core.auth import current_user
from app.core.db import get_session
from app.models import Matter, User
from app.models.matter import STATUS_ARCHIVED


router = APIRouter()


class TimelineEntryOut(BaseModel):
    source: str
    occurred_at: datetime
    action: str
    actor: dict[str, Any]
    matter_id: str | None
    module_id: str | None
    capability_id: str | None
    payload: dict[str, Any]
    refs: dict[str, Any]
    source_row_id: str


class ReconstructionResponse(BaseModel):
    entries: list[TimelineEntryOut]
    next_cursor: str | None
    total_in_window_estimate: int


async def _load_matter_or_403(
    session: AsyncSession, *, slug: str, user: User
) -> Matter:
    """Strict matter-access lookup.

    Returns the matter only if the caller is owner OR workspace
    superuser. Otherwise raises 404 — same response cross-user to
    avoid leaking which matters exist.
    """
    # Owner shortcut first (most common path; one query).
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug,
            Matter.created_by_id == user.id,
        )
    )
    if matter is None and user.is_superuser:
        # Superuser fallback — same query without the owner predicate.
        matter = await session.scalar(
            select(Matter).where(Matter.slug == slug)
        )
    if matter is None or matter.status == STATUS_ARCHIVED:
        # 404 (not 403) — uniform cross-user response.
        raise HTTPException(
            status_code=404, detail=f"matter not found: {slug}"
        )
    return matter


@router.get(
    "/{slug}/audit/reconstruction",
    response_model=ReconstructionResponse,
)
async def get_reconstruction(
    slug: str,
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    include: str | None = Query(
        None,
        description=(
            "Comma-separated source filter. Defaults to all three: "
            "audit,state_machine,advice_boundary."
        ),
    ),
    cursor: str | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT, gt=0, le=MAX_LIMIT),
    invocation_id: str | None = Query(
        None,
        description=(
            "Filter rows to those matching this invocation id. "
            "Audit rows match against "
            "payload.invocation_id; advice_boundary rows match "
            "against output_id; state_machine source returns empty "
            "under this filter (substrate has no deterministic "
            "invocation_id carrier on transitions)."
        ),
    ),
    action: str | None = Query(
        None,
        description=(
            "Exact-match filter on the synthesised action string. "
            "State_machine + advice_boundary sources "
            "only match if the action carries their respective "
            "`state_machine.transition.<status>` / "
            "`advice_boundary.decision.<status>` prefix."
        ),
    ),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReconstructionResponse:
    matter = await _load_matter_or_403(session, slug=slug, user=user)

    if include is not None:
        wanted = {s.strip() for s in include.split(",") if s.strip()}
        unknown = wanted - VALID_SOURCES
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "unknown_source",
                    "unknown": sorted(unknown),
                    "valid": sorted(VALID_SOURCES),
                },
            )
        sources = frozenset(wanted) if wanted else VALID_SOURCES
    else:
        sources = VALID_SOURCES

    # Validate invocation_id is a UUID before passing it through to
    # SQL. Substrate writes them as UUID strings; a
    # caller passing junk should get a structured 422 here rather
    # than a database-side cast error.
    if invocation_id is not None:
        try:
            uuid.UUID(invocation_id)
        except (ValueError, AttributeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "invalid_invocation_id",
                    "supplied": invocation_id,
                    "message": "invocation_id must be a UUID string",
                },
            ) from exc

    try:
        page = await reconstruct(
            session,
            matter_id=matter.id,
            since=since,
            until=until,
            sources=sources,
            cursor=cursor,
            limit=limit,
            invocation_id=invocation_id,
            action=action,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": "invalid_request", "message": str(exc)},
        ) from exc

    # Emit the view-audit row so the inspector is themselves auditable.
    # This row will appear in subsequent reconstruction calls — that's
    # intentional; "who looked at the trail when" is itself provenance.
    #
    # Unified payload shape across matter + workspace surfaces.
    # `scope` + `matter_id` + `filters` is the documented contract;
    # the admin endpoint emits the same action with
    # `scope="workspace"` + `matter_id=null`.
    await audit.log(
        session,
        "audit.reconstruction.viewed",
        actor_id=user.id,
        matter_id=matter.id,
        module="core.audit",
        payload={
            "scope": "matter",
            "matter_id": str(matter.id),
            "filters": {
                "invocation_id": invocation_id,
                "action": action,
                "sources": sorted(sources),
                "since": since.isoformat() if since else None,
                "until": until.isoformat() if until else None,
            },
            "limit": limit,
            "cursor_supplied": cursor is not None,
            "returned": len(page.entries),
        },
    )
    await session.commit()

    return ReconstructionResponse(
        entries=[TimelineEntryOut(**e.to_dict()) for e in page.entries],
        next_cursor=page.next_cursor,
        total_in_window_estimate=page.total_in_window_estimate,
    )


# ---------------------------------------------------------------------------
# Workspace / admin reconstruction
# ---------------------------------------------------------------------------
#
# Separate router because main.py mounts the matter `router` at
# `/api/matters`. The admin endpoint lives under `/api/admin/audit`,
# so it needs its own prefix when registered.

admin_router = APIRouter()
#
# GET /api/admin/audit/reconstruction
#
# Returns workspace-scoped audit rows (matter_id IS NULL) for events
# that are NOT bound to any specific matter — install ceremony
# events, settings key operations, admin role mutations, etc.
#
# Reuses the matter `reconstruct()` helper with matter_id=None.
# Source semantics (substrate-truth per the plan):
#   - `source="audit"` returns rows with matter_id IS NULL.
#   - `source="state_machine"` returns []. StateMachineInstance
#     always has a matter owner (workspace ceremonies don't exist).
#   - `source="advice_boundary"` returns []. AdviceBoundaryDecision
#     gate_state always carries matter_id.
#   The endpoint accepts all three values in `include` (no 422
#   churn); the empties surface honestly.
#
# Auth: superuser-only. Mirrors the other admin surfaces.
#
# Audit: same action `audit.reconstruction.viewed` as the matter
# endpoint, with `payload.scope="workspace"` + `payload.matter_id=null`.
# One row schema across both surfaces under the unified payload contract.


def _require_superuser(user: User) -> None:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "admin_required",
                "message": (
                    "GET /api/admin/audit/reconstruction requires superuser."
                ),
            },
        )


@admin_router.get(
    "/reconstruction",
    response_model=ReconstructionResponse,
)
async def get_admin_reconstruction(
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    include: str | None = Query(
        None,
        description=(
            "Comma-separated source filter. Defaults to all three: "
            "audit,state_machine,advice_boundary. Workspace scope only "
            "yields rows from source=audit; state_machine + "
            "advice_boundary are matter-bound by substrate design and "
            "return empty here."
        ),
    ),
    cursor: str | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT, gt=0, le=MAX_LIMIT),
    invocation_id: str | None = Query(
        None,
        description=(
            "Filter rows to those matching this invocation id. "
            "Audit rows match against payload.invocation_id."
        ),
    ),
    action: str | None = Query(
        None,
        description="Exact-match filter on the action column.",
    ),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReconstructionResponse:
    _require_superuser(user)

    if include is not None:
        wanted = {s.strip() for s in include.split(",") if s.strip()}
        unknown = wanted - VALID_SOURCES
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "unknown_source",
                    "unknown": sorted(unknown),
                    "valid": sorted(VALID_SOURCES),
                },
            )
        sources = frozenset(wanted) if wanted else VALID_SOURCES
    else:
        sources = VALID_SOURCES

    if invocation_id is not None:
        try:
            uuid.UUID(invocation_id)
        except (ValueError, AttributeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "invalid_invocation_id",
                    "supplied": invocation_id,
                    "message": "invocation_id must be a UUID string",
                },
            ) from exc

    try:
        page = await reconstruct(
            session,
            matter_id=None,  # ← workspace scope
            since=since,
            until=until,
            sources=sources,
            cursor=cursor,
            limit=limit,
            invocation_id=invocation_id,
            action=action,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": "invalid_request", "message": str(exc)},
        ) from exc

    # Same action as the matter endpoint; same payload schema with
    # scope="workspace" + matter_id=None. The matter endpoint's
    # _load_matter_or_403 won't surface this row (matter_id IS NULL)
    # — it lives only on the admin endpoint, audit-the-auditor
    # preserved.
    await audit.log(
        session,
        "audit.reconstruction.viewed",
        actor_id=user.id,
        matter_id=None,
        module="core.audit",
        payload={
            "scope": "workspace",
            "matter_id": None,
            "filters": {
                "invocation_id": invocation_id,
                "action": action,
                "sources": sorted(sources),
                "since": since.isoformat() if since else None,
                "until": until.isoformat() if until else None,
            },
            "limit": limit,
            "cursor_supplied": cursor is not None,
            "returned": len(page.entries),
        },
    )
    await session.commit()

    return ReconstructionResponse(
        entries=[TimelineEntryOut(**e.to_dict()) for e in page.entries],
        next_cursor=page.next_cursor,
        total_in_window_estimate=page.total_in_window_estimate,
    )
