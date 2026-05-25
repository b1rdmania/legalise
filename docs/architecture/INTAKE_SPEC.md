# Intake Reference Module

Intake is not a core Legalise state machine. It is a first-party reference module built on the generic state-machine primitive.

The runtime supplies state definitions, guarded transitions, capability enforcement, gates, and audit. The `legalise-intake` module supplies the legal-domain states and workflow.

## Module Target

```text
examples/modules/reference/legalise-intake/
```

Runtime:

- `kind: workflow`
- `scope: workspace`
- consumes `core/state_machine`
- writes prospect records and, after completion, opens a matter

## Domain State Machine

The reference module declares:

```text
prospect
  → conflict_check
  → scope_check
  → client_verified
  → matter_opened
```

Terminal non-open states:

```text
declined
withdrawn
duplicate
conflict_blocked
scope_rejected
verification_failed
```

These states are not hardcoded into core. They are module-declared states validated and enforced by the generic state-machine primitive.

## State Meanings

- `prospect`: initial contact or imported lead. No matter exists.
- `conflict_check`: identity and adverse-party information collected enough to run conflict checks.
- `scope_check`: potential matter is sufficiently understood to define scope.
- `client_verified`: KYC/AML/client identity requirements complete for this workspace's policy.
- `matter_opened`: matter exists and receives matter id/slug.

## Module Data

The module owns prospect-specific schema:

- contact name
- contact email
- contact phone
- matter type
- jurisdiction
- summary
- adverse parties
- conflict check status
- scope status
- KYC status
- linked matter id

Implementation can store this through module-owned tables or through `core/matter_context` once the prospect becomes matter-linked. Core should not own these fields.

## Transition Rules

The module declares rules consumed by `core/state_machine`:

- only `client_verified` can transition to `matter_opened`
- `conflict_blocked` cannot transition to `matter_opened`
- `scope_rejected` cannot transition to `matter_opened`
- terminal states require admin reopen
- every transition emits audit

## Plug-Points

Other modules can attach to:

- `intake.prospect.created`
- `intake.conflict_check`
- `intake.scope_check`
- `intake.kyc`
- `intake.open_matter`

Examples:

- employment intake questionnaire
- divorce intake questionnaire
- conflict checker
- Companies House party lookup
- KYC/AML connector

## Capability Grammar

The reference module registers namespaced capabilities:

- `workspace.intake.prospects.read`
- `workspace.intake.prospects.write`
- `workspace.intake.conflicts.write`
- `workspace.intake.scope.write`
- `workspace.intake.kyc.write`
- `workspace.intake.open_matter`

Matter-scoped modules cannot read prospects unless granted workspace intake capability.

## Audit Events

- `intake.prospect.created`
- `intake.conflict_check.started`
- `intake.conflict_check.completed`
- `intake.scope_check.completed`
- `intake.kyc.completed`
- `intake.matter.opened`
- `intake.declined`
- `intake.withdrawn`
- `intake.blocked`

## UI Requirements

The reference module UI should show:

- current state
- missing requirements
- blocking checks
- modules available for current stage
- audit history
- eventual matter link once opened

## Khan Demo

Khan should include an intake reference-module history, but the Khan-specific data belongs in seed/demo docs, not this substrate spec.

