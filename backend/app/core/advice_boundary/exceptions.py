"""Typed advice-boundary exceptions for capability dispatch."""

from __future__ import annotations

from typing import Any


class AdviceBoundaryDenied(Exception):
    """Raised when an advice-boundary decision denies or blocks output.

    The advice-boundary gate records the immutable decision row and
    returns ``allowed=False``. Capability implementations raise this
    typed exception so the invocation endpoint can translate only this
    condition to the structured ``advice_boundary_denied`` HTTP 403.
    """

    def __init__(self, gate_result: dict[str, Any]) -> None:
        self.gate_result = gate_result
        self.decision_id = gate_result.get("decision_id")
        self.gate_state = gate_result.get("gate_state") or {}
        super().__init__(
            f"advice-boundary gate denied: {self.gate_state!r}"
        )

