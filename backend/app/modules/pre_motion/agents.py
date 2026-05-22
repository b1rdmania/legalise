"""Pre-Motion agents — ported from the standalone premotion repo.

Each agent builds a system + user prompt and dispatches a single call
through the model gateway. The gateway handles privilege posture,
provider selection, and audit logging. Agents here only own prompt
shape and response parsing.

Sub-agent classes within a stage differ only in `agent_id`,
`sub_agent_id`, and the system prompt. Their user-prompt shape is
shared via the stage base.

JSON parsing routes through `app.core.structured_output.parse_model_json`
where the stage has a wrapper Pydantic model (Optimistic, Synthesis).
Evidence and Premortem sub-agents emit list-wrapper envelopes
(`{evidence_flags: [...]}`, `{failure_scenarios: [...]}`) that have no
top-level wrapper model in `schemas.py` — per work-unit-#1a spec we do
not invent one. Those stages keep an inline tolerant extractor scoped to
this module.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.model_gateway import ModelGateway, PrivilegePosture
from app.core.structured_output import StructuredOutputError, parse_model_json
from app.models import Document, Event, Matter

from .schemas import OptimisticCase, SynthesisOutput


# ----- helpers -------------------------------------------------------------

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_json(text: str) -> dict[str, Any] | None:
    """Tolerant JSON extractor for sub-agents whose envelopes are
    list-wrappers without a top-level Pydantic schema (evidence flags,
    failure scenarios). Returns None if nothing parses."""
    if not text:
        return None
    # Fenced block first.
    m = _JSON_FENCE_RE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try the whole thing.
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    # Last resort: find first { ... } block.
    first = text.find("{")
    last = text.rfind("}")
    if 0 <= first < last:
        candidate = text[first : last + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            return None
    return None


def _evidence_block(documents: list[Document]) -> str:
    if not documents:
        return "None on file."
    lines = []
    for d in documents:
        tag = d.tag or "no tag"
        disc = " (DISCLOSURE)" if d.from_disclosure else ""
        lines.append(f"- {d.filename} [{tag}{disc}]  sha256={d.sha256[:12]}")
    return "\n".join(lines)


def _chronology_block(events: list[Event]) -> str:
    if not events:
        return "No chronology entries."
    lines = []
    for e in events:
        lines.append(f"- {e.event_date}  (sig={e.significance})  {e.description}")
    return "\n".join(lines)


# ----- agent base ----------------------------------------------------------

@dataclass
class AgentCall:
    """One dispatched call. Captures the audit-relevant telemetry the
    pipeline assembles into a run envelope."""

    agent_id: str
    sub_agent_id: str | None
    stage: str
    raw_text: str
    parsed: dict[str, Any] | None
    token_count: int
    latency_ms: int
    model_used: str
    error: str | None = None


@dataclass
class MatterContext:
    """Snapshot of the matter passed into every agent. Built once at
    pipeline start; immutable for the run."""

    matter: Matter
    documents: list[Document] = field(default_factory=list)
    chronology: list[Event] = field(default_factory=list)
    inputs: dict[str, Any] = field(default_factory=dict)

    @property
    def title(self) -> str:
        return self.matter.title

    @property
    def case_type(self) -> str:
        return self.matter.matter_type

    @property
    def case_theory(self) -> str:
        return self.matter.case_theory or ""

    @property
    def pivot_fact(self) -> str:
        return self.matter.pivot_fact or ""


class PreMotionAgent:
    """Abstract per-call agent. Subclasses set `agent_id`, optionally
    `sub_agent_id`, `stage`, `result_model`, and override
    `build_system_prompt` / `build_user_prompt`.

    `result_model` is a Pydantic class whose shape matches the agent's
    JSON envelope. When set, the response is routed through
    `parse_model_json` for fence/prose stripping + validation. On
    `StructuredOutputError` we fall back to `_extract_json` so the
    pipeline's existing degraded paths (`_to_optimistic_case`,
    `_coerce_synthesis`) still receive a best-effort dict.

    Evidence / Premortem sub-agents leave `result_model = None` because
    their list-wrapper envelopes have no top-level Pydantic class — see
    module docstring."""

    agent_id: str = "base"
    sub_agent_id: str | None = None
    stage: str = "unknown"
    result_model: type[BaseModel] | None = None

    def build_system_prompt(self) -> str:
        raise NotImplementedError

    def build_user_prompt(self, ctx: MatterContext, extra: dict[str, Any]) -> str:
        raise NotImplementedError

    async def run(
        self,
        *,
        ctx: MatterContext,
        session: AsyncSession,
        gateway: ModelGateway,
        actor_id: uuid.UUID | None,
        extra: dict[str, Any] | None = None,
    ) -> AgentCall:
        system = self.build_system_prompt()
        user = self.build_user_prompt(ctx, extra or {})

        try:
            result = await gateway.call(
                session=session,
                matter_id=ctx.matter.id,
                actor_id=actor_id,
                prompt=user,
                system=system,
                model=ctx.matter.default_model_id,
                # Posture is re-read from the DB inside the gateway.
                resource_type="pre-motion",
                resource_id=self.sub_agent_id or self.agent_id,
                payload={
                    "module": "pre-motion",
                    "agent_id": self.agent_id,
                    "sub_agent_id": self.sub_agent_id,
                    "stage": self.stage,
                },
                caller_module="pre_motion",
            )
        except Exception as exc:
            return AgentCall(
                agent_id=self.agent_id,
                sub_agent_id=self.sub_agent_id,
                stage=self.stage,
                raw_text="",
                parsed=None,
                token_count=0,
                latency_ms=0,
                model_used="",
                error=f"{type(exc).__name__}: {exc}",
            )

        parsed: dict[str, Any] | None
        error: str | None = None
        if self.result_model is not None:
            try:
                validated = parse_model_json(result.text, self.result_model)
                parsed = validated.model_dump()
            except StructuredOutputError as exc:
                # Degraded path: pipeline._to_optimistic_case /
                # _coerce_synthesis already tolerate partial dicts, so
                # surface the best-effort extract rather than None.
                parsed = _extract_json(result.text)
                error = f"StructuredOutputError: {exc}"
        else:
            parsed = _extract_json(result.text)

        return AgentCall(
            agent_id=self.agent_id,
            sub_agent_id=self.sub_agent_id,
            stage=self.stage,
            raw_text=result.text,
            parsed=parsed,
            token_count=result.token_count,
            latency_ms=result.latency_ms,
            model_used=result.model_used,
            error=error,
        )


# ----- stage 1: optimistic analyst ----------------------------------------

class OptimisticAnalyst(PreMotionAgent):
    agent_id = "optimistic_analyst"
    stage = "optimistic"
    result_model = OptimisticCase

    def build_system_prompt(self) -> str:
        return (
            "You are arguing this matter on behalf of the client. Read the "
            "matter context carefully and produce the strongest legal case "
            "the evidence supports — the version that actually wins. Do not "
            "hedge. This is the steelman version of the client's position.\n\n"
            "You are not adversarial here. You are the most generous reading "
            "of the file. Where the evidence supports the client, say so "
            "plainly. Where there is room for a creative legal argument the "
            "client has not yet pleaded, identify it. Cite UK case law where "
            "relevant.\n\n"
            "Return ONLY valid JSON with this shape:\n"
            "{\n"
            '  "key_arguments": [\n'
            '    {"argument": "Stated as a barrister would put it", '
            '"supporting_evidence": "The exhibits / facts that support it", '
            '"case_law": "Any authority that helps"}\n'
            "  ],\n"
            '  "supporting_evidence": [\n'
            '    {"item": "Document or fact", "weight": "high|medium|low", '
            '"what_it_proves": "..."}\n'
            "  ],\n"
            '  "expected_counterarguments": [\n'
            '    "What the other side will most likely run, briefly"\n'
            "  ],\n"
            '  "optimistic_outcome": "A 2-3 sentence statement of the realistic '
            'best result for the client if this case is run on its strongest reading."\n'
            "}"
        )

    def build_user_prompt(self, ctx: MatterContext, extra: dict[str, Any]) -> str:
        position = (ctx.inputs.get("party_position") or ctx.case_theory or "").strip()
        strategy = (ctx.inputs.get("current_strategy") or "").strip() or "(not specified)"
        return (
            f"CASE: {ctx.title}\n"
            f"JURISDICTION: England & Wales\n"
            f"CASE TYPE: {ctx.case_type}\n"
            f"CAUSE: {ctx.matter.cause or 'not specified'}\n\n"
            f"CASE THEORY (the party's position):\n{position}\n\n"
            f"PIVOT FACT:\n{ctx.pivot_fact or '(none)'}\n\n"
            f"CURRENT STRATEGY:\n{strategy}\n\n"
            f"DOCUMENTS ({len(ctx.documents)}):\n{_evidence_block(ctx.documents)}\n\n"
            f"CHRONOLOGY:\n{_chronology_block(ctx.chronology)}\n\n"
            "Produce the optimistic-case JSON now."
        )


# ----- stage 2: evidence inspector ----------------------------------------

class _EvidenceSubAgent(PreMotionAgent):
    stage = "evidence"

    def build_user_prompt(self, ctx: MatterContext, extra: dict[str, Any]) -> str:
        position = (ctx.inputs.get("party_position") or ctx.case_theory or "").strip()
        return (
            f"CASE: {ctx.title}\n"
            f"PARTY POSITION:\n{position}\n\n"
            f"DOCUMENTS ({len(ctx.documents)}):\n{_evidence_block(ctx.documents)}\n\n"
            f"CHRONOLOGY:\n{_chronology_block(ctx.chronology)}\n\n"
            "Produce your evidence-flag JSON now."
        )


class DocumentSubAgent(_EvidenceSubAgent):
    agent_id = "evidence_inspector"
    sub_agent_id = "document_subagent"

    def build_system_prompt(self) -> str:
        return (
            "You are a document sub-agent inside the Pre-Motion evidence "
            "inspector pipeline. Your remit is narrow: extract the factual "
            "claims each individual document is making, and flag claims that "
            "are weak, ambiguous, or unsupported by the document itself.\n\n"
            "You do NOT cross-reference between documents — that is another "
            "sub-agent's job. You read each document on its own terms and "
            "flag what it actually says versus what the party is claiming it "
            "says.\n\n"
            'Return ONLY valid JSON:\n'
            '{ "evidence_flags": [ { "source_document": "filename or label", '
            '"flag": "What\'s wrong, ambiguous, or weaker than the party '
            'thinks", "severity": "high|medium|low", "category": "document" } ] }'
        )


class CrossReferenceSubAgent(_EvidenceSubAgent):
    agent_id = "evidence_inspector"
    sub_agent_id = "cross_reference_subagent"

    def build_system_prompt(self) -> str:
        return (
            "You are a cross-reference sub-agent inside the Pre-Motion "
            "evidence inspector pipeline. Your remit: find inconsistencies "
            "BETWEEN documents. Two exhibits that contradict each other. A "
            "witness statement that says one thing and an email that says "
            "another. A pleading that asserts a fact one document supports "
            "and another undermines.\n\n"
            "You do NOT critique single documents in isolation.\n\n"
            'Return ONLY valid JSON:\n'
            '{ "evidence_flags": [ { "source_documents": ["doc A", "doc B"], '
            '"flag": "The inconsistency, stated specifically", '
            '"severity": "high|medium|low", "category": "cross_reference" } ] }'
        )


class ChronologySubAgent(_EvidenceSubAgent):
    agent_id = "evidence_inspector"
    sub_agent_id = "chronology_subagent"

    def build_system_prompt(self) -> str:
        return (
            "You are a chronology sub-agent inside the Pre-Motion evidence "
            "inspector pipeline. Your remit: verify timeline coherence. "
            "Construct the chronology from the evidence and flag any sequence "
            "problem — events out of order, dates that don't reconcile with "
            "the party's narrative, gaps where documents would be expected, "
            "or post-hoc reconstructions presented as contemporaneous.\n\n"
            "You do NOT critique the substance of any single document.\n\n"
            'Return ONLY valid JSON:\n'
            '{ "evidence_flags": [ { "event": "What is alleged to have '
            'happened", "date": "Date as stated", "flag": "The chronology '
            'problem", "severity": "high|medium|low", "category": "chronology" } ] }'
        )


# ----- stage 3: premortem adversary ---------------------------------------

class _PremortemSubAgent(PreMotionAgent):
    stage = "premortem"
    category: str = "general"

    def build_user_prompt(self, ctx: MatterContext, extra: dict[str, Any]) -> str:
        evidence_flags = extra.get("evidence_flags", []) or []
        flags_block = "\n".join(
            f"- [{f.get('severity', 'medium')}/{f.get('category', '')}] {f.get('flag', '')}"
            for f in evidence_flags
        ) or "None flagged."

        optimistic = extra.get("optimistic_case", {}) or {}
        optimistic_args = optimistic.get("key_arguments", []) or []
        optimistic_block = "\n".join(
            f"- {a.get('argument', '')}" for a in optimistic_args
        ) or "(no optimistic case provided)"

        position = (ctx.inputs.get("party_position") or ctx.case_theory or "").strip()
        return (
            f"CASE: {ctx.title}\n"
            f"JURISDICTION: England & Wales\n"
            f"CASE TYPE: {ctx.case_type}\n"
            f"CAUSE: {ctx.matter.cause or 'not specified'}\n\n"
            f"PARTY POSITION:\n{position}\n\n"
            f"OPTIMISTIC CASE (the steelman):\n{optimistic_block}\n\n"
            f"EVIDENCE FLAGS:\n{flags_block}\n\n"
            f"DOCUMENTS ({len(ctx.documents)}):\n{_evidence_block(ctx.documents)}\n\n"
            f"It is one year from now. This case has been LOST. Walk back "
            f"from that loss and identify specifically why — focus only on "
            f"{self.category} failure modes. Produce your ranked failure "
            f"scenarios JSON now."
        )


def _premortem_system(category: str, lane: str, modes: str) -> str:
    return (
        f"It is one year from now. This case has been LOST. You are walking "
        f"back from that loss to identify specifically why — focus ONLY on "
        f"{category} failure modes.\n\n"
        f"{lane} Adversarial framing only. The case has been lost; you are "
        f"explaining why.\n\n"
        f"{category.capitalize()} failure modes include: {modes}\n\n"
        f"Stay strictly within the {category} lane.\n\n"
        f'Return ONLY valid JSON:\n'
        f'{{ "failure_scenarios": [ {{ "category": "{category}", '
        f'"scenario": "Specific failure mode", "probability": "High|Medium|Low", '
        f'"impact": "High|Medium|Low", "mitigation": "What the team would need '
        f'to do now to avoid this" }} ] }}'
    )


class ProceduralSubAgent(_PremortemSubAgent):
    agent_id = "premortem_adversary"
    sub_agent_id = "procedural_subagent"
    category = "procedural"

    def build_system_prompt(self) -> str:
        return _premortem_system(
            "procedural",
            "You are a senior adversarial litigator with 30 years' experience under the CPR.",
            "filing defects, missed deadlines, jurisdictional defects, pleading "
            "defects, disclosure failures, witness statement issues, costs-budgeting "
            "failures, applications that should have been made, applications that "
            "should not have been made.",
        )


class SubstantiveSubAgent(_PremortemSubAgent):
    agent_id = "premortem_adversary"
    sub_agent_id = "substantive_subagent"
    category = "substantive"

    def build_system_prompt(self) -> str:
        return _premortem_system(
            "substantive",
            "You are a KC with 30 years at the commercial / employment / public-law bar.",
            "legal grounds that don't sustain the relief sought, statutes that "
            "defeat the pleaded case, binding authority running the other way, "
            "recent appellate decisions the team missed, doctrinal lines that "
            "have moved, claims pleaded under the wrong legal framework when "
            "an alternative would have survived.",
        )


class EvidentiarySubAgent(_PremortemSubAgent):
    agent_id = "premortem_adversary"
    sub_agent_id = "evidentiary_subagent"
    category = "evidentiary"

    def build_system_prompt(self) -> str:
        return _premortem_system(
            "evidentiary",
            "You are a senior litigator who has seen strong-on-paper cases lose at trial because the evidence did not survive cross-examination.",
            "proof problems on key facts, admissibility issues, witness "
            "credibility risks, hearsay problems, document authenticity, "
            "contemporaneity questions, missing exhibits, unhelpful disclosure, "
            "expert evidence that failed Civil Evidence Act standards, "
            "electronic evidence preservation failures.",
        )


class StrategicSubAgent(_PremortemSubAgent):
    agent_id = "premortem_adversary"
    sub_agent_id = "strategic_subagent"
    category = "strategic"

    def build_system_prompt(self) -> str:
        return _premortem_system(
            "strategic",
            "You are a partner who has run litigation strategy for major clients for 25 years.",
            "tactical errors, posture, escalation timing, settlement timing, "
            "the wrong forum, the wrong relief sought, costs exposure "
            "mismanaged, board / client appetite mismanaged, settlement "
            "windows missed, regulatory exposure not factored in, reputational "
            "cost not factored in.",
        )


# ----- stage 4: synthesiser -----------------------------------------------

class Synthesiser(PreMotionAgent):
    agent_id = "synthesiser"
    stage = "synthesis"
    result_model = SynthesisOutput

    def build_system_prompt(self) -> str:
        return (
            "You are producing the final stress-test brief for Pre-Motion. "
            "Compare the optimistic case against the adversarial findings. "
            "Identify where they meaningfully disagree — those are the blind "
            "spots. Produce a verdict (steelman / strawman / borderline) with "
            "reasoning. Be brutal but kind. Solicitors need to act on this.\n\n"
            "Verdict guidance:\n"
            '- "steelman": the optimistic case substantially survives. There '
            "may be mitigations to action but the strategy is sound.\n"
            '- "borderline": parts of the optimistic case do not survive '
            "contact with the premortem. Recoverable with specific changes.\n"
            '- "strawman": the optimistic case relies on positions the '
            "premortem closes off. The strategy needs material change or "
            "the matter needs to settle.\n\n"
            "Your output is the brief that lands on a partner's desk. "
            "Document-style, plain English where possible, technical where "
            "required. No emojis, no hedging language, no false reassurance.\n\n"
            'Return ONLY valid JSON with this exact shape:\n'
            "{\n"
            '  "verdict": "steelman|strawman|borderline",\n'
            '  "verdict_reasoning": "1-2 sentences",\n'
            '  "summary": "2-3 paragraphs of plain-English summary",\n'
            '  "failure_scenarios": [\n'
            '    { "category": "procedural|substantive|evidentiary|strategic", '
            '"scenario": "...", "probability": "High|Medium|Low", '
            '"impact": "High|Medium|Low", "mitigation": "..." }\n'
            "  ],\n"
            '  "evidence_inconsistencies": [\n'
            '    { "claim": "...", "issue": "...", "severity": "high|medium|low" }\n'
            "  ],\n"
            '  "blind_spots": ["The thing the team is missing, specifically"],\n'
            '  "if_we_lose_this_will_be_why": "One brutal honest sentence — '
            'the single most likely reason this case loses if it loses."\n'
            "}\n\n"
            "Re-rank, dedupe, tighten the failure scenarios from the four "
            "premortem sub-agents. Output reads like one mind, not four "
            "sub-agent outputs concatenated."
        )

    def build_user_prompt(self, ctx: MatterContext, extra: dict[str, Any]) -> str:
        position = (ctx.inputs.get("party_position") or ctx.case_theory or "").strip()
        strategy = (ctx.inputs.get("current_strategy") or "").strip() or "(not specified)"
        optimistic = json.dumps(extra.get("optimistic_case", {}), indent=2)
        evidence = json.dumps(extra.get("evidence_flags", []), indent=2)
        premortem = json.dumps(extra.get("failure_scenarios", []), indent=2)
        return (
            f"CASE: {ctx.title}\n"
            f"JURISDICTION: England & Wales\n\n"
            f"PARTY POSITION:\n{position}\n\n"
            f"CURRENT STRATEGY:\n{strategy}\n\n"
            f"STAGE 1 — OPTIMISTIC ANALYST OUTPUT:\n{optimistic}\n\n"
            f"STAGE 2 — EVIDENCE INSPECTOR (merged flags):\n{evidence}\n\n"
            f"STAGE 3 — PREMORTEM ADVERSARY (merged failure scenarios):\n{premortem}\n\n"
            "Now produce the final stress-test brief JSON. Re-rank failure "
            "scenarios across categories, identify blind spots, give a "
            "verdict, and write the one brutal sentence."
        )


EVIDENCE_SUB_AGENTS: list[type[PreMotionAgent]] = [
    DocumentSubAgent,
    CrossReferenceSubAgent,
    ChronologySubAgent,
]

PREMORTEM_SUB_AGENTS: list[type[PreMotionAgent]] = [
    ProceduralSubAgent,
    SubstantiveSubAgent,
    EvidentiarySubAgent,
    StrategicSubAgent,
]
