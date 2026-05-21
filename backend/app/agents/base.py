"""Base agent abstraction — placeholder for a future shared abstraction.

Not used at runtime in v0.1. Module-local pipelines (e.g.
`app/modules/pre_motion/pipeline.py`) define sub-agent classes directly
and do not subclass this. Kept as a v0.2+ scaffold; subject to redesign
before any module is wired against it.
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
