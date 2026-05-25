# Output Lifecycle Reference Module

Output lifecycle is not a hardcoded core state machine. It is a first-party reference module built on the generic state-machine primitive.

The runtime supplies state definitions, guarded transitions, gates, and audit. The `legalise-output-lifecycle` module supplies the legal-domain lifecycle states for generated outputs.

## Module Target

```text
examples/modules/reference/legalise-output-lifecycle/
```

Runtime:

- `kind: workflow`
- `scope: matter`
- consumes `core/state_machine`
- applies to generated legal outputs

## Domain State Machine

The reference module declares:

```text
draft
  → reviewed
  → cleared
  → sent
```

Alternative terminal states:

```text
signed
superseded
withdrawn
failed
```

Allowed transitions:

- `draft → reviewed`
- `reviewed → cleared`
- `cleared → sent`
- `cleared → signed`
- `draft|reviewed|cleared → withdrawn`
- `draft|reviewed|cleared|sent|signed → superseded`
- `draft → failed`

These states are module-declared and runtime-enforced, not built into Matter OS as legal-domain constants.

## Output Types

The module can manage:

- generated document
- letter
- advice note
- redline set
- evidence pack
- chronology export
- review table
- case-law note

## Data Ownership

The module owns lifecycle metadata:

- lifecycle state
- lifecycle history
- cleared by
- sent/signed timestamps
- supersession link
- withdrawal reason
- advice tier at transition

Core stores generic state-machine instances and transitions. The module maps those instances to generated outputs.

## Transition Gates

The module declares transition gates:

- `draft → reviewed`: human review
- `reviewed → cleared`: advice-boundary gate
- `cleared → sent`: supervisor approval if configured
- any transition involving disclosed material: CPR/privilege gates if configured

## Manifest Fields Used

Output-producing modules can declare:

```json
{
  "output_lifecycle_target": "reviewed"
}
```

The output-lifecycle module interprets this target and prevents the module from creating outputs above its declared state.

## Audit Events

- `output.created`
- `output.reviewed`
- `output.cleared`
- `output.sent`
- `output.signed`
- `output.superseded`
- `output.withdrawn`
- `output.failed`

Each event records:

- output id
- previous state
- new state
- actor
- module/capability if module-created
- advice tier
- gate state

## UI Requirements

Every generated output shows:

- lifecycle badge
- advice tier
- creator module
- last transition
- available next actions
- audit history

Actions requiring gates show the gate before transition.

## Document Redliner Relationship

Document Redliner is the key proof consumer:

- proposed redlines begin as draft output
- accepted edited document becomes reviewed output
- cleared export requires human approval

This relationship belongs in the Redliner reference module and tests the lifecycle module. It is not a core runtime dependency.

