"""Pre-Motion pipeline orchestrator.

Sequencing:
    Stage 1 — OptimisticAnalyst                              (1 call)
    Stage 2 — EvidenceInspector × 3 parallel sub-agents      (3 calls)
    Stage 3 — PremortemAdversary × 4 parallel sub-agents     (4 calls)
    Stage 4 — Synthesiser                                    (1 call)

Total: 9 calls per run.

Stage 2 sub-agents run via asyncio.gather. Stage 3 sub-agents likewise.
Stages run sequentially because each downstream stage uses the upstream
output as input.

Audit: every call writes a `model.call` row via the gateway. The
pipeline itself writes `module.pre_motion.run.start` and
`module.pre_motion.run.complete` semantic rows.

Errors in a single sub-agent do not abort the pipeline. They land in
the run envelope's `StageStatus.errors` list and are skipped by
downstream stages. A run where all sub-agents in a stage failed surfaces
the verdict as borderline with the errors enumerated.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit as audit_api
from app.core.model_gateway import gateway as model_gateway
from app.models import Document, Event, Matter

from .agents import (
    AgentCall,
    EVIDENCE_SUB_AGENTS,
    MatterContext,
    OptimisticAnalyst,
    PREMORTEM_SUB_AGENTS,
    Synthesiser,
)
from .schemas import (
    EvidenceFlag,
    EvidenceInconsistency,
    FailureScenario,
    OptimisticCase,
    PreMotionRunInputs,
    PreMotionRunResult,
    StageStatus,
    SynthesisOutput,
)


async def _build_context(
    session: AsyncSession, matter: Matter, inputs: PreMotionRunInputs
) -> MatterContext:
    documents = list(
        (
            await session.scalars(
                select(Document).where(Document.matter_id == matter.id).order_by(Document.uploaded_at.asc())
            )
        ).all()
    )
    events = list(
        (
            await session.scalars(
                select(Event).where(Event.matter_id == matter.id).order_by(Event.event_date.asc())
            )
        ).all()
    )
    return MatterContext(
        matter=matter,
        documents=documents,
        chronology=events,
        inputs=inputs.model_dump(exclude_none=True),
    )


def _stage_status(name: str, calls: list[AgentCall]) -> StageStatus:
    errors = [c.error for c in calls if c.error]
    return StageStatus(
        name=name,
        sub_agent_count=len(calls),
        duration_ms=sum(c.latency_ms for c in calls),
        token_count=sum(c.token_count for c in calls),
        errors=errors,
    )


def _merge_evidence_flags(calls: list[AgentCall]) -> list[EvidenceFlag]:
    merged: list[EvidenceFlag] = []
    for c in calls:
        if not c.parsed:
            continue
        for raw in c.parsed.get("evidence_flags", []) or []:
            raw.setdefault("category", (c.sub_agent_id or "").replace("_subagent", ""))
            try:
                merged.append(EvidenceFlag(**raw))
            except Exception:
                continue
    return merged


def _merge_failure_scenarios(calls: list[AgentCall]) -> list[FailureScenario]:
    merged: list[FailureScenario] = []
    for c in calls:
        if not c.parsed:
            continue
        for raw in c.parsed.get("failure_scenarios", []) or []:
            try:
                merged.append(FailureScenario(**raw))
            except Exception:
                continue
    return merged


def _coerce_synthesis(parsed: dict | None, errors_above: list[str]) -> SynthesisOutput:
    """Synthesiser output to SynthesisOutput, with a graceful fallback if
    parsing fails or the synthesis call itself errored."""
    if parsed is None:
        return SynthesisOutput(
            verdict="borderline",
            verdict_reasoning="Synthesis call did not return parseable JSON.",
            summary="Pipeline ran but the final synthesis stage could not be parsed. "
                    "Inspect the per-stage outputs and audit log for raw responses.",
            failure_scenarios=[],
            evidence_inconsistencies=[],
            blind_spots=errors_above,
            if_we_lose_this_will_be_why=(
                "We do not yet know — the synthesis stage returned an "
                "unstructured response. Re-run, or read the per-stage output."
            ),
        )
    try:
        return SynthesisOutput(**parsed)
    except Exception as exc:
        return SynthesisOutput(
            verdict="borderline",
            verdict_reasoning=f"Synthesis JSON did not validate: {exc}",
            summary=parsed.get("summary", "") or "Synthesis JSON did not validate against the v0.1 schema.",
            failure_scenarios=[
                FailureScenario(**fs)
                for fs in (parsed.get("failure_scenarios", []) or [])
                if _safe_failure_scenario(fs)
            ],
            evidence_inconsistencies=[
                EvidenceInconsistency(**ei)
                for ei in (parsed.get("evidence_inconsistencies", []) or [])
                if _safe_inconsistency(ei)
            ],
            blind_spots=parsed.get("blind_spots", []) or [],
            if_we_lose_this_will_be_why=parsed.get(
                "if_we_lose_this_will_be_why",
                "(synthesiser did not include the brutal sentence)",
            ),
        )


def _safe_failure_scenario(raw: dict) -> bool:
    try:
        FailureScenario(**raw)
        return True
    except Exception:
        return False


def _safe_inconsistency(raw: dict) -> bool:
    try:
        EvidenceInconsistency(**raw)
        return True
    except Exception:
        return False


async def run_pre_motion(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_id: uuid.UUID | None,
    inputs: PreMotionRunInputs,
) -> PreMotionRunResult:
    """Run the four-stage adversarial premortem against `matter`."""
    started_at = datetime.now(timezone.utc)
    started_perf = time.perf_counter()

    ctx = await _build_context(session, matter, inputs)

    # Start audit row — written and committed before any model call so a
    # crash mid-stage leaves a clear provenance breadcrumb. Each stage
    # commits its own audit rows on completion: model calls cost real
    # money, and the audit log is the canonical record of that spend.
    # A pipeline crash must not vacate the rows for calls already made.
    await audit_api.log(
        session,
        "module.pre_motion.run.start",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="pre-motion",
        resource_id=matter.slug,
        payload={
            "depth": inputs.depth,
            "doc_count": len(ctx.documents),
            "chronology_count": len(ctx.chronology),
        },
    )
    await session.commit()

    # ----- Stage 1: optimistic ---------------------------------------------
    optimistic_call = await OptimisticAnalyst().run(
        ctx=ctx, session=session, gateway=model_gateway, actor_id=actor_id
    )
    optimistic_case = _to_optimistic_case(optimistic_call.parsed)
    await session.commit()

    # ----- Stage 2: evidence inspector × 3 ---------------------------------
    evidence_calls = await asyncio.gather(
        *[
            cls().run(ctx=ctx, session=session, gateway=model_gateway, actor_id=actor_id)
            for cls in EVIDENCE_SUB_AGENTS
        ]
    )
    evidence_flags = _merge_evidence_flags(evidence_calls)
    await session.commit()

    # ----- Stage 3: premortem adversary × 4 --------------------------------
    extra_for_premortem = {
        "evidence_flags": [f.model_dump() for f in evidence_flags],
        "optimistic_case": optimistic_case.model_dump(),
    }
    premortem_calls = await asyncio.gather(
        *[
            cls().run(
                ctx=ctx,
                session=session,
                gateway=model_gateway,
                actor_id=actor_id,
                extra=extra_for_premortem,
            )
            for cls in PREMORTEM_SUB_AGENTS
        ]
    )
    failure_scenarios = _merge_failure_scenarios(premortem_calls)
    await session.commit()

    # ----- Stage 4: synthesiser --------------------------------------------
    extra_for_synth = {
        "optimistic_case": optimistic_case.model_dump(),
        "evidence_flags": [f.model_dump() for f in evidence_flags],
        "failure_scenarios": [fs.model_dump() for fs in failure_scenarios],
    }
    synthesis_call = await Synthesiser().run(
        ctx=ctx,
        session=session,
        gateway=model_gateway,
        actor_id=actor_id,
        extra=extra_for_synth,
    )
    await session.commit()

    upstream_errors = [
        c.error
        for c in [optimistic_call, *evidence_calls, *premortem_calls, synthesis_call]
        if c.error
    ]
    synthesis = _coerce_synthesis(synthesis_call.parsed, upstream_errors)

    # ----- assemble envelope -----------------------------------------------
    total_ms = int((time.perf_counter() - started_perf) * 1000)
    total_tokens = sum(
        c.token_count
        for c in [optimistic_call, *evidence_calls, *premortem_calls, synthesis_call]
    )
    model_used = next(
        (c.model_used for c in [synthesis_call, optimistic_call] if c.model_used),
        "unknown",
    )

    stages = [
        _stage_status("optimistic", [optimistic_call]),
        _stage_status("evidence", evidence_calls),
        _stage_status("premortem", premortem_calls),
        _stage_status("synthesis", [synthesis_call]),
    ]

    result = PreMotionRunResult(
        matter_slug=matter.slug,
        started_at=started_at.isoformat(),
        completed_at=datetime.now(timezone.utc).isoformat(),
        total_duration_ms=total_ms,
        total_token_count=total_tokens,
        model_used=model_used,
        stages=stages,
        optimistic=optimistic_case,
        evidence_flags=evidence_flags,
        synthesis=synthesis,
    )

    # Completion audit row.
    await audit_api.log(
        session,
        "module.pre_motion.run.complete",
        actor_id=actor_id,
        matter_id=matter.id,
        resource_type="pre-motion",
        resource_id=matter.slug,
        payload={
            "verdict": synthesis.verdict,
            "duration_ms": total_ms,
            "token_count": total_tokens,
            "stage_errors": [s.errors for s in stages if s.errors],
        },
    )

    await session.commit()
    return result


def _to_optimistic_case(parsed: dict | None) -> OptimisticCase:
    if parsed is None:
        return OptimisticCase()
    try:
        return OptimisticCase(**parsed)
    except Exception:
        # Best-effort partial — drop anything that doesn't validate.
        try:
            return OptimisticCase(
                key_arguments=parsed.get("key_arguments", []),
                supporting_evidence=parsed.get("supporting_evidence", []),
                expected_counterarguments=parsed.get("expected_counterarguments", []),
                optimistic_outcome=parsed.get("optimistic_outcome", ""),
            )
        except Exception:
            return OptimisticCase()
