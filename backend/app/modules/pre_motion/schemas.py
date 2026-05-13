"""Pre-Motion response schemas — the structured shape of the four-stage
adversarial premortem output.

The shape mirrors the standalone premotion repo's output for v0.2
portability, but the field set is fixed here as the legalise-side
contract. Internal mutations to the standalone repo do not break this
surface.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ----- inputs --------------------------------------------------------------

class PreMotionRunInputs(BaseModel):
    """Optional caller-supplied inputs to bias / extend the run.

    All fields default to empty — the pipeline pulls everything else from
    the matter row (title, case theory, pivot fact, key dates, chronology,
    documents). Solicitors can override or extend via these fields.
    """

    party_position: str | None = None
    current_strategy: str | None = None
    counter_defence: str | None = None  # what they expect from the other side
    depth: Literal["fast", "thorough"] = "thorough"


# ----- stage 1 (optimistic) ------------------------------------------------

class KeyArgument(BaseModel):
    argument: str
    supporting_evidence: str = ""
    case_law: str = ""


class SupportingEvidenceItem(BaseModel):
    item: str
    weight: Literal["high", "medium", "low"] = "medium"
    what_it_proves: str = ""


class OptimisticCase(BaseModel):
    key_arguments: list[KeyArgument] = Field(default_factory=list)
    supporting_evidence: list[SupportingEvidenceItem] = Field(default_factory=list)
    expected_counterarguments: list[str] = Field(default_factory=list)
    optimistic_outcome: str = ""


# ----- stage 2 (evidence inspector) ---------------------------------------

class EvidenceFlag(BaseModel):
    flag: str
    severity: Literal["high", "medium", "low"] = "medium"
    category: str = ""
    source_document: str | None = None
    source_documents: list[str] | None = None
    event: str | None = None
    date: str | None = None


# ----- stage 3 (premortem adversary) --------------------------------------

class FailureScenario(BaseModel):
    category: Literal["procedural", "substantive", "evidentiary", "strategic"]
    scenario: str
    probability: Literal["High", "Medium", "Low"] = "Medium"
    impact: Literal["High", "Medium", "Low"] = "Medium"
    mitigation: str = ""


# ----- stage 4 (synthesiser) ----------------------------------------------

class EvidenceInconsistency(BaseModel):
    claim: str
    issue: str
    severity: Literal["high", "medium", "low"] = "medium"


class SynthesisOutput(BaseModel):
    verdict: Literal["steelman", "borderline", "strawman"]
    verdict_reasoning: str
    summary: str
    failure_scenarios: list[FailureScenario] = Field(default_factory=list)
    evidence_inconsistencies: list[EvidenceInconsistency] = Field(default_factory=list)
    blind_spots: list[str] = Field(default_factory=list)
    if_we_lose_this_will_be_why: str


# ----- run envelope -------------------------------------------------------

class StageStatus(BaseModel):
    """Per-stage telemetry for the run envelope."""

    name: str
    sub_agent_count: int
    duration_ms: int
    token_count: int
    errors: list[str] = Field(default_factory=list)


class PreMotionRunResult(BaseModel):
    """Final response envelope. The audit trail is the canonical record;
    this is the human/UI-shaped echo of it."""

    matter_slug: str
    started_at: str  # ISO 8601
    completed_at: str
    total_duration_ms: int
    total_token_count: int
    model_used: str  # provider name that served the calls

    stages: list[StageStatus]

    optimistic: OptimisticCase
    evidence_flags: list[EvidenceFlag]
    synthesis: SynthesisOutput
