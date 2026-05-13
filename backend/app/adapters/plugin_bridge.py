"""Plugin bridge — invokes claude-for-uk-legal skills with matter context.

v0.1 strategy: direct skill rendering — read SKILL.md, render with matter context,
call Claude through the model gateway, return result, log audit entry.

v0.2 will migrate to MCP server invocation.

Real implementation lands Week 1 Day 5.
"""

from pathlib import Path


class PluginBridge:
    """Calls a skill from the claude-for-uk-legal plugin suite."""

    def __init__(self, plugins_root: Path):
        self.plugins_root = plugins_root

    async def invoke(
        self,
        plugin: str,
        skill: str,
        matter_id: str,
        inputs: dict,
    ) -> dict:
        # TODO(Week 1 Day 5):
        # 1. Load SKILL.md from {plugins_root}/{plugin}/skills/{skill}/SKILL.md
        # 2. Build prompt with matter context (matter.md content, relevant documents)
        # 3. Call ModelGateway with the prompt
        # 4. Parse output
        # 5. Log PluginInvocation audit entry
        # 6. Return structured result
        raise NotImplementedError("Plugin bridge lands Week 1 Day 5.")
