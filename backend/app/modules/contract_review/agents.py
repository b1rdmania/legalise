"""Contract Review agents — Parser / Analyst / Redliner / Summariser.

Each agent owns one model call. Calls run sequentially in `pipeline.py`
because each downstream stage consumes the upstream output. The four-call
shape is deliberately leaner than Pre-Motion's nine-call adversarial fan
— contract review needs sequential dependence, not parallel deliberation.

JSON envelopes are parsed tolerantly (fenced blocks, bare JSON,
first-`{`..last-`}` fallback) — mirrors `document_edit.pipeline._parse_envelope`
without re-importing it, because the contract-review schemas differ.

Each agent that fails returns an `AgentCall` with `error` set; the pipeline
decides whether to abort (Parser) or continue with empty output (Analyst,
Redliner, Summariser).
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.model_gateway import ModelGateway
from app.models import Matter

from . import prompts


# ----- Tolerant JSON envelope parse ---------------------------------------

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def parse_envelope(text: str) -> dict[str, Any] | None:
    """Pull a JSON object from a model response. Returns None on failure."""
    if not text:
        return None
    m = _JSON_FENCE_RE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    first = text.find("{")
    last = text.rfind("}")
    if 0 <= first < last:
        try:
            return json.loads(text[first : last + 1])
        except json.JSONDecodeError:
            return None
    return None


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
    """Lightweight agent base. Subclasses set `stage` + `_resource_label`
    and implement `build_prompts(...)` returning `(system, user)`."""

    stage: str = "unknown"
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
        return AgentCall(
            stage=self.stage,
            raw_text=result.text,
            parsed=parse_envelope(result.text),
            token_count=result.token_count,
            latency_ms=result.latency_ms,
            model_used=result.model_used,
        )


# ----- Concrete agents ----------------------------------------------------


class ParserAgent(BaseAgent):
    stage = "parser"

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
