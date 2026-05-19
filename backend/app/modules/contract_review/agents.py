"""Contract Review agents — Parser / Analyst / Redliner / Summariser.

Each agent owns one model call. Calls run sequentially in `pipeline.py`
because each downstream stage consumes the upstream output. The four-call
shape is deliberately leaner than Pre-Motion's nine-call adversarial fan
— contract review needs sequential dependence, not parallel deliberation.

JSON envelopes go through `app.core.structured_output.parse_model_json`,
which strips fences/prose and validates against the stage's Pydantic
schema. Validation failure returns `parsed=None` and the raw response is
attached to `error` so the pipeline's None-fallback path (see
`pipeline._coerce_*`) carries the model output forward for audit.

Each agent that fails returns an `AgentCall` with `error` set; the pipeline
decides whether to abort (Parser) or continue with empty output (Analyst,
Redliner, Summariser).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.model_gateway import ModelGateway, PrivilegePaused
from app.core.structured_output import StructuredOutputError, parse_model_json
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.models import Matter

from . import prompts
from .schemas import (
    AnalysisResult,
    ContractSummary,
    ParsedContract,
    RedlineSet,
)


# ----- Agent call result --------------------------------------------------


@dataclass
class AgentCall:
    """Telemetry from one dispatched agent call."""

    stage: str
    raw_text: str
    parsed: dict[str, Any] | None
    token_count: int
    latency_ms: int
    model_used: str
    error: str | None = None


# ----- Base ---------------------------------------------------------------


class BaseAgent:
    """Lightweight agent base. Subclasses set `stage`, `result_model`,
    and `_resource_label`, and implement `build_prompts(...)` returning
    `(system, user)`."""

    stage: str = "unknown"
    result_model: type[BaseModel] | None = None
    _resource_label: str = "contract-review"

    def build_prompts(self, **kwargs: Any) -> tuple[str, str]:
        raise NotImplementedError

    async def run(
        self,
        *,
        session: AsyncSession,
        gateway: ModelGateway,
        matter: Matter,
        actor_id: uuid.UUID | None,
        **prompt_kwargs: Any,
    ) -> AgentCall:
        system, user = self.build_prompts(**prompt_kwargs)
        try:
            result = await gateway.call(
                session=session,
                matter_id=matter.id,
                actor_id=actor_id,
                prompt=user,
                system=system,
                model=matter.default_model_id,
                resource_type=self._resource_label,
                resource_id=self.stage,
                payload={
                    "module": "contract_review",
                    "stage": self.stage,
                },
            )
        except (PrivilegePaused, ProviderKeyMissing, ProviderUpstreamError):
            # Policy failures and structured upstream errors must surface
            # to the router as 409 / 422 / 502, never swallow into a 200
            # fallback envelope. Codex R1 finding.
            raise
        except Exception as exc:
            return AgentCall(
                stage=self.stage,
                raw_text="",
                parsed=None,
                token_count=0,
                latency_ms=0,
                model_used="",
                error=f"{type(exc).__name__}: {exc}",
            )

        parsed: dict[str, Any] | None = None
        error: str | None = None
        if self.result_model is not None:
            try:
                validated = parse_model_json(result.text, self.result_model)
                parsed = validated.model_dump()
            except StructuredOutputError as exc:
                # Preserve the existing None-fallback path; `pipeline._coerce_*`
                # routes a None `parsed` into the empty-shape default. The raw
                # text rides on `error` so audit retains the unparseable body.
                error = f"StructuredOutputError: {exc}"

        return AgentCall(
            stage=self.stage,
            raw_text=result.text,
            parsed=parsed,
            token_count=result.token_count,
            latency_ms=result.latency_ms,
            model_used=result.model_used,
            error=error,
        )


# ----- Concrete agents ----------------------------------------------------


class ParserAgent(BaseAgent):
    stage = "parser"
    result_model = ParsedContract

    def build_prompts(
        self,
        *,
        contract_body: str,
        contract_type_hint: str,
        posture: str,
        counterparty: str | None,
        **_: Any,
    ) -> tuple[str, str]:
        return (
            prompts.PARSER_SYSTEM,
            prompts.build_parser_user(
                contract_body=contract_body,
                contract_type_hint=contract_type_hint,
                posture=posture,
                counterparty=counterparty,
            ),
        )


class AnalystAgent(BaseAgent):
    stage = "analyst"
    result_model = AnalysisResult

    def build_prompts(
        self,
        *,
        parsed_contract: dict[str, Any],
        contract_body: str,
        posture: str,
        counterparty: str | None,
        deal_value: str | None,
        **_: Any,
    ) -> tuple[str, str]:
        return (
            prompts.ANALYST_SYSTEM,
            prompts.build_analyst_user(
                parsed_contract=parsed_contract,
                contract_body=contract_body,
                posture=posture,
                counterparty=counterparty,
                deal_value=deal_value,
            ),
        )


class RedlinerAgent(BaseAgent):
    stage = "redliner"
    result_model = RedlineSet

    def build_prompts(
        self,
        *,
        parsed_contract: dict[str, Any],
        analyses: list[dict[str, Any]],
        posture: str,
        **_: Any,
    ) -> tuple[str, str]:
        return (
            prompts.REDLINER_SYSTEM,
            prompts.build_redliner_user(
                parsed_contract=parsed_contract,
                analyses=analyses,
                posture=posture,
            ),
        )


class SummariserAgent(BaseAgent):
    stage = "summariser"
    result_model = ContractSummary

    def build_prompts(
        self,
        *,
        parsed_contract: dict[str, Any],
        analyses: list[dict[str, Any]],
        redlines: list[dict[str, Any]],
        posture: str,
        counterparty: str | None,
        deal_value: str | None,
        **_: Any,
    ) -> tuple[str, str]:
        return (
            prompts.SUMMARISER_SYSTEM,
            prompts.build_summariser_user(
                parsed_contract=parsed_contract,
                analyses=analyses,
                redlines=redlines,
                posture=posture,
                counterparty=counterparty,
                deal_value=deal_value,
            ),
        )
