# Intake Spec

Intake is the pre-matter state machine. It controls when a matter exists and records the assumptions under which it was opened.

Specific intake workflows are modules. The state machine belongs to Matter OS.

## State Machine

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

## State Meanings

- `prospect`: initial contact or imported lead. No matter exists.
- `conflict_check`: identity and adverse-party information collected enough to run conflict checks.
- `scope_check`: potential matter is sufficiently understood to define scope.
- `client_verified`: KYC/AML/client identity requirements complete for this workspace's policy.
- `matter_opened`: matter exists and receives matter id/slug.

## Core Data Model

`prospects` table:

- `id`
- `workspace_id`
- `created_by_id`
- `source`
- `contact_name`
- `contact_email`
- `contact_phone`
- `status`
- `matter_type`
- `jurisdiction`
- `summary`
- `adverse_parties`
- `conflict_check_status`
- `scope_check_status`
- `kyc_status`
- `scope_agreed_at`
- `client_verified_at`
- `matter_id`
- `created_at`
- `updated_at`

## Transition Rules

- Only `client_verified` can transition to `matter_opened`.
- `conflict_blocked` cannot transition to `matter_opened`.
- `scope_rejected` cannot transition to `matter_opened`.
- `declined`, `withdrawn`, and `duplicate` are terminal unless admin reopens.
- Every transition emits audit.

## Module Plug-Points

Intake modules can attach to:

- `intake.prospect.created`
- `intake.conflict_check`
- `intake.scope_check`
- `intake.kyc`
- `intake.open_matter`

Example modules:

- employment intake questionnaire
- divorce intake questionnaire
- conflict checker
- Companies House party lookup
- KYC/AML connector

## Capability Grammar

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

The intake UI should show:

- current state
- missing requirements
- blocking checks
- modules available for current stage
- audit history
- eventual matter link once opened

## Khan Demo

Khan must include intake history:

```text
prospect → conflict_check → scope_check → client_verified → matter_opened
```

The audit reconstruction view should show each intake transition.

