# State Machine Primitive

> **Status (2026-06-12): DORMANT.** No v0.1 request path transitions through this primitive, so the runtime, registry, and HTTP API are parked in `backend/contrib/state_machine/` (out of the app import graph; the `/api/state-machine` routes are unmounted) and its tests in `backend/tests/dormant/`. The `StateMachine*` models and migrations stay live — audit reconstruction reads the tables. The v0.2 output-lifecycle roadmap item revives it. This document is the spec for that revival.

The state-machine primitive is a generic substrate service. It lets modules declare states and transitions without hardcoding legal-domain workflows into core.

It is consumed by first-party modules such as `legalise-intake` and `legalise-output-lifecycle`, and by future firm-private operational modules.

## Core Responsibility

Core owns:

- state-machine definitions
- instances
- transition validation
- transition guards
- gate checks
- audit emission
- current-state read APIs

Core does not own:

- intake states
- output lifecycle states
- billing states
- case-management workflows
- domain-specific transition labels

## Definition Shape

```json
{
  "id": "legalise-intake.default",
  "module_id": "legalise-intake",
  "version": "1.0.0",
  "states": ["prospect", "conflict_check", "scope_check", "client_verified", "matter_opened"],
  "initial_state": "prospect",
  "terminal_states": ["matter_opened", "declined", "withdrawn"],
  "transitions": [
    {
      "from": "prospect",
      "to": "conflict_check",
      "gates": [],
      "required_capabilities": ["workspace.intake.prospects.write"]
    }
  ]
}
```

## Storage

Suggested tables:

- `state_machine_definitions`
- `state_machine_instances`
- `state_machine_transitions`

Definitions are versioned. Instances record the definition version they were created under.

## Transition Semantics

Transition request:

```json
{
  "instance_id": "sm_...",
  "to_state": "scope_check",
  "reason": "Conflict check completed",
  "metadata": {}
}
```

Runtime steps:

1. Load instance and definition.
2. Verify requested transition is valid.
3. Verify caller has required capability.
4. Run gates.
5. Persist transition.
6. Emit audit.
7. Return new state and available next transitions.

## Audit Events

- `state_machine.instance.created`
- `state_machine.transition.requested`
- `state_machine.transition.completed`
- `state_machine.transition.blocked`
- `state_machine.transition.failed`

Domain modules may additionally emit namespaced events such as `intake.matter.opened`.

## Failure Semantics

Invalid transitions fail closed.

Gate-blocked transitions leave the previous state unchanged and emit audit.

Partial state transitions are not allowed. Transition write and audit write should commit together or the transition fails.

## UI Contract

The API returns:

- current state
- state label
- terminal flag
- available transitions
- gates required for each transition
- blocked reasons
- transition history

Domain modules provide labels and copy. Core provides structure.
