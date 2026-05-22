"""Pre-Motion router — `POST /api/matters/{slug}/pre-motion/run`.

The Day 5 generic `/invoke` endpoint stays in place for any other plugin
skill; this dedicated route exists because Pre-Motion is the canonical
demonstration of the bespoke-orchestration surface pattern — a four-stage
in-process pipeline with parallel sub-agents — rather than a single skill
invocation.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
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
from app.models import STATUS_ARCHIVED, Matter, User

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
    matter = await resolve_owned_open_matter(session, slug, user.id)
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
    except ProviderKeyMissing as exc:
        raise HTTPException(
            422,
            detail={"error": "provider_key_missing", "provider": exc.provider, "message": str(exc)},
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

    # Cheap-validate matter existence AND privilege posture before kicking off
    # the pipeline. Both checks must happen before StreamingResponse opens so
    # the HTTP status (and the middleware http.post audit row) reflects the
    # outcome. If posture is checked inside the background task, the response
    # has already returned 200 and the audit row reads "successful request"
    # for what posture in fact blocked. The middleware http.post 409 row is
    # the canonical "blocked attempt" provenance for /run as well — SSE must
    # match.
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
                "Matter privilege posture is C_paused — Pre-Motion blocked. "
                "Change posture to A_cleared or B_mixed to run.",
            )
        # Provider-key preflight — fail BEFORE StreamingResponse opens
        # so the middleware http.post row carries the right status. If
        # the route's gone past this point, audit reads 200 even when
        # the SSE error frame is 422.
        #
        # Codex R3 follow-up: defer to gateway.select_provider_name so
        # a B_mixed matter with Ollama registered runs keylessly rather
        # than 422'ing for an Anthropic key it doesn't need. Mirrors the
        # R2 fix applied to tabular_review and contract_review.
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
                            f"Add a {selected_provider} API key in Settings → API Keys to run Pre-Motion."
                        ),
                    },
                )

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def on_event(name: str, payload: dict[str, Any]) -> None:
        await queue.put({"event": name, "data": payload})

    async def run_pipeline() -> None:
        # Own session for the background pipeline. Cannot share the request
        # session because it terminates when this handler returns control to
        # FastAPI to start streaming.
        try:
            async with factory() as bg_session:
                # Re-resolve on the background session. If the matter
                # was archived between the preflight and the pipeline
                # start, treat it the same as "vanished" — the user
                # tombstoned it; the pipeline must not run.
                matter = await bg_session.scalar(
                    select(Matter).where(
                        Matter.slug == slug,
                        Matter.created_by_id == user.id,
                        Matter.status != STATUS_ARCHIVED,
                    )
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
    matter = await resolve_owned_open_matter(session, slug, user.id)
    if result.matter_slug != slug:
        raise HTTPException(
            400,
            f"run envelope matter_slug={result.matter_slug} does not match url slug={slug}",
        )

    # TODO(unit-4-jobs): once Unit 2 migrates /run and /run-stream to durable
    # jobs, add check_generated_artefact to the job-completion path in jobs.py.
    await check_generated_artefact(user.id, session)

    try:
        pdf_bytes = await render_pre_motion_pdf(matter=matter, result=result)
    except RuntimeError as exc:
        raise HTTPException(502, f"PDF render failed: {exc}") from exc

    # Forensic provenance of *what* was rendered. Without a persisted runs
    # table the envelope hash is the only durable handle on the document
    # body — two exports of the same run share a hash; an export of a
    # fabricated envelope is identifiable by its absence elsewhere in the
    # audit log.
    envelope_hash = hashlib.sha256(
        result.model_dump_json(by_alias=False).encode("utf-8")
    ).hexdigest()

    await audit_api.log(
        session,
        "module.pre_motion.pdf.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="pre_motion",
        resource_type="pre-motion",
        resource_id=matter.slug,
        payload={
            "verdict": result.synthesis.verdict,
            "total_token_count": result.total_token_count,
            "byte_size": len(pdf_bytes),
            "envelope_hash": envelope_hash,
        },
    )
    await session.commit()

    filename = f"pre-motion-{matter.slug}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _render_synthesis_markdown(matter: Matter, result: PreMotionRunResult) -> str:
    """Render a PreMotionRunResult to a Word-friendly markdown document.

    Mirrors the section ordering of `pdf._render_html` so the .docx and
    .pdf exports stay informationally equivalent. Heading sections only —
    tables in the PDF collapse to inline run lines here because
    `generate_docx` does not parse markdown tables.
    """
    s = result.synthesis
    lines: list[str] = []
    lines.append(f"matter: {matter.slug} | type: {matter.matter_type}")
    lines.append(
        f"model: {result.model_used} | tokens: {result.total_token_count} | "
        f"duration: {result.total_duration_ms / 1000:.1f}s"
    )
    lines.append("")
    lines.append("## Verdict")
    lines.append("")
    lines.append(f"**{s.verdict.upper()}** — {s.verdict_reasoning}")
    if s.if_we_lose_this_will_be_why:
        lines.append("")
        lines.append(f"> {s.if_we_lose_this_will_be_why}")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(s.summary)

    if s.failure_scenarios:
        lines.append("")
        lines.append("## Failure scenarios")
        lines.append("")
        for fs in s.failure_scenarios:
            line = (
                f"- **{fs.category}** · prob {fs.probability} · impact {fs.impact} — "
                f"{fs.scenario}"
            )
            if fs.mitigation:
                line += f"\n  Mitigation: {fs.mitigation}"
            lines.append(line)

    if result.evidence_flags:
        lines.append("")
        lines.append("## Evidence flags")
        lines.append("")
        for ef in result.evidence_flags:
            lines.append(f"- [{ef.severity}] {ef.flag}")

    if s.evidence_inconsistencies:
        lines.append("")
        lines.append("## Evidence inconsistencies")
        lines.append("")
        for ei in s.evidence_inconsistencies:
            lines.append(f"- [{ei.severity}] {ei.claim} — {ei.issue}")

    if s.blind_spots:
        lines.append("")
        lines.append("## Blind spots")
        lines.append("")
        for bs in s.blind_spots:
            lines.append(f"- {bs}")

    lines.append("")
    lines.append("## Pipeline stages")
    lines.append("")
    for st in result.stages:
        lines.append(
            f"- {st.name}: {st.sub_agent_count} calls · "
            f"{st.duration_ms / 1000:.1f}s · {st.token_count} tok · "
            f"{len(st.errors)} errors"
        )
    return "\n\n".join(lines)


@router.post("/{slug}/pre-motion/docx")
async def export_pre_motion_docx(
    slug: str,
    result: PreMotionRunResult,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> dict:
    """Render a Pre-Motion run envelope to .docx via `generate_docx`.

    Body is the same `PreMotionRunResult` envelope the PDF route accepts
    — runs are not persisted, so the frontend POSTs back the envelope it
    received from `/run`. Writes `module.pre_motion.docx.exported`.
    """
    matter = await resolve_owned_open_matter(session, slug, user.id)
    if result.matter_slug != slug:
        raise HTTPException(
            400,
            f"run envelope matter_slug={result.matter_slug} does not match url slug={slug}",
        )

    # TODO(unit-4-jobs): once Unit 2 migrates /run and /run-stream to durable
    # jobs, add check_generated_artefact to the job-completion path in jobs.py.
    await check_generated_artefact(user.id, session)

    body_markdown = _render_synthesis_markdown(matter, result)
    title = f"Pre-Motion — {matter.title}"

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
                "message": "Failed to write generated pre-motion PDF to object storage.",
            },
        ) from exc

    storage_uri: str = tool_result["storage_uri"]
    byte_count: int = tool_result["byte_count"]
    file_uuid = storage_uri.rsplit("/", 1)[-1].removesuffix(".docx")

    await audit_api.log(
        session,
        "module.pre_motion.docx.exported",
        actor_id=user.id,
        matter_id=matter.id,
        module="pre_motion",
        resource_type="pre-motion",
        resource_id=file_uuid,
        payload={
            "verdict": result.synthesis.verdict,
            "file_uuid": file_uuid,
            "byte_count": byte_count,
            "total_token_count": result.total_token_count,
        },
    )
    await session.commit()

    return {
        "file_uuid": file_uuid,
        "storage_uri": storage_uri,
        "byte_count": byte_count,
        "download_url": f"/api/documents/generated/{file_uuid}",
    }
