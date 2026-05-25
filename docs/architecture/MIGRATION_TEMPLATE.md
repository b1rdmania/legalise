# Reference Module Migration Template

Every first-party workflow that is not immediately ported must have a concrete `MIGRATION.md`. This file is the canonical template.

If the template cannot be filled out for a workflow, the capability runtime is missing a primitive.

## Template

```markdown
# Migration Target: <Module Name>

## Summary

One paragraph describing what the module does and why it belongs as a reference module or migration target.

## Current Location

- Backend:
- Frontend:
- Routes:
- Models:
- Existing tests:

## Target Module

- Module id:
- Runtime: native | mcp
- Kind: skill | tool | workflow | provider | gate
- Scope: matter | workspace | global
- Visibility: first_party | example | community | firm_private
- UI slot:

## Capabilities

### <capability-id>

- Kind:
- Scope:
- Reads:
- Writes:
- Model access: none | optional | required | delegated
- External network: true | false
- Data movement:
- Gates:
- Advice tier max:
- Output lifecycle target:
- Streaming mode: sync | streaming | async
- Audit events:

## Dependencies

- Required modules:
- Required providers:
- Required host version:
- Required matter schema version:

## Sandboxing Approach

- Runtime process:
- Filesystem needs:
- Network needs:
- Resource limits:
- Special sandbox profile:

## Gate Behaviour

List every declared gate and its pass/block behaviour.

## Failure Semantics

- What can fail:
- What partial writes may exist:
- What audit events are emitted:
- Whether outputs are marked partial/failed:

## Permission Card Copy

User-facing permission text.

## Output Artifacts

- Generated documents:
- Matter memory writes:
- Evidence packs:
- Redlines:
- Citations:
- Tasks/notes:

## Audit Contract

Expected audit row sequence for:

- successful run
- gate-blocked run
- provider failure
- sandbox failure
- partial failure

## Test Matter

- Khan path:
- Required seed data:
- Expected visible result:

## Migration Steps

1.
2.
3.

## Risks

- Runtime gaps:
- UX gaps:
- Data safety risks:
- Licensing risks:
```

## Required Workflows

Immediate reference ports write `MIGRATION.md` after successful port:

- Contract Review
- Pre-Motion
- Document Redliner

Migration targets before port:

- Letters
- Tabular Review
- Case Law
- Anonymisation
- Chronology
- Document Edit

## Review Rule

Reviewer sign-off is required before a migration target can be considered complete.

