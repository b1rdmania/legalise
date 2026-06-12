# The register sidecar

Legalise supervises work it did not produce. An export from another
workspace is ingested as an **external pack**: a read-only matter that
exists to be reviewed and signed, with every step on the same
hash-chained record as native work. The workspace that did the work
stays the workspace; Legalise is the register it answers to.

## The honesty boundary

Two grades of provenance, recorded per document and shown on the
register face:

- **verified_at_source** — the export carried content hashes computed
  by the source workspace (a tamper-evident manifest). The chain of
  custody starts where the work happened.
- **attested_at_ingest** — the export carried bytes but no hashes.
  Legalise hashes what it received; the attestation starts at ingest,
  and the register says so. We never claim more than the export proves.

## The Mike adapter

First adapter: [Mike](https://github.com/willchen96/mike), the
open-source legal AI workspace. Mapping:

| Mike | Legalise |
|---|---|
| project | external matter (`external_source: "mike"`, read-only) |
| document_versions.content_sha256 | verified_at_source hash (where present) |
| version `source: assistant_edit / generated` | author = assistant (signer is never the author) |
| version `source: user_accept / user_upload / upload` | author = human |
| document_edits accept/reject trail | preserved as the review history |
| export manifest | ingest audit row's hash manifest |

Mike's plain account export works today (attested_at_ingest). With
content hashes at source (proposed upstream), packs arrive
verified_at_source end to end.

## What an external pack cannot do

No model calls. No skills. No edits. It is a record under
supervision: a named person reviews a version and signs, with the
review window measured, exactly as for native outputs.

## The interchange manifest (proposed)

Any workspace can make its exports register-ready with one JSON shape:
per document, a version list of `{content_sha256, source, created_at}`
plus accept/reject references, and an optional `signoff` slot. The
Mike adapter's input format is the reference implementation.
