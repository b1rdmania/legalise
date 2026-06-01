"""Contract Review — review capability implementation.

The capability:
1. Resolves a matter document by id (read scoped to the grant).
2. Invokes the privilege-posture gate via the substrate.
3. Calls the matter's default provider with a structured prompt.
4. Parses the model output into a typed findings list.
5. Writes a ``findings_pack`` artifact via the artifact helper.
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

from app.core.advice_boundary import (
    AdviceBoundaryDenied,
    check as advice_boundary_check,
)
from app.core.advice_boundary.tiers import ADVICE_TIER_DRAFT_ADVICE
from app.core.audit_cost import audit_emit_model_invoked
from app.core.capabilities import require_capability
from app.core.matter_artifacts import write_artifact
from app.core.phase1_runtime import audit_phase1
from app.core.posture_gate import PostureBlocked, check_posture
from app.core.runtime import InvocationContext
from app.core.source_anchors import build_document_anchor
from app.models import Document, DocumentBody, Matter
from app.models.document_body import BODY_KIND_EXTRACTED


MODULE_ID = "examples.contract-review"
CAPABILITY_ID = "review"

# Server-trusted capability strings this module exercises at runtime.
CAP_READ = "matter.document.read"
CAP_WRITE = "matter.artifact.write"


@dataclass
class Finding:
    """One flagged clause."""

    clause_id: str
    severity: str  # "low" | "medium" | "high"
    comment: str
    citation: str
    source_handles: list[str] | None = None
    quote: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "clause_id": self.clause_id,
            "severity": self.severity,
            "comment": self.comment,
            "citation": self.citation,
        }
        if self.source_handles:
            out["source_handles"] = self.source_handles
        if self.quote:
            out["quote"] = self.quote
        return out


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

    The surface is intentionally tiny: a single ``invoke`` method that
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
        context: InvocationContext,
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
            context=context,
            document_id=uuid.UUID(str(document_id)),
            provider_call=provider_call,
        )
        return result.to_dict()


async def review_contract(
    *,
    session: AsyncSession,
    matter: Matter,
    context: InvocationContext,
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

    ``context`` is an ``InvocationContext`` populated by the host.
    The module reads ``actor_role`` from it; the module CANNOT
    construct its own role claim. This closes the Reviewer R2 P1 #3
    finding: a module that picked ``actor_role="qualified_solicitor"``
    directly would have bypassed the advice-boundary trust contract.
    """
    actor_user_id = context.actor_user_id
    invocation_id = context.invocation_id

    # 0. Posture gate — fires BEFORE require_capability so a
    #    non-solicitor on a B_mixed matter gets a posture-shaped
    #    denial, not a grant-shaped one.
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

    # 1. Enforce read grant BEFORE touching the document. require_capability
    #    raises CapabilityDenied (caught upstream as 403) and writes the
    #    canonical module.capability.denied audit row.
    #
    #    Reviewer R2 P1 #2 + R3: grants must be enforced at the capability
    #    boundary AND matter-scoped — a grant for matter A must not
    #    authorise matter B. ``matter_id=matter.id`` makes the lookup
    #    match grants whose ``granted_permissions_snapshot.matter_id``
    #    equals this matter's id; cross-matter grants are denied.
    await require_capability(
        session,
        user_id=actor_user_id,
        plugin=MODULE_ID,
        skill=CAPABILITY_ID,
        capability=CAP_READ,
        matter_id=matter.id,
    )

    # 2. Resolve document + load its body. Reviewer R2 P2: previously
    #    the prompt said "document text omitted" — the slice now reads
    #    the extracted text so the model call is over real bytes.
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id, Document.matter_id == matter.id
        )
    )
    if document is None:
        raise ValueError(
            f"document {document_id} not found in matter {matter.id}"
        )
    body = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document_id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    document_text = body.extracted_text if body is not None else ""

    # 3. Privilege / advice-boundary gate. ``actor_role`` is the
    #    host-derived value from InvocationContext — the module
    #    does NOT pick its own role here.
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
        raise AdviceBoundaryDenied(gate_result)

    # 4. Capability invocation audit.
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

    # 5. Provider call over real document content.
    prompt = _build_prompt(document, document_text)
    system = (
        "You are a UK contract review assistant. Identify clauses "
        "that warrant a solicitor's attention. Return STRICT JSON: "
        '{"findings": [{"clause_id":str,"severity":str,'
        '"comment":str,"citation":str,'
        '"source_handles":["D1"],"quote":"verbatim excerpt"}]}. '
        "Use source_handles only from the document handles in the prompt. "
        "No prose."
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

    # 7. Enforce write grant BEFORE creating the artifact. Same matter
    #    scoping as the read check (Reviewer R3): the write grant must
    #    carry this matter's id in its snapshot.
    await require_capability(
        session,
        user_id=actor_user_id,
        plugin=MODULE_ID,
        skill=CAPABILITY_ID,
        capability=CAP_WRITE,
        matter_id=matter.id,
    )

    # 8. Write findings_pack artifact.
    artifact = await write_artifact(
        session,
        matter=matter,
        capability_id=CAPABILITY_ID,
        module_id=MODULE_ID,
        invocation_id=invocation_id,
        kind="findings_pack",
        payload={
            "findings": [f.to_dict() for f in findings],
            **_build_source_payload(document, document_text, findings),
        },
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


def _build_prompt(document: Document, document_text: str) -> str:
    """Build the review prompt over the document's extracted text.

    Reviewer R2 P2: previously the prompt template said "document
    text omitted", which made the substantive-review claim false.
    The slice now passes the DocumentBody.extracted_text into the
    prompt — the model call is over real bytes, even though tests
    monkey-patch the provider response.

    If extraction never ran (``document_text`` is empty), the
    prompt notes that explicitly so the model isn't misled. A
    production module would raise instead; the slice tolerates
    missing extraction because the integration test seeds a body
    explicitly.
    """
    if not document_text:
        body_block = "(no extracted text available for this document)"
    else:
        body_block = document_text
    return (
        f"Review the following contract for clauses warranting "
        f"attention.\n\n"
        "Document handle: D1\n"
        f"Document: {document.filename}\n"
        f"Content begins below:\n---\n"
        f"{body_block}\n---"
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
        raw_handles = entry.get("source_handles")
        source_handles = (
            [str(h) for h in raw_handles if isinstance(h, str)]
            if isinstance(raw_handles, list)
            else None
        )
        out.append(
            Finding(
                clause_id=str(entry.get("clause_id", "")),
                severity=str(entry.get("severity", "low")),
                comment=str(entry.get("comment", "")),
                citation=str(entry.get("citation", "")),
                source_handles=source_handles or None,
                quote=str(entry["quote"]) if entry.get("quote") else None,
            )
        )
    return out


def _build_source_payload(
    document: Document,
    document_text: str,
    findings: list[Finding],
) -> dict[str, Any]:
    """Build the structured Source Anchors payload for Contract Review.

    Contract Review v1 operates on exactly one document. The model may
    cite the handle ``D1`` and suggest a quote, but server code fills
    the real document identity and checks whether the quote occurs in
    the extracted body. Unknown handles are ignored. There is no
    verified/proven flag.
    """
    anchors: list[dict[str, Any]] = [
        build_document_anchor(
            anchor_id="src_d1",
            document_id=str(document.id),
            filename=document.filename,
            sha256=document.sha256,
            body_text=document_text,
        )
    ]
    claims: list[dict[str, Any]] = []
    quote_n = 0
    for idx, finding in enumerate(findings, start=1):
        anchor_ids: list[str] = []
        if finding.source_handles and "D1" in finding.source_handles:
            anchor_ids.append("src_d1")
            if finding.quote:
                quote_n += 1
                quote_id = f"src_q{quote_n}"
                anchors.append(
                    build_document_anchor(
                        anchor_id=quote_id,
                        document_id=str(document.id),
                        filename=document.filename,
                        sha256=document.sha256,
                        body_text=document_text,
                        quote=finding.quote,
                    )
                )
                anchor_ids.append(quote_id)
        claim_text = finding.comment or finding.citation or finding.clause_id
        if claim_text:
            claims.append(
                {
                    "id": f"finding_{idx}",
                    "text": claim_text,
                    "anchor_ids": anchor_ids,
                }
            )
    return {"source_anchors": anchors, "claims": claims}
