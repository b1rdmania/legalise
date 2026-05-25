# Output Lifecycle

Generated legal outputs need explicit state. A generated draft, reviewed draft, cleared letter, sent document, and withdrawn output are not the same thing.

Output lifecycle belongs to Matter OS.

## State Machine

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

## Output Types

- generated document
- letter
- advice note
- redline set
- evidence pack
- chronology export
- review table
- case-law note

## Core Fields

Extend generated document/output records with:

- `lifecycle_state`
- `lifecycle_history`
- `created_by_module_id`
- `created_by_capability_id`
- `cleared_by_user_id`
- `cleared_at`
- `sent_at`
- `signed_at`
- `superseded_by_id`
- `withdrawn_at`
- `withdrawal_reason`
- `advice_tier`

## Transition Gates

Transitions may require gates:

- `draft → reviewed`: human review
- `reviewed → cleared`: advice boundary gate
- `cleared → sent`: supervisor approval if configured
- any transition involving disclosed material: CPR/privilege gates as configured

## Module Manifest Field

Capabilities can declare:

```json
{
  "output_lifecycle_target": "reviewed"
}
```

The runtime prevents a module from creating an output above its declared target.

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

Actions that require gates should show the gate before transition.

## Relationship To Redliner

Document Redliner produces:

- proposed redlines in `draft`
- accepted edited document in `reviewed`
- exported final document can move to `cleared` after human approval

Every accept/reject/edit decision is separate audit.

