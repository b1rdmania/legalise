"""Prompt runtime — host-side executor for ``runtime: "prompt"`` modules.

A prompt module carries its instructions (and optional non-script
reference text) inline in the manifest entrypoint (``prompt_source:
"manifest"``). Unlike a native module, there is no Python entrypoint to
import — the host itself builds a model prompt from the manifest
instructions + permitted matter/document context + user args, calls the
existing model gateway, and writes the result as a matter artifact.

This is the third runtime alongside ``native`` and ``mcp``. It uses the
SAME governance seams as a native capability — posture gate, per-matter
read/write grants, advice-boundary gate, the model gateway adapter, and
the Phase 1 audit helpers. It bypasses none of them. Imported Lawve
``SKILL.md`` files become governed modules through this path.

The executor mirrors the canonical invocation order in
``examples/modules/contract_review/capability.py``:

0. posture gate (only if declared in ``gates``)
1. read grants enforced BEFORE loading any document
2. advice-boundary gate
3. ``module.capability.invoked`` audit
4. provider call (over instructions + references + permitted context)
5. ``model.invoked`` audit (cost shape)
6. write grants enforced BEFORE writing the artifact
7. ``skill_response`` artifact write
8. ``module.capability.completed`` audit
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary import (
    AdviceBoundaryDenied,
    check as advice_boundary_check,
)
from app.core.source_anchors import build_document_anchor
from app.models.document_body import BODY_KIND_EXTRACTED
from app.core.advice_boundary.tiers import ADVICE_TIER_DRAFT_ADVICE
from app.core.audit_cost import audit_emit_model_invoked
from app.core.capabilities import require_capability
from app.core.matter_artifacts import write_artifact
from app.core.phase1_runtime import audit_phase1
from app.core.posture_gate import PostureBlocked, check_posture
from app.core.runtime import InvocationContext, ProviderCallable
from app.models import Document, DocumentBody, InstalledModule, Matter

# Single, consistent artifact kind for prompt-runtime output (Build Brief
# — "pick one and use consistently").
ARTIFACT_KIND = "skill_response"

# How a caller asks the skill to read matter documents. Reading only
# happens when these args are present AND the capability declares reads.
_DOC_ARG_KEYS = ("document_ids", "document_id")
_POSTURE_GATE = "privilege_posture"
_JSON_FENCE_RE = re.compile(
    r"```(?:json)?\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)


def _coerce_document_ids(args: dict[str, Any]) -> list[uuid.UUID]:
    """Pull document ids out of the invocation args. Accepts a single
    ``document_id`` or a list ``document_ids``. Bad ids raise ValueError
    (translated to 422 at the endpoint)."""
    raw: list[Any] = []
    if isinstance(args.get("document_ids"), list):
        raw = list(args["document_ids"])
    elif args.get("document_id") is not None:
        raw = [args["document_id"]]
    out: list[uuid.UUID] = []
    for value in raw:
        try:
            out.append(uuid.UUID(str(value)))
        except (ValueError, AttributeError) as exc:
            raise ValueError(f"invalid document id {value!r}") from exc
    return out


async def _load_documents(
    session: AsyncSession, matter: Matter, document_ids: list[uuid.UUID]
) -> list[dict[str, Any]]:
    """Load matter-scoped documents as structured context blocks, each with
    a stable handle (``D1``, ``D2``, …) the prompt can cite and the runtime
    can map back to a server-known source anchor.

    A document id that doesn't belong to this matter is rejected — the
    matter scope is enforced here as well as by the grant.
    """
    docs: list[dict[str, Any]] = []
    for idx, doc_id in enumerate(document_ids, start=1):
        document = await session.scalar(
            select(Document).where(
                Document.id == doc_id, Document.matter_id == matter.id
            )
        )
        if document is None:
            raise ValueError(
                f"document {doc_id} not found in matter {matter.id}"
            )
        # Source-anchor integrity (Source Anchors v1 redline P1): a document
        # may have multiple body rows (extracted / redacted / summary). The
        # anchor must hash and cite the EXTRACTED body, not whichever row
        # SQL returns first; otherwise quote checks and body_sha256 could
        # silently reference a redacted or derivative copy.
        body = await session.scalar(
            select(DocumentBody).where(
                DocumentBody.document_id == doc_id,
                DocumentBody.kind == BODY_KIND_EXTRACTED,
            )
        )
        docs.append(
            {
                "handle": f"D{idx}",
                "document_id": str(document.id),
                "filename": document.filename,
                "sha256": document.sha256,
                "body_text": body.extracted_text if body is not None else "",
            }
        )
    return docs


def _build_prompt(
    *,
    module_id: str,
    capability_id: str,
    references: list[dict[str, Any]],
    document_blocks: list[dict[str, Any]],
    args: dict[str, Any],
) -> str:
    """Assemble the user-side prompt. The skill instructions are sent as
    the system prompt; this is the contextual material around them."""
    parts: list[str] = [f"Skill: {module_id} / {capability_id}"]

    for ref in references:
        path = ref.get("path", "reference")
        content = ref.get("content", "")
        if content:
            parts.append(f"\n--- reference: {path} ---\n{content}")

    for d in document_blocks:
        body = d["body_text"] or "(no extracted text available for this document)"
        parts.append(
            f"\n--- document {d['handle']} ---\n"
            f"id: {d['document_id']}\nfilename: {d['filename']}\n{body}"
        )

    user_input = args.get("input") or args.get("question")
    if user_input:
        parts.append(f"\n--- request ---\n{user_input}")

    if document_blocks:
        # Opt-in citation format. Lenient — the runtime always records
        # document-level anchors regardless; this only enriches with
        # claim-level mapping when the model cooperates. Never required.
        parts.append(
            "\n--- citing sources (optional) ---\n"
            "If your answer relies on the documents above, you may reply as "
            'JSON: {"output": "<your answer>", "claims": [{"text": "<claim>", '
            '"source_handles": ["D1"], "quote": "<verbatim excerpt>"}]}. '
            "Otherwise reply normally."
        )

    return "\n".join(parts)


def _extract_json_envelope(text: str) -> dict[str, Any] | None:
    """Return the first JSON object that looks like the optional
    prompt-runtime envelope.

    Models often wrap structured output in Markdown fences or prose.
    This helper is deliberately narrow: it only succeeds for a JSON
    object with a string ``output`` key. Anything else leaves the raw
    model response untouched so the answer is never lost.
    """
    candidates: list[str] = []
    stripped = text.strip()
    if stripped.startswith("{"):
        candidates.append(stripped)
    candidates.extend(
        match.group(1).strip() for match in _JSON_FENCE_RE.finditer(text)
    )
    first_brace = text.find("{")
    if first_brace >= 0 and not stripped.startswith("{"):
        candidates.append(text[first_brace:])

    decoder = json.JSONDecoder()
    for candidate in candidates:
        try:
            data, _ = decoder.raw_decode(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and isinstance(data.get("output"), str):
            return data
    return None


def _parse_model_output(text: str) -> tuple[str, list[dict[str, Any]]]:
    """Lenient parse of the provider response. Returns (output_text,
    raw_claims). If the model returned the optional JSON envelope, extract
    its ``output`` + ``claims``; otherwise treat the whole response as the
    answer. The answer is NEVER lost to a failed/partial envelope."""
    data = _extract_json_envelope(text or "")
    if data is not None:
        claims = data.get("claims")
        return data["output"], claims if isinstance(claims, list) else []
    return text, []


def _build_source_anchors(
    document_blocks: list[dict[str, Any]],
    model_claims: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Assemble (source_anchors, claims) for the artifact payload.

    Always emits one document-level anchor per loaded document — server
    truth, independent of the model. Model claims (if any) enrich with
    claim→handle mapping; a model-supplied quote becomes a quote-bearing
    anchor with the ``quote_found_in_source`` check. Unknown handles and
    model-supplied identities are ignored — identity is server-only.
    """
    handle_to_doc: dict[str, dict[str, Any]] = {}
    anchors: list[dict[str, Any]] = []
    for d in document_blocks:
        anchor_id = f"src_{d['handle'].lower()}"
        handle_to_doc[d["handle"]] = {**d, "_anchor_id": anchor_id}
        anchors.append(
            build_document_anchor(
                anchor_id=anchor_id,
                document_id=d["document_id"],
                filename=d["filename"],
                sha256=d["sha256"],
                body_text=d["body_text"],
            )
        )

    claims: list[dict[str, Any]] = []
    quote_n = 0
    for idx, raw in enumerate(model_claims, start=1):
        if not isinstance(raw, dict):
            continue
        ctext = str(raw.get("text", "")).strip()
        if not ctext:
            continue
        handles = [
            h for h in (raw.get("source_handles") or []) if h in handle_to_doc
        ]
        anchor_ids = [handle_to_doc[h]["_anchor_id"] for h in handles]
        quote = raw.get("quote")
        if quote and handles:
            quote_n += 1
            d0 = handle_to_doc[handles[0]]
            q_anchor_id = f"src_q{quote_n}"
            anchors.append(
                build_document_anchor(
                    anchor_id=q_anchor_id,
                    document_id=d0["document_id"],
                    filename=d0["filename"],
                    sha256=d0["sha256"],
                    body_text=d0["body_text"],
                    quote=str(quote),
                )
            )
            anchor_ids.append(q_anchor_id)
        claims.append({"id": f"claim_{idx}", "text": ctext, "anchor_ids": anchor_ids})

    return anchors, claims


async def run_prompt_capability(
    *,
    session: AsyncSession,
    installed_module: InstalledModule,
    capability_declaration: dict[str, Any],
    matter: Matter,
    context: InvocationContext,
    args: dict[str, Any],
    provider_call: ProviderCallable,
) -> dict[str, Any]:
    """Execute a prompt-runtime capability end-to-end.

    Returns the invocation result dict
    (``{artifact_id, artifact_kind, model_id, output_chars}``) the
    endpoint serialises into ``InvocationResponse.result``.
    """
    module_id = installed_module.module_id
    capability_id = capability_declaration.get("id")
    if not capability_id:
        raise ValueError("prompt capability declaration missing id")

    manifest = installed_module.manifest_snapshot or {}
    entrypoint = manifest.get("entrypoint") or {}
    instructions = entrypoint.get("instructions")
    if not instructions:
        # Schema guarantees this for runtime=prompt, but the dispatcher
        # trusts the snapshot — fail closed rather than prompt an empty
        # system message.
        raise ValueError(
            "prompt runtime requires entrypoint.instructions in the manifest"
        )
    references = entrypoint.get("references") or []

    reads = capability_declaration.get("reads") or []
    writes = capability_declaration.get("writes") or []
    gates = capability_declaration.get("gates") or []
    advice_tier_max = (
        capability_declaration.get("advice_tier_max") or ADVICE_TIER_DRAFT_ADVICE
    )

    actor_user_id = context.actor_user_id
    invocation_id = context.invocation_id

    # 0. Posture gate — only when the capability declares it (Build Brief:
    #    "Posture gate should run if declared in gates").
    if _POSTURE_GATE in gates:
        posture = await check_posture(
            session,
            matter=matter,
            actor_user_id=actor_user_id,
            actor_role=context.actor_role,
            module_id=module_id,
            capability_id=capability_id,
        )
        if not posture.allowed:
            raise PostureBlocked(posture)

    # 1. Documents — only read when the caller asks AND the capability
    #    declares a read. Enforce every declared read grant BEFORE the
    #    read. matter_id scoping rejects cross-matter grants.
    document_ids = _coerce_document_ids(args)
    document_blocks: list[dict[str, Any]] = []
    if document_ids:
        if not reads:
            raise ValueError(
                "document id(s) supplied but this capability declares no reads"
            )
        for read_cap in reads:
            await require_capability(
                session,
                user_id=actor_user_id,
                plugin=module_id,
                skill=capability_id,
                capability=read_cap,
                matter_id=matter.id,
            )
        document_blocks = await _load_documents(session, matter, document_ids)

    # 2. Advice-boundary gate — uses the host-derived actor_role from the
    #    InvocationContext; the manifest cannot assert its own role.
    gate_result = await advice_boundary_check(
        session,
        output_id=str(invocation_id),
        requested_tier=advice_tier_max,
        from_tier=None,
        declared_tier_max=advice_tier_max,
        actor_user_id=actor_user_id,
        actor_role=context.actor_role,
        module_id=module_id,
        capability_id=capability_id,
        matter_id=matter.id,
    )
    if not gate_result["allowed"]:
        raise AdviceBoundaryDenied(gate_result)

    # 3. Invocation audit.
    await audit_phase1(
        session,
        action="module.capability.invoked",
        primitive="capability",
        actor_id=actor_user_id,
        matter_id=matter.id,
        module_id=module_id,
        capability_id=capability_id,
        payload={
            "invocation_id": str(invocation_id),
            "runtime": "prompt",
            "document_ids": [str(d) for d in document_ids],
        },
    )

    # 4. Provider call — instructions as system, context as the prompt.
    prompt = _build_prompt(
        module_id=module_id,
        capability_id=capability_id,
        references=references,
        document_blocks=document_blocks,
        args=args,
    )
    response = await provider_call(prompt, system=instructions)

    # Source anchors: always emit document-level anchors for the documents
    # that were in context (server truth); enrich with claim-level mapping
    # if the model returned the optional JSON envelope. The answer text is
    # taken from the envelope's `output` when present, else the raw text.
    output_text, model_claims = _parse_model_output(response.text)
    source_anchors, anchored_claims = _build_source_anchors(
        document_blocks, model_claims
    )

    # 5. Model-invocation audit (cost shape).
    await audit_emit_model_invoked(
        session,
        matter_id=matter.id,
        actor_user_id=actor_user_id,
        module_id=module_id,
        capability_id=capability_id,
        model_id=response.model_id,
        provider=response.provider,
        tokens_in=response.tokens_in,
        tokens_out=response.tokens_out,
        cost_micros=response.cost_micros,
        currency=response.currency,
        payload_extra={"invocation_id": str(invocation_id)},
    )

    # 6. Enforce every declared write grant BEFORE writing the artifact.
    for write_cap in writes:
        await require_capability(
            session,
            user_id=actor_user_id,
            plugin=module_id,
            skill=capability_id,
            capability=write_cap,
            matter_id=matter.id,
        )

    # 7. Persist the model output as a matter artifact.
    artifact = await write_artifact(
        session,
        matter=matter,
        capability_id=capability_id,
        module_id=module_id,
        invocation_id=invocation_id,
        kind=ARTIFACT_KIND,
        payload={
            "output": output_text,
            "model_id": response.model_id,
            "input": args.get("input") or args.get("question"),
            # Additive — old payloads simply lack these keys.
            **({"source_anchors": source_anchors} if source_anchors else {}),
            **({"claims": anchored_claims} if anchored_claims else {}),
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
        module_id=module_id,
        capability_id=capability_id,
        payload={
            "invocation_id": str(invocation_id),
            "artifact_id": str(artifact.id),
            "artifact_kind": ARTIFACT_KIND,
        },
    )

    return {
        "artifact_id": str(artifact.id),
        "artifact_kind": ARTIFACT_KIND,
        "model_id": response.model_id,
        "output_chars": len(output_text),
        "source_anchor_count": len(source_anchors),
    }


__all__ = ["ARTIFACT_KIND", "run_prompt_capability"]
