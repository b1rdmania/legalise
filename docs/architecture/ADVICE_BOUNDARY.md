# Advice Boundary

The advice-boundary primitive is a generic substrate gate. It enforces the legal-advice tier of every output that flows through the runtime.

It is consumed by every output-producing capability (workflows, skills, tools that generate documents) and by the output-lifecycle reference module. It is required for SRA / PI / regulatory framing.

## Core Responsibility

Core owns:

- the five-tier vocabulary
- allowed tier transitions
- gate execution
- approval-actor enforcement (who can move an output to which tier)
- immutability of terminal tiers
- audit emission

Core does not own:

- domain-specific tier mappings (e.g. "an LBA letter is `draft_advice`")
- module-specific approval workflows
- supervisor identity / role hierarchy beyond a generic "approving_user_id"
- billing-tier coupling

Domain-specific tier choices are declared by modules via the manifest `advice_tier_max` field (Phase 2). The gate primitive itself in Phase 1 is invokable directly via API.

## Tier Vocabulary

The five tiers, in ascending order of regulatory exposure:

| # | Tier | Meaning |
|---|---|---|
| 1 | `factual_extraction` | Extracting facts from documents. No legal opinion. Lowest risk. |
| 2 | `legal_information` | General statements about what the law is. No application to the matter. Moderate risk. |
| 3 | `draft_advice` | Provisional legal advice applied to the matter, not yet reviewed by a qualified solicitor. High risk; not deliverable to client. |
| 4 | `supervised_legal_advice` | Legal advice reviewed and signed off by a qualified solicitor on this firm's roll. Billable. Deliverable internally. Highest *active* risk. |
| 5 | `approved_final_advice` | Final advice cleared for delivery to the client. Immutable. Audit-locked. |

Tier names are canonical. Modules and capabilities must reference these exact strings.

## Transition Rules

Allowed transitions:

```text
factual_extraction       → legal_information
factual_extraction       → draft_advice
legal_information        → draft_advice
draft_advice             → supervised_legal_advice
supervised_legal_advice  → approved_final_advice
```

Disallowed:

- No skipping `supervised_legal_advice` on the way to `approved_final_advice`. Approved advice must always have been supervised.
- No downward transitions (an output cannot drop from `supervised_legal_advice` back to `draft_advice`). To replace supervised content, supersede the output and create a new one.
- No transition out of `approved_final_advice`. Terminal and immutable.

Each transition has actor constraints:

- `factual_extraction → legal_information`: any user with `matter.write` on the matter
- `factual_extraction → draft_advice`: any user with `matter.write`
- `legal_information → draft_advice`: any user with `matter.write`
- `draft_advice → supervised_legal_advice`: only a user whose workspace role is `qualified_solicitor` (Phase 1 enforces this via a generic role check; Phase 2 wires SRA roll verification when intake module lands)
- `supervised_legal_advice → approved_final_advice`: only a user whose workspace role is `qualified_solicitor` AND who is named as the supervising actor on the output, OR a workspace admin with explicit sign-off

## Immutability

`approved_final_advice` is terminal and immutable. Once an output reaches this tier:

- the underlying generated document content cannot be edited
- the advice-boundary decision row cannot be deleted or updated
- the output can be superseded by a new output that supersedes it via `OUTPUT_LIFECYCLE.md` `superseded` state
- the audit trail of how it reached `approved_final_advice` is permanent

## Gate API Surface

Phase 1 exposes the primitive as a callable gate. Capabilities invoke it programmatically:

```text
core.advice_boundary.check(
  output_id,
  requested_tier,
  declared_tier_max,   # optional in Phase 1; required in Phase 2 from manifest
  actor_user_id,
  actor_role,
  module_id,
  capability_id
) → {
  allowed: bool,
  decision_id: str,
  gate_state: {
    requested_tier: str,
    declared_tier_max: str | null,
    actor_role: str,
    blocked_reason: str | null,
    requires_supervisor_approval: bool
  }
}
```

Behaviour:

- Reject if `requested_tier` is not in the canonical five-tier vocabulary.
- Reject if `requested_tier` exceeds `declared_tier_max` (Phase 2; Phase 1 accepts null `declared_tier_max` and audits the gap).
- Reject if the transition from the output's current tier to `requested_tier` is not in the allowed transition set.
- Reject if `actor_role` does not satisfy the role constraint for the requested transition.
- Emit audit on every call regardless of outcome.

In Phase 1 the gate is invoked directly by capability code. In Phase 2 it is wired to the manifest `advice_tier_max` field so the runtime can enforce at the capability boundary without capabilities having to call the gate explicitly.

## REST API

Phase 1 also exposes the gate via HTTP so frontend / external callers can use it:

- `POST /api/advice-boundary/check` — invoke the gate. Same payload as the programmatic API. Returns the same decision object.

## Audit Events

- `advice_boundary.check.requested`
- `advice_boundary.check.completed`
- `advice_boundary.check.blocked` (transition not allowed by rules)
- `advice_boundary.check.denied` (caller lacks role / tier exceeds declared max)
- `advice_boundary.check.failed` (system error)

Each event records:

- output id
- current tier
- requested tier
- declared tier max (if provided)
- actor user id
- actor role
- module id
- capability id
- gate state
- decision id

## Storage

Single table:

- `advice_boundary_decisions` — `(id, output_id, from_tier, to_tier, actor_user_id, actor_role, module_id, capability_id, gate_state JSONB, status, decided_at)`. Append-only. `status ∈ {requested, completed, blocked, denied, failed}`.

## UI Contract

Phase 12 frontend must render, per output:

- current tier as a visible badge
- next available tier (if any)
- the action that would trigger transition (e.g. "Mark as reviewed by solicitor")
- the role required for the transition
- the audit trail of past transitions

For `approved_final_advice` outputs the UI shows a lock icon and disables edit affordances.

## Relationship to Manifest (Phase 2)

The manifest `advice_tier_max` field on a capability declares the highest tier that capability's outputs may ever reach without further human intervention.

In Phase 2:

- the runtime reads `advice_tier_max` from the installed module's manifest
- on every output creation, the runtime passes `declared_tier_max` into `core.advice_boundary.check`
- requests above the declared max are blocked with `advice_boundary.check.denied`

In Phase 1 this is invoked directly by capability code; modules are trusted to pass their own `declared_tier_max`. Phase 2 closes that loop.

## Relationship to Output Lifecycle

`OUTPUT_LIFECYCLE.md` defines transitions `draft → reviewed → cleared → sent/signed`. Those are *delivery-state* transitions, not *advice-tier* transitions, but they typically correlate:

- `draft` outputs are typically at `draft_advice` tier or below
- `reviewed` outputs are typically at `supervised_legal_advice`
- `cleared` outputs are typically at `approved_final_advice`

The two state machines are independent in Phase 1. Output-lifecycle module (Phase 7-11 reference module) MAY introduce gates that bind the two together, e.g. requiring `supervised_legal_advice` tier before `reviewed → cleared` transition. That binding is module policy, not core enforcement.

## Phase 1 Scope

In scope:

- five-tier vocabulary locked in code as an enum
- transition rule set locked in code
- role-check logic for each transition
- callable gate API (`core.advice_boundary.check`)
- REST endpoint (`POST /api/advice-boundary/check`)
- model + migration
- audit emission on every code path
- tests: valid transition, invalid transition, role denial, tier exceeds null max (logged), gate-blocked transition, immutability of terminal tier, audit emission

Out of scope (deferred to Phase 2):

- reading `advice_tier_max` from manifest v2
- runtime auto-injection of the gate into capability invocations (capabilities call the gate explicitly in Phase 1)

Out of scope (deferred to Phase 7-11 reference modules):

- SRA roll verification for `qualified_solicitor` role (Phase 1 uses a generic workspace role check)
- output-lifecycle integration

## Failure Semantics

The gate fails closed. If the gate API errors, the output stays at its current tier and an `advice_boundary.check.failed` audit row is emitted.

No partial transitions. The decision row write and the audit row write commit together or the transition fails.
