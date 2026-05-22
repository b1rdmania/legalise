"""Shared matter resolvers — owner-scoped, archived-aware.

Per HANDOVER_SUBSTRATE_R2_REVIEW.md §Issue 1: every route that operates
on a matter via its slug must return 404 once the matter has been
tombstoned (status=archived). The previous behaviour was that
GET /api/matters/{slug} correctly returned 404 (the matters.py route
checks `status == STATUS_ARCHIVED` explicitly) but module / job /
export / assistant / chronology / letters / pre-motion /
contract-review / tabular-review / case-law routes did not — they
fetched on `Matter.slug + created_by_id` only.

This module centralises the resolver so the archived-matter guard
applies uniformly. Routes that legitimately need to operate on an
archived matter (e.g. the matters.py admin routes themselves) should
not use these helpers and must handle status explicitly.

Returning 404 (not 403) on cross-user / archived / missing is the
codebase convention — it avoids leaking the existence of slugs to
non-owners and avoids exposing the live-vs-archived distinction.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import STATUS_ARCHIVED, Matter


async def resolve_owned_open_matter(
    session: AsyncSession,
    slug: str,
    user_id: uuid.UUID,
) -> Matter:
    """Return the live, user-owned matter for ``slug`` or raise 404.

    Returns 404 (not 403) when:
      - no matter exists with that slug, OR
      - the matter exists but belongs to another user, OR
      - the matter exists and is owned by this user but is archived
        (i.e. tombstoned via DELETE /api/matters/{slug}).

    Use this in every route that operates on a matter's contents,
    documents, chronology, modules, jobs, or exports. Do NOT use it in
    routes that need to inspect archived matters (e.g. the matters.py
    delete / get routes themselves, which handle the archived case
    explicitly).
    """
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug,
            Matter.created_by_id == user_id,
            Matter.status != STATUS_ARCHIVED,
        )
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    return matter


__all__ = ["resolve_owned_open_matter"]
