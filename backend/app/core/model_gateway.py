"""Model gateway — abstracts Anthropic, OpenAI, Ollama behind one interface.

v0.1 stub. Real implementation lands Week 1 Day 1.
"""

from enum import Enum
from typing import Protocol


class PrivilegePosture(str, Enum):
    A_CLEARED = "A_cleared"
    B_MIXED = "B_mixed"
    C_PAUSED = "C_paused"


class ModelProvider(Protocol):
    async def call(self, prompt: str, *, system: str | None = None, **kwargs) -> str:
        ...


class ModelGateway:
    """Per-matter privilege-aware model routing.

    Day 1 of Week 1 wires real providers. Pre-build placeholder for shape only.
    """

    async def call(
        self,
        matter_id: str,
        prompt: str,
        *,
        model: str | None = None,
        posture: PrivilegePosture | None = None,
        system: str | None = None,
    ) -> str:
        # TODO(Week 1 Day 1): resolve provider per posture, call, log audit entry.
        raise NotImplementedError("Model gateway lands Week 1 Day 1.")
