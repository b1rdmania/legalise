"""Multi-agent orchestrator — placeholder, not used at runtime in v0.1.

Module-local pipelines own their own composition. See e.g.
`app/modules/pre_motion/pipeline.py` (four-stage adversarial premortem
with parallel sub-agents) and `app/modules/contract_review/pipeline.py`
(parser/analyst/redliner/summariser). A shared orchestrator is a v0.2+
consideration and intentionally out of scope for v0.1.
"""

from collections.abc import Sequence

from app.agents.base import AgentResult, BaseAgent


class SequentialOrchestrator:
    """Run agents one after another, passing each output as the next input."""

    def __init__(self, agents: Sequence[BaseAgent]):
        self.agents = agents

    async def run(self, initial_inputs: dict, *, matter_id: str) -> list[AgentResult]:
        raise NotImplementedError(
            "Shared orchestrator is a v0.2+ scaffold. In v0.1, modules pipeline "
            "locally — see app/modules/<name>/pipeline.py."
        )
