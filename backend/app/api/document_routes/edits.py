from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post("/edits/{edit_id}/accept", response_model=EditResolutionResponse)
async def post_accept_edit(
    edit_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> EditResolutionResponse:
    """Accept a single pending edit. Returns 409 if already resolved."""
    return await _resolve_one(None, edit_id, "accept", session, user)


@router.post("/edits/{edit_id}/reject", response_model=EditResolutionResponse)
async def post_reject_edit(
    edit_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> EditResolutionResponse:
    """Reject a single pending edit. Returns 409 if already resolved."""
    return await _resolve_one(None, edit_id, "reject", session, user)


@router.post(
    "/versions/{version_id}/accept-all", response_model=BulkResolutionResponse
)
async def post_accept_all(
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> BulkResolutionResponse:
    """Accept every pending edit on this version in a single transaction."""
    return await _resolve_all(version_id, "accept_all", session, user)


@router.post(
    "/versions/{version_id}/reject-all", response_model=BulkResolutionResponse
)
async def post_reject_all(
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> BulkResolutionResponse:
    """Reject every pending edit on this version in a single transaction."""
    return await _resolve_all(version_id, "reject_all", session, user)
