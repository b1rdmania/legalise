"""Contract Review (counsel-mvp port) Pydantic schemas.

Four-stage pipeline shape:
    Stage 1 — Parser     → ParsedContract
    Stage 2 — Analyst    → list[ClauseAnalysis]   (UK wedge)
    Stage 3 — Redliner   → list[Redline]
    Stage 4 — Summariser → ContractSummary

The final response envelope is `ContractReviewResult`, mirroring the
shape of `PreMotionRunResult` so the SSE `result` frame stays
isomorphic across modules.

v0.1 ships no persisted runs table; results round-trip through the
client for .docx export. Per-stage failure is recoverable
(parser fail → abort; downstream stage fail → continue with empty
state for that stage).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ----- inputs --------------------------------------------------------------

Posture = Literal["buyer", "seller", "balanced"]
ContractKind = Literal[
    "nda", "saas", "msa", "dpa", "consultancy", "employment", "settlement", "other"
]


class ContractReviewInputs(BaseModel):
    """Caller-supplied inputs for a single contract-review run.

    `document_id` is required: contract review operates on a specific
    matter document's extracted body. Posture biases the Analyst's
    risk-scoring lens. `contract_type` is a hint — the Parser still
    reports the type it actually detects.
    """

    document_id: str = Field(min_length=1)
    posture: Posture = "balanced"
    contract_type: ContractKind = "other"
    counterparty_name: str | None = None
    deal_value: str | None = None  # free text, e.g. "£250k ARR"


# ----- stage 1: parser -----------------------------------------------------

ClauseType = Literal[
    "definitions",
    "scope",
    "term",
    "payment",
    "ip",
    "confidentiality",
    "data_protection",
    "warranties",
    "indemnity",
    "liability",
    "termination",
    "governing_law",
    "jurisdiction",
    "arbitration",
    "boilerplate",
    "other",
]


class Clause(BaseModel):
    id: str  # c1, c2, ...
    section: str = ""  # e.g. "5.2", "Schedule 1.3"
    title: str = ""
    type: ClauseType = "other"
    text: str = ""
    defined_terms_used: list[str] = Field(default_factory=list)
    cross_references: list[str] = Field(default_factory=list)


class ParsedContract(BaseModel):
    title: str = ""
    parties: list[str] = Field(default_factory=list)
    document_type: ContractKind = "other"
    governing_law_stated: str | None = None
    clauses: list[Clause] = Field(default_factory=list)


# ----- stage 2: analyst (UK wedge) ----------------------------------------

UkIssueCategory = Literal[
    "ucta_s2_s3",        # UCTA 1977 unreasonable exclusions
    "cra_s62",           # Consumer Rights Act 2015 unfair terms
    "uk_gdpr_art28",     # UK GDPR processor obligations
    "governing_law",     # missing / unclear
    "jurisdiction",      # exclusive vs non-exclusive defects
    "arbitration",       # seat / institution issues
    "liability_cap",     # missing or excessive cap
    "indemnity",         # uncapped / one-sided
    "ip_assignment",     # ambiguous IP flow
    "termination",       # asymmetric or missing
    "boilerplate",       # severability / variation / notices defects
    "other",
]

RiskSeverity = Literal["high", "medium", "low"]


class UkIssue(BaseModel):
    category: UkIssueCategory
    statute_ref: str = ""  # e.g. "UCTA 1977 s.3", "UK GDPR Art 28(3)"
    description: str
    severity: RiskSeverity = "medium"


class ClauseAnalysis(BaseModel):
    clause_id: str
    risk_score: int = Field(ge=0, le=5, default=0)  # 0 (none) — 5 (deal-blocking)
    summary: str = ""
    uk_issues: list[UkIssue] = Field(default_factory=list)
    posture_note: str = ""  # buyer/seller/balanced perspective tag


class AnalysisResult(BaseModel):
    clause_analyses: list[ClauseAnalysis] = Field(default_factory=list)


# ----- stage 3: redliner ---------------------------------------------------

RedlinePriority = Literal["must", "suggested", "nice_to_have"]


class Redline(BaseModel):
    clause_id: str
    original_text: str
    suggested_text: str
    explanation: str
    priority: RedlinePriority = "suggested"


class RedlineSet(BaseModel):
    redlines: list[Redline] = Field(default_factory=list)


# ----- stage 4: summariser -------------------------------------------------


class ContractSummary(BaseModel):
    executive_summary: str = ""
    key_terms: list[str] = Field(default_factory=list)
    risk_overview: str = ""
    uk_specific_callouts: list[str] = Field(default_factory=list)
    recommendation: str = ""  # e.g. "Sign as-is", "Negotiate must-have redlines first"


# ----- run envelope --------------------------------------------------------


class StageStatus(BaseModel):
    """Per-stage telemetry. Mirrors `pre_motion.schemas.StageStatus`."""

    name: str
    status: Literal["pending", "running", "done", "error", "skipped"] = "pending"
    sub_agent_count: int = 1
    duration_ms: int = 0
    token_count: int = 0
    errors: list[str] = Field(default_factory=list)


class ContractReviewResult(BaseModel):
    matter_slug: str
    document_id: str
    document_filename: str = ""

    started_at: str  # ISO 8601
    completed_at: str
    total_duration_ms: int
    total_token_count: int
    model_used: str

    stages: list[StageStatus]

    parsed: ParsedContract
    analyses: list[ClauseAnalysis]
    redlines: list[Redline]
    summary: ContractSummary

    posture: Posture = "balanced"
    contract_type: ContractKind = "other"
