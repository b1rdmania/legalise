"""Phase 1 state machine primitive.

Generic state-machine substrate consumed by reference modules
(``legalise-intake``, ``legalise-output-lifecycle``, future
firm-private operational modules). Modules declare definitions; the
runtime owns lifecycle, transition validation, gate execution, audit
emission, and current-state reads.

Per docs/architecture/STATE_MACHINE_PRIMITIVE.md.

Public surface:

    from app.core.state_machine import (
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

from app.core.state_machine.registry import (
    DefinitionNotFoundError,
    InvalidDefinitionError,
    list_definitions,
    load_definition,
    register_definition,
)
from app.core.state_machine.runtime import (
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
