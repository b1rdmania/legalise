"""Canonical BlockedPayload — the JSON shape every Phase 1 ``*.blocked``
audit row and HTTP error response carries.

Locked at HANDOVER_PHASE_1_START.md (commit `186005a`):

    {
      "status": "blocked",
      "blocked_reason": "<BlockedReason enum value>",
      "denied_capability": "<capability string if applicable>",
      "gate_state": "<gate-specific dict if applicable>"
    }

Every Phase 1 primitive that rejects an operation builds one of these
and writes it into the audit row's ``payload`` JSONB column. The same
payload is included on the structured 403/409 HTTP response.

Reconstruction (Phase 5) reads the ``blocked_reason`` and
``denied_capability`` fields to render the regulator-legible view.
The shape is stable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class BlockedReason(str, Enum):
    """The canonical reasons a Phase 1 operation can be blocked.

    Order is intentional: more-frequent reasons first. The enum
    inherits from ``str`` so audit rows can JSON-serialise the value
    directly without needing a converter.
    """

    CAPABILITY_DENIED = "capability_denied"
    GATE_BLOCKED = "gate_blocked"
    INVALID_TRANSITION = "invalid_transition"
    SCHEMA_VIOLATION = "schema_violation"
    ROLE_DENIED = "role_denied"
    MISSING_INPUT = "missing_input"
    TIER_EXCEEDED = "tier_exceeded"
    TIER_DISALLOWED = "tier_disallowed"


@dataclass(frozen=True)
class BlockedPayload:
    """Canonical Phase 1 blocked payload.

    Always carries ``status="blocked"`` and ``blocked_reason``.
    ``denied_capability`` is populated when the block was a
    capability denial. ``gate_state`` is populated when a gate
    returned a structured state (e.g. advice-boundary tier check).
    """

    blocked_reason: BlockedReason
    denied_capability: str | None = None
    gate_state: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Render as a JSON-serialisable dict for audit payloads and
        HTTP responses.

        Omits ``denied_capability`` and ``gate_state`` keys when None
        so the audit row stays compact. The ``status`` key is always
        present and always ``"blocked"``.
        """
        out: dict[str, Any] = {
            "status": "blocked",
            "blocked_reason": self.blocked_reason.value,
        }
        if self.denied_capability is not None:
            out["denied_capability"] = self.denied_capability
        if self.gate_state is not None:
            out["gate_state"] = self.gate_state
        return out
