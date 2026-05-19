"""Tabular review router — CRUD + estimate/run/export, mounted at /api/matters.

Eight endpoints per the delta sheet. Authorisation follows the
`letters_router` pattern: every endpoint loads the matter by
`(slug, created_by_id == user.id)` and 404s otherwise.

Run errors:
    `ReviewRunInProgress`     → 409 review_run_in_progress
    `ValueError("confirm_above_50 required")` → 422
    `PrivilegePaused`         → 409
    `ProviderKeyMissing`      → 422 structured detail
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
from app.core.auth import current_user
from app.core.db import get_session
from app.core.model_gateway import PrivilegePaused, gateway as model_gateway
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.models import Document, Matter, User
from app.models.tabular_review import TabularReview, TabularReviewRow

from .export import export_review_docx
from .runner import ReviewRunInProgress, estimate, run_review
from .schemas import (
    ColumnSpec,
    ExportResponse,
    ReviewCreateRequest,
    ReviewRead,
    ReviewRowRead,
    ReviewSummary,
    ReviewUpdateRequest,
    RunEstimate,
    RunReport,
    RunRequest,
)


router = APIRouter()


async def _require_matter(
    session: AsyncSession, slug: str, user: User
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(Matter.slug == slug, Matter.created_by_id == user.id)
    )
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")
    return matter


async def _require_review(
    session: AsyncSession, review_id: uuid.UUID, matter: Matter
) -> TabularReview:
    review = await session.scalar(
        select(TabularReview).where(
            TabularReview.id == review_id,
            TabularReview.matter_id == matter.id,
        )
    )
    if review is None:
        raise HTTPException(404, f"review not found: {review_id}")
    return review


async def _hydrate_review(
    session: AsyncSession, review: TabularReview, matter: Matter
) -> ReviewRead:
    """Build a ReviewRead with one row per current matter document.

    Lazy row policy (W3 gotcha 2): every current doc is a row. Rows
    without a persisted `tabular_review_rows` entry render as empty.
    """
    docs = list(
        (
            await session.scalars(
                select(Document)
                .where(Document.matter_id == matter.id)
                .order_by(Document.uploaded_at.asc())
            )
        ).all()
    )
    rows = list(
        (
            await session.scalars(
                select(TabularReviewRow).where(
                    TabularReviewRow.review_id == review.id
                )
            )
        ).all()
    )
    by_doc = {r.document_id: r for r in rows}
    out_rows: list[ReviewRowRead] = []
    for doc in docs:
        existing = by_doc.get(doc.id)
        out_rows.append(
            ReviewRowRead(
                document_id=doc.id,
                document_filename=doc.filename,
                extracted_values=dict(existing.extracted_values or {}) if existing else {},
                last_run_at=existing.last_run_at if existing else None,
            )
        )

    cols = [ColumnSpec.model_validate(c) for c in (review.columns_config or [])]
    return ReviewRead(
        id=review.id,
        matter_slug=matter.slug,
        title=review.title,
        columns_config=cols,
        rows=out_rows,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.get("/{slug}/reviews", response_model=list[ReviewSummary])
async def list_reviews(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ReviewSummary]:
    matter = await _require_matter(session, slug, user)
    reviews = list(
        (
            await session.scalars(
                select(TabularReview)
                .where(TabularReview.matter_id == matter.id)
                .order_by(TabularReview.created_at.desc())
            )
        ).all()
    )
    summaries: list[ReviewSummary] = []
    for r in reviews:
        rows_count = await session.scalar(
            select(TabularReviewRow.review_id).where(
                TabularReviewRow.review_id == r.id
            ).limit(1)
        )
        # Cheap last_run_at: max(last_run_at) across rows.
        last_run = await session.scalar(
            select(TabularReviewRow.last_run_at)
            .where(TabularReviewRow.review_id == r.id)
            .order_by(TabularReviewRow.last_run_at.desc().nulls_last())
            .limit(1)
        )
        row_count_val = await session.scalar(
            select(TabularReviewRow.review_id)
            .where(TabularReviewRow.review_id == r.id)
        )
        # Cheap precise count via len of pk rows (small N at v0.1).
        row_ids = (
            await session.scalars(
                select(TabularReviewRow.document_id).where(
                    TabularReviewRow.review_id == r.id
                )
            )
        ).all()
        summaries.append(
            ReviewSummary(
                id=r.id,
                title=r.title,
                column_count=len(r.columns_config or []),
                row_count=len(row_ids),
                last_run_at=last_run,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
        # quiet unused-name warning
        _ = rows_count, row_count_val
    return summaries


@router.post("/{slug}/reviews", response_model=ReviewRead, status_code=201)
async def create_review(
    slug: str,
    body: ReviewCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewRead:
    matter = await _require_matter(session, slug, user)
    review = TabularReview(
        matter_id=matter.id,
        title=body.title,
        created_by_id=user.id,
        columns_config=[c.model_dump() for c in body.columns_config],
    )
    session.add(review)
    await session.flush()
    await audit_api.log(
        session,
        "module.tabular_review.created",
        module="tabular_review",
        actor_id=user.id,
        matter_id=matter.id,
        resource_type="tabular_review",
        resource_id=str(review.id),
        payload={"title": review.title, "column_count": len(review.columns_config or [])},
    )
    await session.commit()
    await session.refresh(review)
    return await _hydrate_review(session, review, matter)


@router.get("/{slug}/reviews/{review_id}", response_model=ReviewRead)
async def get_review(
    slug: str,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewRead:
    matter = await _require_matter(session, slug, user)
    review = await _require_review(session, review_id, matter)
    return await _hydrate_review(session, review, matter)


@router.patch("/{slug}/reviews/{review_id}", response_model=ReviewRead)
async def update_review(
    slug: str,
    review_id: uuid.UUID,
    body: ReviewUpdateRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ReviewRead:
    matter = await _require_matter(session, slug, user)
    review = await _require_review(session, review_id, matter)
    from datetime import datetime, timezone

    changed: dict = {}
    if body.title is not None and body.title != review.title:
        review.title = body.title
        changed["title"] = body.title
    if body.columns_config is not None:
        review.columns_config = [c.model_dump() for c in body.columns_config]
        changed["column_count"] = len(review.columns_config)
    if changed:
        review.updated_at = datetime.now(timezone.utc)
        await audit_api.log(
            session,
            "module.tabular_review.updated",
            module="tabular_review",
            actor_id=user.id,
            matter_id=matter.id,
            resource_type="tabular_review",
            resource_id=str(review.id),
            payload={"changed": list(changed.keys()), **changed},
        )
        await session.commit()
        await session.refresh(review)
    return await _hydrate_review(session, review, matter)


@router.delete("/{slug}/reviews/{review_id}", status_code=204)
async def delete_review(
    slug: str,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    matter = await _require_matter(session, slug, user)
    review = await _require_review(session, review_id, matter)
    await audit_api.log(
        session,
        "module.tabular_review.deleted",
        module="tabular_review",
        actor_id=user.id,
        matter_id=matter.id,
        resource_type="tabular_review",
        resource_id=str(review.id),
        payload={"title": review.title},
    )
    await session.delete(review)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{slug}/reviews/{review_id}/estimate", response_model=RunEstimate)
async def estimate_review(
    slug: str,
    review_id: uuid.UUID,
    body: RunRequest | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> RunEstimate:
    matter = await _require_matter(session, slug, user)
    review = await _require_review(session, review_id, matter)
    req = body or RunRequest()

    documents = list(
        (
            await session.scalars(
                select(Document)
                .where(Document.matter_id == matter.id)
                .order_by(Document.uploaded_at.asc())
            )
        ).all()
    )
    return await estimate(
        session=session,
        review=review,
        documents=documents,
        matter=matter,
        column_keys=req.column_keys,
        document_ids=req.document_ids,
    )


@router.post("/{slug}/reviews/{review_id}/run", response_model=RunReport)
async def run_review_endpoint(
    slug: str,
    review_id: uuid.UUID,
    body: RunRequest | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> RunReport:
    matter = await _require_matter(session, slug, user)
    review = await _require_review(session, review_id, matter)
    req = body or RunRequest()

    try:
        report = await run_review(
            session=session,
            gateway=model_gateway,
            review=review,
            matter=matter,
            actor_id=user.id,
            column_keys=req.column_keys,
            document_ids=req.document_ids,
            confirm_above_50=req.confirm_above_50,
        )
    except ReviewRunInProgress as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={
                "error": "provider_key_missing",
                "provider": exc.provider,
                "message": str(exc),
            },
        ) from exc
    except ProviderUpstreamError as exc:
        raise HTTPException(
            502,
            detail={
                "error": exc.code,
                "provider": exc.provider,
                "upstream_status": exc.upstream_status,
                "message": str(exc),
            },
        ) from exc

    await session.commit()
    return report


@router.post("/{slug}/reviews/{review_id}/export.docx", response_model=ExportResponse)
async def export_review_endpoint(
    slug: str,
    review_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ExportResponse:
    matter = await _require_matter(session, slug, user)
    review = await _require_review(session, review_id, matter)

    file_uuid, byte_count, _storage_uri = await export_review_docx(
        session=session,
        review=review,
        matter=matter,
        actor_id=user.id,
    )
    await session.commit()
    return ExportResponse(
        file_uuid=file_uuid,
        download_url=f"/api/documents/generated/{file_uuid}",
        byte_count=byte_count,
    )
