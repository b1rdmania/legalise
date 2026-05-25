# Reference Modules

Reference modules prove the capability runtime against real legal work. They are not sample toys. They are the modules a developer studies to understand how to build on Legalise.

## Acceptance Bar

A module qualifies as a reference module only when all six are true:

1. Manifest complete.
2. Permission card complete.
3. Gate behaviour tested.
4. Audit rows emitted.
5. Failure semantics documented.
6. Runnable against Khan.

## Immediate Brutal Ports

### Contract Review

Proof pattern:

- document-heavy
- model-heavy
- output-generating
- evidence pack emission
- advice boundary gate

Location:

- `backend/app/modules/contract_review/`

Target:

- first-party native workflow module

### Pre-Motion

Proof pattern:

- multi-stage orchestration
- many model calls
- streaming
- audit-heavy
- gate-heavy

Location:

- `backend/app/modules/pre_motion/`

Target:

- first-party native workflow module

### Document Redliner

Proof pattern:

- external codebase import
- document to proposed amendments
- human accept/reject/edit loop
- generated output
- per-decision audit

Source:

- `/Users/andy/counsel-mvp/backend/app/agents/redliner.py`
- `/Users/andy/counsel-mvp/backend/app/services/pipeline.py`
- `/Users/andy/counsel-mvp/backend/app/database.py`
- `/Users/andy/counsel-mvp/src/pages/WorkbenchPage.jsx`

Target:

- `examples/modules/reference/document-redliner/`

Do not copy blindly. Port deliberately into Legalise's capability, gate, audit, and output lifecycle model.

## Immediate Proof Connectors

### Companies House

Proof pattern:

- public official data source
- external network
- matter enrichment
- audit of query/import

### legislation.gov.uk

Proof pattern:

- public legal authority source
- citation/authority write
- version lookup

### Local/Open Document Reader

Proof pattern:

- document intelligence is pluggable
- local-only data posture
- answers the Mike comparison without integrating Mike

### Provider Modules

Proof pattern:

- Anthropic/OpenAI/Ollama as provider-kind modules
- BYO keys
- cost/audit attribution

## Migration Targets

These workflows stay functional during the rewrite but require concrete `MIGRATION.md` before later ports:

- Letters
- Tabular Review
- Case Law
- Anonymisation
- Chronology
- Document Edit

## Experimental Reference Modules

### Matter Plan

Reads matter state and writes tasks, notes, recommended next actions, and missing-information prompts.

It is a reference workflow first. Stable primitives can later move into Matter OS.

### Evidence Pack Composer

Builds a source-backed artifact supporting a position, advice note, redline set, or workflow conclusion.

Initially a reusable output pattern emitted by modules. It may later become a first-class Matter OS artifact.

### Kramer v AI

Reference module for dual-party legal work:

- dual-party flow
- settlement bands
- emotional-discovery gates
- provider plurality
- streaming progress
- audit trail

It must not distort the core runtime unless it exposes a general primitive.

## Mike Posture

Mike is a peer and inspiration, not a dependency.

Do not:

- vendor Mike code
- import Mike internals
- call private Mike app routes
- imply Mike is a Legalise connector today

Do:

- build generic document-analysis capability surfaces
- support future Mike-like services through MCP or clean service APIs
- keep licence boundaries clean

