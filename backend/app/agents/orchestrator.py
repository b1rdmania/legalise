"""Multi-agent orchestrator — sequential and parallel composition.

Real implementation lands Week 2 (used by chronology and contract review).
"""

from collections.abc import Sequence

from app.agents.base import AgentResult, BaseAgent


class SequentialOrchestrator:
    """Run agents one after another, passing each output as the next input."""

    def __init__(self, agents: Sequence[BaseAgent]):
        self.agents = agents

    async def run(self, initial_inputs: dict, *, matter_id: str) -> list[AgentResult]:
        # TODO(Week 2): stream stage status to the frontend via SSE.
        raise NotImplementedError("Orchestrator lands Week 2.")
