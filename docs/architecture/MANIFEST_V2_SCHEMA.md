# Manifest v2 Schema

Manifest v2 is the contract between an installable module and the Legalise runtime. It describes what the module is, how it runs, what capabilities it declares, what data it can touch, what gates apply, and where it appears in the workspace.

This document is canonical for Phase 1. `schemas/module.v2.json` must implement this grammar.

## Lexicon

- **Module**: installable unit. One manifest. Native binding or MCP server.
- **Capability**: declared action surface inside a module.
- **Kind**: broad capability category: `skill`, `tool`, `workflow`, `provider`, `gate`.
- **Scope**: runtime boundary: `matter`, `workspace`, `global`.

A module can declare one or more capabilities. Each capability has its own permissions, gates, UI slot, execution mode, data-movement posture, and audit semantics.

## Required Module Fields

```json
{
  "schema_version": "2.0.0",
  "id": "legalise-companies-house",
  "name": "Companies House",
  "version": "1.0.0",
  "publisher": "legalise",
  "visibility": "first_party",
  "runtime": "mcp",
  "entrypoint": {
    "transport": "stdio",
    "command": "python",
    "args": ["server.py"]
  },
  "capabilities": []
}
```

Required top-level fields:

- `schema_version`: manifest schema version. Semver. V1 runtime accepts only `2.x`.
- `id`: stable lowercase module id. `^[a-z0-9][a-z0-9_.-]+$`.
- `name`: human-readable display name.
- `version`: module version. Semver.
- `publisher`: stable publisher id.
- `visibility`: `first_party`, `community`, `firm_private`, `example`, or `partner_track`.
- `runtime`: `native` or `mcp`.
- `entrypoint`: runtime-specific launch/binding declaration.
- `capabilities`: non-empty array.

Optional top-level fields:

- `description`
- `source_url`
- `license`
- `jurisdictions`
- `requires`
- `host_version`
- `matter_schema_version`
- `signed_by`
- `signature`

## Capability Object

```json
{
  "id": "party-diligence",
  "kind": "tool",
  "scope": "matter",
  "reads": ["matter.parties.read"],
  "writes": ["matter.context.legalise_memory.accepted_facts.write"],
  "model_access": "none",
  "external_network": true,
  "data_movement": {
    "sends_document_body": false,
    "sends_document_binary": false,
    "external_destinations": ["api.company-information.service.gov.uk"]
  },
  "gates": ["external_data_consent"],
  "ui": {
    "slot": "matter.parties.actions",
    "label": "Check Companies House"
  },
  "streaming_mode": "sync",
  "advice_tier_max": "factual_extraction",
  "output_lifecycle_target": null,
  "audit_events": [
    "connector.companies_house.search",
    "connector.companies_house.import"
  ]
}
```

Required capability fields:

- `id`: stable id within the module.
- `kind`: `skill`, `tool`, `workflow`, `provider`, or `gate`.
- `scope`: `matter`, `workspace`, or `global`.
- `reads`: array of capability grammar strings.
- `writes`: array of capability grammar strings.
- `model_access`: `none`, `optional`, `required`, or `delegated`.
- `external_network`: boolean.
- `data_movement`: explicit data-movement declaration.
- `gates`: array of gate ids.
- `ui.slot`: named workspace plug-point.
- `streaming_mode`: `sync`, `streaming`, or `async`.
- `advice_tier_max`: highest advice tier this capability may produce.
- `audit_events`: array of expected audit action names.

## Capability Grammar

Capability strings use:

```text
<scope>.<resource>.<action>
```

Examples:

- `matter.metadata.read`
- `matter.documents.body.read`
- `matter.documents.generated.write`
- `matter.context.legalise_memory.accepted_facts.read`
- `matter.context.legalise_memory.open_questions.write`
- `matter.redlines.write`
- `workspace.providers.invoke`
- `workspace.intake.prospects.write`
- `global.registry.read`

The runtime must reject unknown capability strings unless explicitly added to the grammar.

Audit is mandatory provenance, not a grantable capability. Modules declare expected audit events in `audit_events`; they do not request `audit.write`.

## Kind Semantics

`kind` is not decorative. It constrains valid slots, default gates, and runtime behaviour.

| Kind | Purpose | Valid Scopes | Notes |
|---|---|---|---|
| `skill` | Prompt-level legal task | `matter`, `workspace` | Usually model-backed. |
| `tool` | Deterministic or external utility | `matter`, `workspace`, `global` | Document readers, OCR, connectors, exporters. |
| `workflow` | Multi-step process | `matter`, `workspace` | Can call skills/tools/providers. |
| `provider` | Model/backend provider | `workspace`, `global` | Does not appear in matter workflow slots. |
| `gate` | Approval/interruption boundary | `matter`, `workspace` | A gate cannot itself be gated. |

## Scope Semantics

- `matter`: can read/write matter state only after a matter-scoped grant.
- `workspace`: can operate at workspace level but cannot access matter data unless separately granted matter capability.
- `global`: non-matter utility or registry capability. No matter data access.

## Data Movement

Every capability must state whether matter data leaves the Legalise process.

```json
{
  "sends_document_body": true,
  "sends_document_binary": false,
  "sends_matter_metadata": true,
  "external_destinations": ["api.anthropic.com"],
  "retention_by_external_service": "provider_terms",
  "local_only": false
}
```

The permission card renders directly from this object.

## Runtime Types

`native` modules call Python bindings inside Legalise.

`mcp` modules run through the MCP host and sandbox.

Supported MCP entrypoints:

```json
{
  "transport": "stdio",
  "command": "python",
  "args": ["server.py"],
  "env": {}
}
```

```json
{
  "transport": "sse",
  "url": "https://example.com/mcp"
}
```

Remote MCP modules require `external_network: true` and an explicit destination.

## Dependency Fields

```json
{
  "requires": [
    {
      "module_id": "legalise-local-document-reader",
      "version": ">=1.0.0",
      "capability": "extract-text"
    }
  ],
  "host_version": ">=1.0.0",
  "matter_schema_version": ">=1.0.0"
}
```

Install fails if dependencies cannot be resolved.

## Update Semantics

The runtime compares the installed permission snapshot with the new manifest.

Re-prompt required when:

- `reads` expands.
- `writes` expands.
- `external_network` changes from false to true.
- `data_movement` expands.
- `advice_tier_max` increases.
- new gates are removed or weakened.

Manual updates only in V1. No automatic module updates.

## Validation Rules

The schema validator must reject:

- missing capability array
- unknown `kind`
- unknown `scope`
- unknown capability grammar entries
- `kind: gate` with non-empty `gates`
- `external_network: true` without `data_movement.external_destinations`
- `model_access: required` without provider dependency or runtime provider access
- `ui.slot` not in the known slot registry
- semver-invalid `version`, `host_version`, or `matter_schema_version`

## First Phase Examples

Immediate proof manifests:

- `examples/modules/connectors/legalise-companies-house/legalise.module.json`
- `examples/modules/connectors/legalise-legislation-gov-uk/legalise.module.json`
- `examples/modules/connectors/legalise-local-document-reader/legalise.module.json`
- `examples/modules/providers/anthropic/legalise.module.json`
- `examples/modules/reference/document-redliner/legalise.module.json`
