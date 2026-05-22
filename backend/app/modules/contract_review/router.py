"""Contract Review router — `POST /api/matters/{slug}/contract-review/*`.

Three endpoints:
    POST /run         — non-streaming, returns ContractReviewResult.
    POST /run-stream  — SSE, mirrors Pre-Motion's stream shape.
    POST /docx        — round-trip a ContractReviewResult to a Word doc.

v0.1 does not persist runs. The frontend POSTs the envelope back to /docx
for export. The audit log is the canonical record of every call.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.matter_access import resolve_owned_open_matter
from app.core.limits import check_generated_artefact
from app.core.model_gateway import (
    PrivilegePaused,
    PrivilegePosture,
    gateway as model_gateway,
)
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError, get_user_provider_key
from app.core.storage import StorageWriteError
from app.core.api import audit
from app.models import STATUS_ARCHIVED, Matter, User

from .export import render_contract_review_markdown
from .pipeline import run_contract_review
from .schemas import ContractReviewInputs, ContractReviewResult


router = APIRouter()


_SSE_SENTINEL: dict[str, Any] = {"__done__": True}


def _sse_format(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode("utf-8")


async def _resolve_matter(session: AsyncSession, slug: str, user_id) -> Matter:
    matter = await resolve_owned_open_matter(session, slug, user_id)
    return matter


# ----- POST /run (non-streaming) ------------------------------------------


@router.post("/{slug}/contract-review/run", response_model=ContractReviewResult)
async def run_endpoint(
    slug: str,
    inputs: ContractReviewInputs,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ContractReviewResult:
    matter = await _resolve_matter(session, slug, user.id)
    try:
        return await run_contract_review(
            session=session,
            gateway=model_gateway,
            matter=matter,
            actor_id=user.id,
            inputs=inputs,
        )
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
    except ValueError as exc:
        # Bad document_id / no body / matter / etc.
        raise HTTPException(422, str(exc)) from exc


# ----- POST /run-stream (SSE) ---------------------------------------------


@router.post("/{slug}/contract-review/run-stream")
async def run_stream_endpoint(
    slug: str,
    inputs: ContractReviewInputs,
    request: Request,
    user: User = Depends(current_user),
) -> StreamingResponse:
    """SSE variant. Mirrors Pre-Motion's pattern: posture + provider-key
    preflight before opening the stream, then a background task that owns
    its own session and emits stage.start / stage.end / result / error
    frames. Audit rows always land even on client disconnect."""
    factory = request.app.state.session_factory

    async with factory() as preflight_session:
        row = (
            await preflight_session.execute(
                select(
                    Matter.id, Matter.privilege_posture, Matter.default_model_id
                ).where(
                    Matter.slug == slug,
                    Matter.created_by_id == user.id,
                    Matter.status != STATUS_ARCHIVED,
                )
            )
        ).first()
        if row is None:
            # Missing, cross-user, or archived — 404 per repo convention.
            raise HTTPException(404, f"matter not found: {slug}")
        _, posture_value, default_model_id = row
        if PrivilegePosture(posture_value) is PrivilegePosture.C_PAUSED:
            raise HTTPException(
                409,
                "Matter privilege posture is C_paused — Contract review blocked. "
                "Change posture to A_cleared or B_mixed to run.",
            )
        # Codex R2: defer to the gateway's own routing rather than
        # demanding a key for `claude-*` outright — Ollama on a B_mixed
        # matter should run keylessly.
        selected_provider = model_gateway.select_provider_name(
            default_model_id, PrivilegePosture(posture_value)
        )
        if model_gateway.is_keyed_provider(selected_provider):
            user_key = await get_user_provider_key(
                preflight_session, user.id, selected_provider
            )
            fallback_allowed = (
                settings.environment in {"development", "dev", "local"}
                and settings.allow_server_key_fallback
            )
            if user_key is None and not fallback_allowed:
                raise HTTPException(
                    422,
                    detail={
                        "error": "provider_key_missing",
                        "provider": selected_provider,
                        "message": (
                            f"Add a {selected_provider} API key in Settings → API Keys to run Contract review."
                        ),
                    },
                )

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def on_event(name: str, payload: dict[str, Any]) -> None:
        await queue.put({"event": name, "data": payload})

    async def run_bg() -> None:
        try:
            async with factory() as bg_session:
                # Re-resolve on the background session. Archived between
                # preflight and pipeline start = treat as vanished.
                matter = await bg_session.scalar(
                    select(Matter).where(
                        Matter.slug == slug,
                        Matter.created_by_id == user.id,
                        Matter.status != STATUS_ARCHIVED,
                    )
                )
                if matter is None:
                    await queue.put(
                        {"event": "error", "data": {"message": f"matter vanished: {slug}"}}
                    )
                    return
                try:
                    result = await run_contract_review(
                        session=bg_session,
                        gateway=model_gateway,
                        matter=matter,
                        actor_id=user.id,
                        inputs=inputs,
                        on_event=on_event,
                    )
                except PrivilegePaused as exc:
                    await queue.put(
                        {"event": "error", "data": {"message": str(exc), "code": 409}}
                    )
                    return
                except ProviderKeyMissing as exc:
                    await queue.put(
                        {
                            "event": "error",
                            "data": {
                                "message": str(exc),
                                "code": 422,
                                "error": "provider_key_missing",
                                "provider": exc.provider,
                            },
                        }
                    )
                    return
                except ProviderUpstreamError as exc:
                    await queue.put(
                        {
                            "event": "error",
                            "data": {
                                "message": str(exc),
                                "code": 502,
                                "error": exc.code,
                                "provider": exc.provider,
                                "upstream_status": exc.upstream_status,
                            },
                        }
                    )
                    return
                except ValueError as exc:
                    await queue.put(
                        {"event": "error", "data": {"message": str(exc), "code": 422}}
                    )
                    return
                except Exception as exc:  # noqa: BLE001
                    await queue.put({"event": "error", "data": {"message": str(exc)}})
                    return
                await queue.put({"event": "result", "data": result.model_dump()})
        finally:
            await queue.put(_SSE_SENTINEL)

    task = asyncio.create_task(run_bg())

    async def event_stream():
        try:
            while True:
                item = await queue.get()
                if item is _SSE_SENTINEL or item.get("__done__"):
                    break
                yield _sse_format(item["event"], item["data"])
        finally:
            if not task.done():
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ----- POST /docx ----------------------------------------------------------


@router.post("/{slug}/contract-review/docx")
async def export_docx(
    slug: str,
    result: ContractReviewResult,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """Render a ContractReviewResult to .docx via `generate_docx`.

    Body is the run envelope — runs are not persisted in v0.1, so the
    frontend POSTs back what it received from `/run` or the `result` SSE
    frame. Writes `module.contract_review.docx.exported`.
    """
    matter = await _resolve_matter(session, slug, user.id)
    if result.matter_slug != slug:
        raise HTTPException(
            400,
            f"run envelope matter_slug={result.matter_slug} does not match url slug={slug}",
        )

    # TODO(unit-4-jobs): once Unit 2 migrates /run and /run-stream to durable
    # jobs, add check_generated_artefact to the job-completion path in jobs.py.
    await check_generated_artefact(user.id, session)

    body_markdown = render_contract_review_markdown(matter, result)
    title = f"Contract review — {result.document_filename or matter.title}"

    try:
        tool_result = await model_gateway.invoke_tool(
            "generate_docx",
            session=session,
            actor_id=user.id,
            matter_id=matter.id,
            inputs={
                "title": title,
                "body_markdown": body_markdown,
                "options": {
                    "matter_id": str(matter.id),
                    "matter_slug": matter.slug,
                },
            },
        )
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc
    except StorageWriteError as exc:
        raise HTTPException(
            502,
            detail={
                "error": "storage_write_failed",
                "message": "Failed to write generated contract review to object storage.",
            },
        ) from exc

    storage_uri: str = tool_result["storage_uri"]
    byte_count: int = tool_result["byte_count"]
    file_uuid = storage_uri.rsplit("/", 1)[-1].removesuffix(".docx")

    envelope_hash = hashlib.sha256(
        result.model_dump_json(by_alias=False).encode("utf-8")
    ).hexdigest()

    await audit.log(
        session,
        "module.contract_review.docx.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="contract_review",
        resource_type="contract-review",
        resource_id=file_uuid,
        payload={
            "file_uuid": file_uuid,
            "byte_count": byte_count,
            "envelope_hash": envelope_hash,
            "document_id": result.document_id,
            "document_filename": result.document_filename,
            "total_token_count": result.total_token_count,
            "clause_count": len(result.parsed.clauses),
            "redline_count": len(result.redlines),
        },
    )
    await session.commit()

    return {
        "file_uuid": file_uuid,
        "storage_uri": storage_uri,
        "byte_count": byte_count,
        "download_url": f"/api/documents/generated/{file_uuid}",
    }
