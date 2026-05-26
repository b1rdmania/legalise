"""Contract Review — review capability implementation.

The capability:
1. Resolves a matter document by id (read scoped to the grant).
2. Invokes the privilege-posture gate via the Phase 1 substrate.
3. Calls the matter's default provider with a structured prompt.
4. Parses the model output into a typed findings list.
5. Writes a ``findings_pack`` artifact via the Phase 6 artifact helper.
6. Returns ``{findings_artifact_id, findings_count}``.

The audit emissions happen inside the substrate helpers
(``check_or_block``, ``audit_emit_model_invoked``, ``write_artifact``)
— this capability does not emit audit rows directly.

The model call is monkey-patched in the integration test; production
runs route through the matter's configured provider with the user's
API key.
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
from app.core.matter_artifacts import write_artifact
from app.core.phase1_runtime import audit_phase1
from app.models import Document, Matter


MODULE_ID = "examples.contract-review"
CAPABILITY_ID = "review"


@dataclass
class Finding:
    """One flagged clause."""

    clause_id: str
    severity: str  # "low" | "medium" | "high"
    comment: str
    citation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "clause_id": self.clause_id,
            "severity": self.severity,
            "comment": self.comment,
            "citation": self.citation,
        }


@dataclass
class ReviewResult:
    """Capability return shape."""

    findings_artifact_id: str
    findings_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "findings_artifact_id": self.findings_artifact_id,
            "findings_count": self.findings_count,
        }


class ContractReviewModule:
    """Entry point class — the runtime instantiates this once at install.

    Phase 6 keeps the surface tiny: a single ``invoke`` method that
    dispatches the one capability. Larger modules would register
    multiple capabilities here.
    """

    MODULE_ID = MODULE_ID

    async def invoke(
        self,
        capability_id: str,
        *,
        session: AsyncSession,
        matter: Matter,
        actor_user_id: uuid.UUID,
        invocation_id: uuid.UUID,
        args: dict[str, Any],
        provider_call,
    ) -> dict[str, Any]:
        if capability_id != CAPABILITY_ID:
            raise ValueError(
                f"unknown capability {capability_id!r}; "
                f"this module exposes only {CAPABILITY_ID!r}"
            )
        document_id = args.get("document_id")
        if not document_id:
            raise ValueError("review requires args.document_id")
        result = await review_contract(
            session=session,
            matter=matter,
            actor_user_id=actor_user_id,
            invocation_id=invocation_id,
            document_id=uuid.UUID(str(document_id)),
            provider_call=provider_call,
        )
        return result.to_dict()


async def review_contract(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_user_id: uuid.UUID,
    invocation_id: uuid.UUID,
    document_id: uuid.UUID,
    provider_call,
) -> ReviewResult:
    """Run the review pipeline end-to-end.

    ``provider_call`` is a callable that takes ``(prompt, *, system)``
    and returns ``ProviderResponse(text, model_id, provider,
    tokens_in, tokens_out, cost_micros, currency)``. In production
    the MCP host injects the real model gateway; tests inject a
    deterministic stub at the provider-module level so audit
    column shape is identical to production.
    """
    # 1. Resolve document. Read is scoped to the grant — the host
    #    has already checked matter.document.read; we just fetch
    #    the row.
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id, Document.matter_id == matter.id
        )
    )
    if document is None:
        raise ValueError(
            f"document {document_id} not found in matter {matter.id}"
        )

    # 2. Privilege / advice-boundary gate. Records a tier-transition
    #    decision (initial → draft_advice) in the advice_boundary
    #    substrate; the matter's privilege_posture is captured in the
    #    decision's gate_state so reconstruction can render it.
    gate_result = await advice_boundary_check(
        session,
        output_id=str(invocation_id),
        requested_tier=ADVICE_TIER_DRAFT_ADVICE,
        from_tier=None,
        declared_tier_max=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=actor_user_id,
        actor_role="qualified_solicitor",
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
        matter_id=matter.id,
    )
    if not gate_result["allowed"]:
        raise PermissionError(
            f"advice-boundary gate denied: {gate_result['gate_state']!r}"
        )

    # 3. Capability invocation audit. The MCP host wrapper would
    #    normally emit this; the vertical slice bypasses the host
    #    for simplicity so we emit it here.
    await audit_phase1(
        session,
        action="module.capability.invoked",
        primitive="capability",
        actor_id=actor_user_id,
        matter_id=matter.id,
        module_id=MODULE_ID,
        capability_id=CAPABILITY_ID,
        payload={"invocation_id": str(invocation_id), "document_id": str(document_id)},
    )

    # 4. Provider call. The provider_call callable handles the actual
    #    network/model invocation; this module just shapes the prompt
    #    and parses the response.
    prompt = _build_prompt(document)
    system = (
        "You are a UK contract review assistant. Identify clauses "
        "that warrant a solicitor's attention. Return STRICT JSON: "
        '{"findings": [{"clause_id":str,"severity":str,'
        '"comment":str,"citation":str}]}. No prose.'
    )
    response = await provider_call(prompt, system=system)

    # 5. Audit the model invocation with full cost shape.
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

    # 6. Parse findings.
    findings = _parse_findings(response.text)

    # 7. Write findings_pack artifact.
    artifact = await write_artifact(
        session,
        matter=matter,
        capability_id=CAPABILITY_ID,
        module_id=MODULE_ID,
        invocation_id=invocation_id,
        kind="findings_pack",
        payload={"findings": [f.to_dict() for f in findings]},
        actor_user_id=actor_user_id,
    )

    # 8. Completion audit.
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
            "findings_artifact_id": str(artifact.id),
            "findings_count": len(findings),
        },
    )

    return ReviewResult(
        findings_artifact_id=str(artifact.id),
        findings_count=len(findings),
    )


def _build_prompt(document: Document) -> str:
    # Phase 6 keeps prompts inline. A real contract-review module
    # would carry prompt templates as a separate file + version them
    # alongside the module version.
    return (
        f"Review the following contract for clauses warranting "
        f"attention.\n\n"
        f"Document: {document.filename}\n"
        f"Content begins below:\n---\n"
        # Document.body is loaded by the host; the slice keeps it
        # inline here. A real impl would pull from document_body
        # via the matter_context primitive.
        f"(document text omitted in vertical slice prompt template)\n---"
    )


def _parse_findings(text: str) -> list[Finding]:
    """Parse a strict-JSON response into typed Finding rows.

    The provider is instructed to return JSON; we fail closed if it
    doesn't. No findings is a valid outcome — empty list.
    """
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"provider returned non-JSON output: {exc}"
        ) from exc
    raw_findings = payload.get("findings", []) if isinstance(payload, dict) else []
    out: list[Finding] = []
    for entry in raw_findings:
        if not isinstance(entry, dict):
            continue
        out.append(
            Finding(
                clause_id=str(entry.get("clause_id", "")),
                severity=str(entry.get("severity", "low")),
                comment=str(entry.get("comment", "")),
                citation=str(entry.get("citation", "")),
            )
        )
    return out
