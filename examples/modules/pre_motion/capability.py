"""Pre-Motion — draft_motion capability implementation.

The capability follows the canonical order Contract Review pinned
in Phase 6 R2, extended for multi-document input + multi-artifact
output:

  0. check_posture(matter, actor_role)
  1. require_capability(matter.document.read, matter_id=matter.id)
  2. Validate args (claim_type enum + non-empty document_ids)
  3. Load every document — every id must belong to the matter
  4. advice_boundary.check(requested_tier=draft_advice, matter_id=matter.id)
  5. audit_phase1("module.capability.invoked")
  6. provider_call(prompt) — prompt embeds claim_type + concat docs
  7. audit_emit_model_invoked(...) with cost columns
  8. Parse {motion, evidence}
  9. require_capability(matter.artifact.write, matter_id=matter.id)
 10. write_artifact(kind="motion_draft")
 11. write_artifact(kind="evidence_list")
 12. audit_phase1("module.capability.completed")
 13. Return DraftMotionResult

Args (validated in code; documented in README — no manifest
args_schema field per Phase 9 v2 Decision #6):

- ``claim_type``: one of ``"breach_of_contract"``,
  ``"misrepresentation"``, ``"unfair_dismissal"``.
- ``document_ids``: list of UUIDs, ≥1, all belonging to the matter.

Provider call is monkey-patched at the capability boundary in
tests (same seam Contract Review uses).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary import check as advice_boundary_check
from app.core.advice_boundary.tiers import ADVICE_TIER_DRAFT_ADVICE
from app.core.audit_cost import audit_emit_model_invoked
from app.core.capabilities import require_capability
from app.core.matter_artifacts import write_artifact
from app.core.phase1_runtime import audit_phase1
from app.core.posture_gate import PostureBlocked, check_posture
from app.core.runtime import InvocationContext, ProviderResponse
from app.models import Document, DocumentBody, Matter


MODULE_ID = "examples.pre-motion"
CAPABILITY_ID = "draft_motion"

# Server-trusted capability strings exercised at runtime.
CAP_READ = "matter.document.read"
CAP_WRITE = "matter.artifact.write"

# Module-defined claim-type vocabulary. README documents it; the
# capability validates it. No host-side enforcement (no args_schema
# manifest field — Phase 9 v2 Decision #6).
CLAIM_TYPES: frozenset[str] = frozenset(
    {"breach_of_contract", "misrepresentation", "unfair_dismissal"}
)


@dataclass
class EvidenceItem:
    """One evidence record in the evidence_list artifact."""

    document_id: str
    relevance: str
    citation_hint: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "document_id": self.document_id,
            "relevance": self.relevance,
            "citation_hint": self.citation_hint,
        }


@dataclass
class DraftMotionResult:
    """Capability return shape."""

    motion_artifact_id: str
    evidence_artifact_id: str
    evidence_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "motion_artifact_id": self.motion_artifact_id,
            "evidence_artifact_id": self.evidence_artifact_id,
            "evidence_count": self.evidence_count,
        }


class PreMotionModule:
    """Entry point class — the runtime instantiates this at install."""

    MODULE_ID = MODULE_ID

    async def invoke(
        self,
        capability_id: str,
        *,
        session: AsyncSession,
        matter: Matter,
        context: InvocationContext,
        args: dict[str, Any],
        provider_call,
    ) -> dict[str, Any]:
        if capability_id != CAPABILITY_ID:
            raise ValueError(
                f"unknown capability {capability_id!r}; "
                f"this module exposes only {CAPABILITY_ID!r}"
            )
        result = await draft_motion(
            session=session,
            matter=matter,
            context=context,
            claim_type=args.get("claim_type"),
            document_ids=args.get("document_ids") or [],
            provider_call=provider_call,
        )
        return result.to_dict()


async def draft_motion(
    *,
    session: AsyncSession,
    matter: Matter,
    context: InvocationContext,
    claim_type: str,
    document_ids: list,
    provider_call,
) -> DraftMotionResult:
    """Draft a pre-motion against a matter using N supporting documents.

    See module docstring for the canonical execution order. The two
    artifacts (motion_draft + evidence_list) land under the same
    ``invocation_id`` with distinct ``kind`` values — the substrate
    permits this via Phase 6's UNIQUE(invocation_id, kind).
    """
    actor_user_id = context.actor_user_id
    invocation_id = context.invocation_id

    # 0. Posture gate.
    posture = await check_posture(
        session,
        matter=matter,
        actor_user_id=actor_user_id,
        actor_role=context.actor_role,
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
    )
    if not posture.allowed:
        raise PostureBlocked(posture)

    # 1. Args validation — module enforces, no manifest schema.
    if claim_type not in CLAIM_TYPES:
        raise ValueError(
            f"unknown claim_type {claim_type!r}; valid: {sorted(CLAIM_TYPES)}"
        )
    if not document_ids:
        raise ValueError("document_ids must be non-empty")
    document_uuids: list[uuid.UUID] = []
    for raw in document_ids:
        try:
            document_uuids.append(uuid.UUID(str(raw)))
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"document_ids contains non-UUID value: {raw!r}"
            ) from exc

    # 2. Read grant (matter-scoped).
    await require_capability(
        session,
        user_id=actor_user_id,
        plugin=MODULE_ID,
        skill=CAPABILITY_ID,
        capability=CAP_READ,
        matter_id=matter.id,
    )

    # 3. Resolve every document; every id must belong to the matter.
    documents: list[tuple[Document, str]] = []
    for doc_id in document_uuids:
        document = await session.scalar(
            select(Document).where(
                Document.id == doc_id, Document.matter_id == matter.id
            )
        )
        if document is None:
            raise ValueError(
                f"document {doc_id} not found in matter {matter.id}"
            )
        body = await session.scalar(
            select(DocumentBody).where(DocumentBody.document_id == doc_id)
        )
        documents.append((document, body.extracted_text if body else ""))

    # 4. Advice-boundary gate. Same shape Contract Review uses.
    gate_result = await advice_boundary_check(
        session,
        output_id=str(invocation_id),
        requested_tier=ADVICE_TIER_DRAFT_ADVICE,
        from_tier=None,
        declared_tier_max=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=actor_user_id,
        actor_role=context.actor_role,
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
        matter_id=matter.id,
    )
    if not gate_result["allowed"]:
        raise PermissionError(
            f"advice-boundary gate denied: {gate_result['gate_state']!r}"
        )

    # 5. Capability invocation audit.
    await audit_phase1(
        session,
        action="module.capability.invoked",
        primitive="capability",
        actor_id=actor_user_id,
        matter_id=matter.id,
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
        payload={
            "invocation_id": str(invocation_id),
            "claim_type": claim_type,
            "document_ids": [str(d.id) for d, _ in documents],
        },
    )

    # 6. Provider call.
    prompt = _build_prompt(claim_type=claim_type, documents=documents)
    system = (
        "You are a UK litigation assistant drafting pre-motion work "
        "product. Return STRICT JSON: "
        '{"motion": {"markdown": str, "claim_summary": str}, '
        '"evidence": [{"document_id": str, "relevance": str, '
        '"citation_hint": str}]}. No prose.'
    )
    response = await provider_call(prompt, system=system)

    # 7. Cost audit.
    await audit_emit_model_invoked(
        session,
        matter_id=matter.id,
        actor_user_id=actor_user_id,
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
        model_id=response.model_id,
        provider=response.provider,
        tokens_in=response.tokens_in,
        tokens_out=response.tokens_out,
        cost_micros=response.cost_micros,
        currency=response.currency,
        payload_extra={"invocation_id": str(invocation_id)},
    )

    # 8. Parse the two structures from the response.
    motion_payload, evidence_items = _parse_response(response.text)

    # 9. Write grant (matter-scoped) — checked AFTER the model call
    #    per Phase 6 R2 ordering (read first, write before persistence).
    await require_capability(
        session,
        user_id=actor_user_id,
        plugin=MODULE_ID,
        skill=CAPABILITY_ID,
        capability=CAP_WRITE,
        matter_id=matter.id,
    )

    # 10. Motion draft artifact.
    motion_artifact = await write_artifact(
        session,
        matter=matter,
        capability_id=CAPABILITY_ID,
        module_id=MODULE_ID,
        invocation_id=invocation_id,
        kind="motion_draft",
        payload={
            "claim_type": claim_type,
            "markdown": motion_payload.get("markdown", ""),
            "claim_summary": motion_payload.get("claim_summary", ""),
        },
        actor_user_id=actor_user_id,
    )

    # 11. Evidence list artifact — same invocation_id, different kind.
    evidence_artifact = await write_artifact(
        session,
        matter=matter,
        capability_id=CAPABILITY_ID,
        module_id=MODULE_ID,
        invocation_id=invocation_id,
        kind="evidence_list",
        payload={"evidence": [e.to_dict() for e in evidence_items]},
        actor_user_id=actor_user_id,
    )

    # 12. Completion audit.
    await audit_phase1(
        session,
        action="module.capability.completed",
        primitive="capability",
        actor_id=actor_user_id,
        matter_id=matter.id,
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
        payload={
            "invocation_id": str(invocation_id),
            "motion_artifact_id": str(motion_artifact.id),
            "evidence_artifact_id": str(evidence_artifact.id),
            "evidence_count": len(evidence_items),
        },
    )

    return DraftMotionResult(
        motion_artifact_id=str(motion_artifact.id),
        evidence_artifact_id=str(evidence_artifact.id),
        evidence_count=len(evidence_items),
    )


def _build_prompt(
    *,
    claim_type: str,
    documents: list,
) -> str:
    """Concat document text with claim-type framing.

    Phase 9 keeps prompts inline. A future module-author guide may
    extract prompt templates as a separate file alongside the module
    version.
    """
    body_blocks: list[str] = []
    for doc, text in documents:
        if not text:
            text = "(no extracted text)"
        body_blocks.append(
            f"--- Document: {doc.filename} (id={doc.id}) ---\n{text}\n"
        )
    return (
        f"Draft a pre-motion for a UK {claim_type!r} claim. "
        f"Identify the supporting evidence from the documents below.\n\n"
        + "\n".join(body_blocks)
    )


def _parse_response(text: str) -> tuple[dict[str, Any], list[EvidenceItem]]:
    """Parse strict-JSON model output into motion + evidence shapes.

    Fails closed (ValueError) if the model returned non-JSON. Empty
    evidence is a valid outcome.
    """
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"provider returned non-JSON output: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise ValueError(
            f"provider output must be a JSON object; got {type(payload).__name__}"
        )
    motion_raw = payload.get("motion", {})
    if not isinstance(motion_raw, dict):
        motion_raw = {}
    evidence_raw = payload.get("evidence", [])
    if not isinstance(evidence_raw, list):
        evidence_raw = []
    evidence_items: list[EvidenceItem] = []
    for entry in evidence_raw:
        if not isinstance(entry, dict):
            continue
        evidence_items.append(
            EvidenceItem(
                document_id=str(entry.get("document_id", "")),
                relevance=str(entry.get("relevance", "")),
                citation_hint=str(entry.get("citation_hint", "")),
            )
        )
    return motion_raw, evidence_items
