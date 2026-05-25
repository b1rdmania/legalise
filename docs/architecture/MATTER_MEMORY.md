# Matter Memory Reference Module

Matter memory is not a hardcoded core ontology. It is a first-party reference module built on the generic matter-context store.

The runtime supplies typed context namespaces, schema validation, capability-scoped reads/writes, and audit. The `legalise-matter-memory` module supplies the legal-domain categories.

## Module Target

```text
examples/modules/reference/legalise-matter-memory/
```

Runtime:

- `kind: tool`
- `scope: matter`
- consumes `core/matter_context`
- exposes structured matter knowledge to modules and the assistant

## Domain Categories

The reference module declares schemas for:

- accepted facts
- disputed facts
- assumptions
- open questions
- deadlines
- authorities
- user decisions
- concessions

These categories are not core runtime constants. They are module-declared context schemas.

## Context Schema Pattern

Each category registers a JSON Schema under a namespace.

Example:

```text
legalise-matter-memory.accepted_facts
```

Fields can include:

- text
- source type
- source id
- status
- confidence
- tags
- created by user
- created by module
- superseded by id

## Capability Grammar

The reference module registers namespaced capabilities:

- `matter.context.legalise_memory.accepted_facts.read`
- `matter.context.legalise_memory.accepted_facts.write`
- `matter.context.legalise_memory.disputed_facts.read`
- `matter.context.legalise_memory.disputed_facts.write`
- `matter.context.legalise_memory.assumptions.read`
- `matter.context.legalise_memory.assumptions.write`
- `matter.context.legalise_memory.open_questions.read`
- `matter.context.legalise_memory.open_questions.write`
- `matter.context.legalise_memory.deadlines.read`
- `matter.context.legalise_memory.deadlines.write`
- `matter.context.legalise_memory.authorities.read`
- `matter.context.legalise_memory.authorities.write`
- `matter.context.legalise_memory.decisions.read`
- `matter.context.legalise_memory.decisions.write`
- `matter.context.legalise_memory.concessions.read`
- `matter.context.legalise_memory.concessions.write`

## Audit Events

- `matter_memory.item.created`
- `matter_memory.item.updated`
- `matter_memory.item.superseded`
- `matter_memory.item.withdrawn`
- `matter_memory.item.confirmed`
- `matter_memory.item.disputed`

Module-created memory items must record module id and capability id.

## Assistant Context

Assistant context may include the reference module's categories when granted:

- accepted facts
- disputed facts
- assumptions
- open questions
- deadlines
- authorities
- recent decisions

The assistant should not silently promote generated claims into accepted facts. Promotion requires either human confirmation or module-specific gate.

## UI Requirements

The reference module UI should provide a structured matter memory sidebar:

- grouped by category
- source visible
- module-created items labelled
- confirm/dispute/supersede actions
- filter by source/module

## Relationship To Evidence Packs

Evidence packs can cite matter-memory items, but memory items need source references. A conclusion without source should remain an assumption or open question, not accepted fact.

