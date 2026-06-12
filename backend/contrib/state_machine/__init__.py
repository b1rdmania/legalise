"""State machine primitive — DORMANT, parked in contrib/.

Status (2026-06-12, fluff-cut order Phase D): declared but unenforced
in v0.1. Verified before the move: no live request path transitions
through this runtime. The only app importer was its own generic HTTP
API (``/api/state-machine``, moved here as ``api.py`` and unmounted
from ``app.main``); the trust/install ceremony has its own
``CeremonyState`` logic in ``app/core/trust_ceremony.py`` and does not
use this primitive; the frontend never called the endpoints (the audit
source chips render disabled). Audit reconstruction still reads the
``StateMachine*`` model tables directly — the models and migrations
stay in ``app/models``; only the runtime/registry/API live here.

Revived by: the v0.2 output-lifecycle roadmap item (output state
transitions gate through this runtime; ``legalise-output-lifecycle``
was the intended first consumer). To revive: move this package back
under ``app/core/``, remount ``api.py`` in ``app/main``, and restore
the parked tests from ``backend/tests/dormant/``.

Spec: docs/architecture/STATE_MACHINE_PRIMITIVE.md.

Generic state-machine substrate: modules declare definitions; the
runtime owns lifecycle, transition validation, gate execution, audit
emission, and current-state reads.

Public surface:

    from contrib.state_machine import (
        register_definition,
        load_definition,
        list_definitions,
        create_instance,
        request_transition,
        read_instance,
        read_history,
        register_gate,
        InvalidDefinitionError,
        DefinitionNotFoundError,
        InstanceNotFoundError,
    )
"""

from contrib.state_machine.registry import (
    DefinitionNotFoundError,
    InvalidDefinitionError,
    list_definitions,
    load_definition,
    register_definition,
)
from contrib.state_machine.runtime import (
    InstanceNotFoundError,
    create_instance,
    read_history,
    read_instance,
    register_gate,
    request_transition,
)

__all__ = [
    "register_definition",
    "load_definition",
    "list_definitions",
    "create_instance",
    "request_transition",
    "read_instance",
    "read_history",
    "register_gate",
    "InvalidDefinitionError",
    "DefinitionNotFoundError",
    "InstanceNotFoundError",
]
