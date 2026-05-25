# Matter Context Store

The matter-context store is a generic structured-data substrate. It lets modules declare typed context namespaces and read/write those namespaces under capability scope.

It replaces a hardcoded matter-memory ontology in core.

## Core Responsibility

Core owns:

- context schema registry
- schema validation
- context item storage
- capability-scoped read/write enforcement
- source references
- audit emission

Core does not own:

- accepted facts
- disputed facts
- deadlines
- authorities
- concessions
- any other legal-domain category

Those are declared by modules such as `legalise-matter-memory`.

## Schema Declaration

```json
{
  "namespace": "legalise-matter-memory.accepted_facts",
  "module_id": "legalise-matter-memory",
  "version": "1.0.0",
  "json_schema": {
    "type": "object",
    "required": ["text", "source"],
    "properties": {
      "text": {"type": "string"},
      "source": {"type": "object"},
      "confidence": {"type": "number"}
    }
  }
}
```

## Storage

Suggested tables:

- `matter_context_schemas`
- `matter_context_items`

`matter_context_items` fields:

- `id`
- `matter_id`
- `namespace`
- `payload`
- `source_type`
- `source_id`
- `created_by_user_id`
- `created_by_module_id`
- `created_at`
- `updated_at`
- `superseded_by_id`

## Capability Grammar

Generic shape:

```text
matter.context.<namespace>.<action>
```

Examples:

- `matter.context.legalise_memory.accepted_facts.read`
- `matter.context.legalise_memory.accepted_facts.write`
- `matter.context.companies_house.write`

The runtime rejects context namespace access unless the module has the matching capability.

## Source References

Every context item should be source-backed when possible.

Allowed sources:

- document id
- chronology event id
- audit entry id
- user assertion
- connector result
- generated output

Un-sourced items can exist, but they should be labelled assumptions or open questions by the module that creates them.

## Audit Events

- `matter_context.schema.registered`
- `matter_context.item.created`
- `matter_context.item.updated`
- `matter_context.item.superseded`
- `matter_context.item.withdrawn`
- `matter_context.item.read`

Read events may be sampled or aggregated later, but V1 should audit module reads that feed model calls.

## Assistant Context

The assistant context builder can include context namespaces only when:

- the current user can access the matter
- the assistant capability has the namespace read grant
- the namespace is allowed by privilege posture and gates

No module should receive the whole matter-context store by default.
