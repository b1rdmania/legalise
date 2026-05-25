# Matter Memory

Matter memory is structured matter knowledge. It is not chat history and not a prompt dump.

Capabilities read and write matter memory under explicit permissions.

## Memory Categories

V1 categories:

- accepted facts
- disputed facts
- assumptions
- open questions
- deadlines
- authorities
- user decisions
- concessions

## Data Model

One table per category is acceptable, but a unified table is simpler for V1.

Suggested unified table: `matter_memory_items`.

Fields:

- `id`
- `matter_id`
- `category`
- `text`
- `status`
- `source_type`
- `source_id`
- `created_by_user_id`
- `created_by_module_id`
- `confidence`
- `tags`
- `metadata`
- `created_at`
- `updated_at`
- `superseded_by_id`

Category-specific fields can live in `metadata` initially.

## Status Values

General:

- `active`
- `disputed`
- `superseded`
- `withdrawn`
- `needs_review`

Facts:

- `accepted`
- `disputed`

Questions:

- `open`
- `answered`
- `irrelevant`

Deadlines:

- `pending`
- `met`
- `missed`
- `extended`

## Capability Grammar

- `matter.memory.accepted_facts.read`
- `matter.memory.accepted_facts.write`
- `matter.memory.disputed_facts.read`
- `matter.memory.disputed_facts.write`
- `matter.memory.assumptions.read`
- `matter.memory.assumptions.write`
- `matter.memory.open_questions.read`
- `matter.memory.open_questions.write`
- `matter.memory.deadlines.read`
- `matter.memory.deadlines.write`
- `matter.memory.authorities.read`
- `matter.memory.authorities.write`
- `matter.memory.decisions.read`
- `matter.memory.decisions.write`
- `matter.memory.concessions.read`
- `matter.memory.concessions.write`

## Audit Events

- `matter_memory.item.created`
- `matter_memory.item.updated`
- `matter_memory.item.superseded`
- `matter_memory.item.withdrawn`
- `matter_memory.item.confirmed`
- `matter_memory.item.disputed`

Module-created memory items must record module id and capability id.

## Assistant Context

Assistant context should include structured memory sections:

- accepted facts
- disputed facts
- assumptions
- open questions
- deadlines
- authorities
- recent decisions

The assistant should not silently promote generated claims into accepted facts. Promotion requires either human confirmation or module-specific gate.

## UI Requirements

Matter memory sidebar:

- grouped by category
- source visible
- module-created items labelled
- confirm/dispute/supersede actions
- filter by source/module

## Relationship To Evidence Packs

Evidence packs can cite memory items, but memory items need source references. A conclusion without source should remain an assumption or open question, not accepted fact.

