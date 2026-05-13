"""Base agent abstraction for multi-agent pipelines.

Ported from Bird Legal MVP. Real implementation lands Week 2 (chronology + contract review
both depend on this).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class AgentResult:
    output: Any
    metadata: dict
    success: bool
    error: str | None = None


class BaseAgent(ABC):
    """Abstract base for any agent in a pipeline.

    An agent wraps a single LLM call with a system prompt, optional tools, and
    structured input/output. Orchestrators compose agents sequentially or in parallel.
    """

    name: str
    system_prompt: str

    @abstractmethod
    async def run(self, inputs: dict, *, matter_id: str) -> AgentResult:
        ...
