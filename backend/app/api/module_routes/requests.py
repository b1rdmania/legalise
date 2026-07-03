"""Skill request path — non-admins ask for a skill in-system.

The audit chain IS the store: a request writes one
``module.request.created`` row and nothing else. No new table; the
record is the request. Admins read the pending set back out of the
audit table (distinct requested module_ids minus module_ids already
installed and enabled in the workspace).

POST /api/modules/requests — any authenticated user.
GET  /api/modules/requests — workspace admin only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_check import require_admin
from app.core.auth import current_user
from app.core.db import get_session
from app.models import AuditEntry, InstalledModule, User

router = APIRouter()

REQUEST_ACTION = "module.request.created"


class ModuleRequestIn(BaseModel):
    module_id: str
    # Where the requester found the skill ("lawve", "registry",
    # "github", …). Free-form hint for the admin review link.
    source: str | None = None
    # Where the skill lives (e.g. the GitHub repo URL) — lets the
    # admin's Review-&-add link re-open sources the importer cannot
    # resolve by slug.
    source_url: str | None = None


class ModuleRequestOut(BaseModel):
    module_id: str
    source: str | None
    source_url: str | None = None
    requested_by: str | None
    requested_at: str  # ISO-8601, latest request for this module_id


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_module_request(
    body: ModuleRequestIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """Record a skill request. Any authed user — this is the non-admin
    path out of the "ask an administrator" dead end."""
    module_id = body.module_id.strip()
    if not module_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "module_id_required",
                "message": "module_id must be a non-empty string",
            },
        )

    from app.core.api import audit

    await audit.log(
        session,
        REQUEST_ACTION,
        actor_id=user.id,
        module="module_lifecycle",
        resource_type="module_request",
        resource_id=module_id,
        payload={
            "module_id": module_id,
            "source": body.source,
            "source_url": body.source_url,
            "requested_by": str(user.id),
        },
    )
    await session.commit()
    return {"ok": True}


@router.get("/requests", response_model=list[ModuleRequestOut])
async def list_module_requests(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ModuleRequestOut]:
    """Distinct pending requests, derived from the audit table.

    "Pending" = requested module_ids with no enabled installed row.
    Disabled (revoked) installs do NOT clear a request — a workspace
    that revoked a skill and later asks for it again should see the
    ask. Latest request per module_id wins for source/requester.
    """
    require_admin(user, action_label="Skill request review")

    rows = (
        await session.scalars(
            select(AuditEntry)
            .where(AuditEntry.action == REQUEST_ACTION)
            .order_by(desc(AuditEntry.timestamp), desc(AuditEntry.id))
        )
    ).all()

    installed = set(
        (
            await session.scalars(
                select(InstalledModule.module_id).where(
                    InstalledModule.enabled.is_(True)
                )
            )
        ).all()
    )

    seen: set[str] = set()
    out: list[ModuleRequestOut] = []
    for r in rows:
        payload = r.payload if isinstance(r.payload, dict) else {}
        module_id = payload.get("module_id") or r.resource_id
        if not module_id or module_id in seen or module_id in installed:
            continue
        seen.add(module_id)
        out.append(
            ModuleRequestOut(
                module_id=module_id,
                source=payload.get("source"),
                source_url=payload.get("source_url"),
                requested_by=payload.get("requested_by"),
                requested_at=r.timestamp.isoformat(),
            )
        )
    return out
