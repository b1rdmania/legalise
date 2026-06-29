"""agent-kit eval adapter.

One endpoint implementing the agent-kit HTTP contract
(https://github.com/b1rdmania/agent-kit):

    POST /api/evals/agent
    {"input": {...}, "trace_id": "...", "metadata": {...}}
        → {"output": {...}, "metadata": {"duration_ms": ...}}

The runner asserts only against ``output``. Agent-side failures are
returned as 200 + ``{"error": ...}`` per the contract (preferred over
5xx so telemetry flows through unchanged).

Auth: shared secret in the ``X-Agent-Kit-Secret`` header, matched
against ``settings.agent_kit_secret`` (env ``AGENT_KIT_SECRET``).
Unset secret → 503 (endpoint disabled — same gate-on-unset-config
pattern the old submissions flow used). Wrong secret → 403.

Routing is on ``input.case``. Every case calls the REAL production
function — nothing is re-implemented or faked in the adapter:

- ``posture_refusal``       → ``posture_gate._evaluate_posture`` (the
                              pure policy core the capability gate and
                              its audit wrapper both run)
- ``deterministic_summary`` → ``assistant.pipeline._match_requested_document``
                              (the keyless filename/tag matcher)
- ``chain_intact``          → ``audit_chain.verify_audit_chain``

Read-only: no case mutates anything, so no audit emission (matches
the system bootstrap-state endpoint's read-only convention).
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import verify_audit_chain
from app.core.config import settings
from app.core.db import get_session
from app.core.posture_gate import _evaluate_posture
from app.core.retrieval import search_documents
from app.models.matter import Matter
from app.modules.assistant.pipeline import _match_requested_document


router = APIRouter()


class AgentKitRequest(BaseModel):
    """Request shape of the agent-kit HTTP contract."""

    input: dict[str, Any]
    trace_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


async def _matter_by_slug(session: AsyncSession, slug: str) -> Matter | None:
    """First matter carrying the slug. Slugs are unique per-owner, not
    globally; the eval deployment seeds one demo workspace so first
    match (oldest) is deterministic enough for grading."""
    return await session.scalar(
        select(Matter)
        .where(Matter.slug == slug)
        .order_by(Matter.opened_at)
        .limit(1)
    )


async def _case_posture_refusal(
    session: AsyncSession, inp: dict[str, Any]
) -> dict[str, Any]:
    """Exercise the real posture gate policy core.

    Posture comes from the matter row when ``matter_slug`` is given
    (the honest path — reads the live posture), or directly from
    ``input.posture`` for records that must be deterministic regardless
    of deployment state. Either way the decision itself is made by
    ``_evaluate_posture`` — the same function ``check_posture`` runs
    before any capability — never by adapter logic.
    """
    slug = inp.get("matter_slug")
    if slug:
        matter = await _matter_by_slug(session, slug)
        if matter is None:
            return {"error": f"matter not found for slug {slug!r}"}
        posture = matter.privilege_posture
    else:
        posture = inp.get("posture")
        if not posture:
            return {"error": "posture_refusal needs matter_slug or posture"}

    # The shared secret authenticated this request, so the eval actor
    # is a logged-in actor as far as the gate is concerned. role_satisfies
    # treats None as unauthenticated (always denied); the default token
    # "agent_kit_eval" satisfies any_authenticated and nothing stricter.
    # Records may override (e.g. "qualified_solicitor") to probe role
    # tiers explicitly.
    result = _evaluate_posture(
        posture=posture,
        actor_role=inp.get("actor_role", "agent_kit_eval"),
        firm_role_gates_enabled=settings.firm_role_gates_enabled,
    )
    refused = not result.allowed
    # "posture" is the canonical refusal label for a paused matter;
    # other denials (role-gated B_mixed, unknown posture) surface the
    # gate's own reason string untouched.
    reason: str | None = None
    if refused:
        reason = "posture" if result.reason == "posture_paused" else result.reason
    return {"refused": refused, "reason": reason, "posture": posture}


async def _case_deterministic_summary(
    session: AsyncSession, inp: dict[str, Any]
) -> dict[str, Any]:
    """Run the real keyless document matcher on supplied documents.

    Input: ``user_content`` + ``documents`` ([{filename, tag?, text?}]).
    The matcher only reads ``filename``/``tag`` off each candidate, so
    lightweight stand-ins carry the record's document fixtures into the
    genuine scoring/tie-break logic.
    """
    user_content = inp.get("user_content") or ""
    documents = inp.get("documents")
    if not isinstance(documents, list):
        return {"error": "deterministic_summary needs input.documents (list)"}

    snippets = [
        (
            SimpleNamespace(
                id=doc.get("id") or f"eval-doc-{idx}",
                filename=doc.get("filename", ""),
                tag=doc.get("tag"),
            ),
            doc.get("text", ""),
        )
        for idx, doc in enumerate(documents)
    ]
    matched = _match_requested_document(user_content, snippets)
    return {"matched_document": matched[0].filename if matched else None}


async def _case_chain_intact(
    session: AsyncSession, inp: dict[str, Any]
) -> dict[str, Any]:
    """Verify the audit hash-chain on the requested scope.

    ``matter_slug`` narrows to one matter scope; absent, every scope
    (all matters + system) is verified.
    """
    matter_id = None
    slug = inp.get("matter_slug")
    if slug:
        matter = await _matter_by_slug(session, slug)
        if matter is None:
            return {"error": f"matter not found for slug {slug!r}"}
        matter_id = matter.id

    verification = await verify_audit_chain(session, matter_id=matter_id)
    return {
        "verified": verification.ok,
        "audit_entry_count": verification.audit_entry_count,
        "chain_entry_count": verification.chain_entry_count,
        "scopes_verified": verification.scopes_verified,
        "issues": [issue.code for issue in verification.issues],
    }


async def _case_retrieval_grounding(
    session: AsyncSession, inp: dict[str, Any]
) -> dict[str, Any]:
    """Run the real hybrid retrieval and report what it grounded on.

    This is the grounding/citation eval: it calls the production
    ``search_documents`` (matter-scoped, indexed-chunks-only, keyless
    via fastembed) — the same function every assistant turn runs — and
    returns the sources it found, so a dataset can assert that a real
    question retrieves real passages from real documents in the matter.

    Input: ``matter_slug`` (which matter to search) + ``query`` (the
    question) + optional ``k`` (max hits, default 8). Nothing is
    re-implemented; the adapter only shapes the hits into the contract.

    The retrieval is matter-scoped at the query level, so every returned
    source belongs to the named matter — ``document_ids`` proves which
    documents the answer would have been able to cite. ``well_formed``
    asserts citation integrity: every hit carries a positive char span
    and a score, i.e. an anchorable, rankable passage.
    """
    slug = inp.get("matter_slug")
    if not slug:
        return {"error": "retrieval_grounding needs input.matter_slug"}
    matter = await _matter_by_slug(session, slug)
    if matter is None:
        return {"error": f"matter not found for slug {slug!r}"}

    query = inp.get("query") or ""
    k = inp.get("k", 8)
    if not isinstance(k, int) or k <= 0:
        return {"error": "retrieval_grounding k must be a positive integer"}

    hits = await search_documents(session, matter.id, query, k=k)
    sources = [
        {
            "document_id": str(hit.document_id),
            "char_start": hit.char_start,
            "char_end": hit.char_end,
            "score": hit.score,
        }
        for hit in hits
    ]
    document_ids = list(dict.fromkeys(s["document_id"] for s in sources))
    well_formed = all(
        s["char_end"] > s["char_start"] >= 0 and isinstance(s["score"], (int, float))
        for s in sources
    )
    return {
        "source_count": len(sources),
        "document_ids": document_ids,
        "document_count": len(document_ids),
        "sources": sources,
        "well_formed": well_formed,
    }


_CASES = {
    "posture_refusal": _case_posture_refusal,
    "deterministic_summary": _case_deterministic_summary,
    "chain_intact": _case_chain_intact,
    "retrieval_grounding": _case_retrieval_grounding,
}


@router.post("/agent")
async def agent_eval_endpoint(
    body: AgentKitRequest,
    session: AsyncSession = Depends(get_session),
    x_agent_kit_secret: str | None = Header(default=None),
) -> dict[str, Any]:
    """agent-kit contract endpoint. Routes on ``input.case``."""
    if not settings.agent_kit_secret:
        raise HTTPException(
            status_code=503,
            detail="agent-kit eval adapter disabled: AGENT_KIT_SECRET is not set",
        )
    if x_agent_kit_secret != settings.agent_kit_secret:
        raise HTTPException(status_code=403, detail="invalid X-Agent-Kit-Secret")

    started = time.perf_counter()
    case = body.input.get("case")
    handler = _CASES.get(case)

    def _metadata() -> dict[str, Any]:
        return {
            "model": "deterministic",
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "cost_usd": 0.0,
            "case": case,
        }

    if handler is None:
        known = ", ".join(sorted(_CASES))
        return {
            "error": f"unknown case {case!r} (known: {known})",
            "metadata": _metadata(),
        }

    result = await handler(session, body.input)
    if "error" in result:
        return {"error": result["error"], "metadata": _metadata()}
    return {"output": result, "metadata": _metadata()}
