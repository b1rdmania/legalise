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

import uuid
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
from app.core.runtime import InvocationContext, ProviderCallable
from app.models import Document, DocumentBody, InstalledModule, Matter

# Single, consistent artifact kind for prompt-runtime output (Build Brief
# — "pick one and use consistently").
ARTIFACT_KIND = "skill_response"

# How a caller asks the skill to read matter documents. Reading only
# happens when these args are present AND the capability declares reads.
_DOC_ARG_KEYS = ("document_ids", "document_id")
_POSTURE_GATE = "privilege_posture"


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
) -> list[tuple[str, str]]:
    """Load (filename, extracted_text) for matter-scoped documents.

    A document id that doesn't belong to this matter is rejected — the
    matter scope is enforced here as well as by the grant.
    """
    blocks: list[tuple[str, str]] = []
    for doc_id in document_ids:
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
        text = body.extracted_text if body is not None else ""
        blocks.append((document.filename, text))
    return blocks


def _build_prompt(
    *,
    module_id: str,
    capability_id: str,
    references: list[dict[str, Any]],
    document_blocks: list[tuple[str, str]],
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

    for filename, text in document_blocks:
        body = text or "(no extracted text available for this document)"
        parts.append(f"\n--- document: {filename} ---\n{body}")

    user_input = args.get("input") or args.get("question")
    if user_input:
        parts.append(f"\n--- request ---\n{user_input}")

    return "\n".join(parts)


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
    document_blocks: list[tuple[str, str]] = []
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
        raise PermissionError(
            f"advice-boundary gate denied: {gate_result['gate_state']!r}"
        )

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
            "output": response.text,
            "model_id": response.model_id,
            "input": args.get("input") or args.get("question"),
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
        "output_chars": len(response.text),
    }


__all__ = ["ARTIFACT_KIND", "run_prompt_capability"]
