"""Pre-Motion router — `POST /api/matters/{slug}/pre-motion/run`.

The Day 5 generic `/invoke` endpoint stays in place for any other plugin
skill; this dedicated route exists because Pre-Motion is the hero module
and runs a four-stage in-process pipeline rather than a single skill
invocation.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
from app.core.auth import current_user
from app.core.db import get_session
from app.core.model_gateway import PrivilegePaused
from app.models import Matter, User

from .pdf import render_pre_motion_pdf
from .pipeline import run_pre_motion
from .schemas import PreMotionRunInputs, PreMotionRunResult


router = APIRouter()


_SSE_SENTINEL: dict[str, Any] = {"__done__": True}


def _sse_format(event: str, data: dict[str, Any]) -> bytes:
    """Format a Server-Sent Event frame. Each frame is `event: <name>\n
    data: <json>\n\n` — EventSource on the client routes by event name."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode("utf-8")


@router.post("/{slug}/pre-motion/run", response_model=PreMotionRunResult)
async def run_pre_motion_endpoint(
    slug: str,
    inputs: PreMotionRunInputs | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> PreMotionRunResult:
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    body = inputs or PreMotionRunInputs()

    try:
        return await run_pre_motion(
            session=session,
            matter=matter,
            actor_id=user.id,
            inputs=body,
        )
    except PrivilegePaused as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/{slug}/pre-motion/run-stream")
async def run_pre_motion_stream(
    slug: str,
    request: Request,
    inputs: PreMotionRunInputs | None = None,
    user: User = Depends(current_user),
) -> StreamingResponse:
    """SSE variant of `/pre-motion/run`. Streams `stage.start` / `stage.end`
    frames as the pipeline progresses, then a final `result` frame containing
    the same envelope `/run` returns.

    Audit semantics are identical: every `model.call` row and the
    `module.pre_motion.run.start` / `.complete` rows land via the existing
    pipeline. The SSE channel is UI-only — if the client drops, the pipeline
    keeps running and the audit rows still commit.
    """
    body = inputs or PreMotionRunInputs()
    factory = request.app.state.session_factory

    # Cheap-validate the matter before kicking off the pipeline. A 404 in the
    # SSE generator would surface as a half-formed stream — better to fail
    # the HTTP request outright when the slug is wrong.
    async with factory() as preflight_session:
        matter_id = await preflight_session.scalar(
            select(Matter.id).where(Matter.slug == slug)
        )
    if matter_id is None:
        raise HTTPException(404, f"matter not found: {slug}")

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def on_event(name: str, payload: dict[str, Any]) -> None:
        await queue.put({"event": name, "data": payload})

    async def run_pipeline() -> None:
        # Own session for the background pipeline. Cannot share the request
        # session because it terminates when this handler returns control to
        # FastAPI to start streaming.
        try:
            async with factory() as bg_session:
                matter = await bg_session.scalar(
                    select(Matter).where(Matter.slug == slug)
                )
                if matter is None:
                    await queue.put({"event": "error", "data": {"message": f"matter vanished: {slug}"}})
                    return
                try:
                    result = await run_pre_motion(
                        session=bg_session,
                        matter=matter,
                        actor_id=user.id,
                        inputs=body,
                        on_event=on_event,
                    )
                except PrivilegePaused as exc:
                    await queue.put({"event": "error", "data": {"message": str(exc), "code": 409}})
                    return
                except Exception as exc:
                    await queue.put({"event": "error", "data": {"message": str(exc)}})
                    return
                await queue.put({"event": "result", "data": result.model_dump()})
        finally:
            await queue.put(_SSE_SENTINEL)

    task = asyncio.create_task(run_pipeline())

    async def event_stream():
        try:
            while True:
                item = await queue.get()
                if item is _SSE_SENTINEL or item.get("__done__"):
                    break
                yield _sse_format(item["event"], item["data"])
        finally:
            # If the client disconnected, don't abort the pipeline — the
            # audit rows must still land. The task keeps running detached.
            if not task.done():
                # Leave it; the pipeline owns its own session and finishes.
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering on Fly/CF
            "Connection": "keep-alive",
        },
    )


@router.post("/{slug}/pre-motion/pdf")
async def export_pre_motion_pdf(
    slug: str,
    result: PreMotionRunResult,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> Response:
    """Render a Pre-Motion run envelope to PDF via Gotenberg.

    v0.1 takes the run envelope in the POST body — runs are not persisted,
    so the frontend POSTs back the same envelope it received from `/run` or
    the `result` SSE frame. An audit row records the export (matter + token
    count + verdict + envelope hash) so the export is forensically visible
    without needing a persisted runs table.
    """
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    if matter is None:
        raise HTTPException(404, f"matter not found: {slug}")

    if result.matter_slug != slug:
        raise HTTPException(
            400,
            f"run envelope matter_slug={result.matter_slug} does not match url slug={slug}",
        )

    try:
        pdf_bytes = await render_pre_motion_pdf(matter=matter, result=result)
    except RuntimeError as exc:
        raise HTTPException(502, f"PDF render failed: {exc}") from exc

    await audit_api.log(
        session,
        "module.pre_motion.pdf.exported",
        actor_id=user.id,
        matter_id=matter.id,
        resource_type="pre-motion",
        resource_id=matter.slug,
        payload={
            "verdict": result.synthesis.verdict,
            "total_token_count": result.total_token_count,
            "byte_size": len(pdf_bytes),
        },
    )
    await session.commit()

    filename = f"pre-motion-{matter.slug}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
