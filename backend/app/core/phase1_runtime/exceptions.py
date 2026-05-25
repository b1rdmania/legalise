"""Phase 1 runtime exceptions.

``Phase1Blocked`` is raised by substrate primitives when an operation
is rejected for a reason that is not a system error — capability
denied, gate blocked, invalid transition, schema violation, role
denied, etc. The exception carries the canonical ``BlockedPayload``
so the FastAPI handler can return a structured response and the
audit row already-written is consistent with the response.

``Phase1Failed`` is raised on system errors (DB write failure,
unreachable external service, programming bug). It is distinct from
``Phase1Blocked`` because the audit semantics differ: blocked is an
expected operational outcome that the caller can recover from;
failed is an unexpected system condition that gets the
``*.failed`` audit event and a 500-class response.
"""

from __future__ import annotations

from app.core.phase1_runtime.blocked import BlockedPayload


class Phase1Blocked(Exception):
    """Substrate-primitive operation rejected for a non-system reason.

    Carries the canonical ``BlockedPayload`` so callers and HTTP
    handlers can render a structured response and the audit row
    already-written matches the response shape exactly.

    Raised by ``check_or_block`` on capability denial and by
    primitive runtime code on gate/transition/schema/role denials.
    """

    def __init__(self, payload: BlockedPayload) -> None:
        self.payload = payload
        super().__init__(
            f"phase1 blocked: reason={payload.blocked_reason.value} "
            f"capability={payload.denied_capability!r}"
        )


class Phase1Failed(Exception):
    """Substrate-primitive operation failed due to a system error.

    Distinct from ``Phase1Blocked``: ``failed`` means something
    unexpected went wrong (DB write failure, unreachable service,
    programming bug). The corresponding audit event is
    ``<primitive>.<verb>.failed`` not ``.blocked``.
    """

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        self.cause = cause
        super().__init__(message)
