# ADR-010 — Fail-closed deletes and the tombstone lifecycle

**Status:** Accepted. Named by external reviewers as a strength ("fail-closed
deletes" in the launch-readiness verdict).

## Context

Deletion in a legal workspace has two opposing obligations: the *content* must
be genuinely deletable (GDPR, client instruction, retention expiry), while the
*record that things happened* must survive (SRA six-year retention, the audit
chain's append-only promise, ADR-002). And a delete that reports success while
bytes linger in object storage is a confidentiality lie.

## Decision

- **Deletes are fail-closed.** A document delete only commits — and only
  writes its `document.deleted` audit row — after the storage bytes are
  actually gone; if blob deletion fails, the transaction rolls back and the
  document stays live (`backend/app/api/document_routes/crud.py:89`,
  `backend/app/core/matter_lifecycle.py:97,130`). No success-reported,
  bytes-remaining state.
- **Matters tombstone, they don't vanish.** Matter deletion/retention-purge
  goes through one shared audited path,
  `core.matter_lifecycle.tombstone_matter` (extracted so the API route and
  the retention sweeper cannot drift): content is purged, an audited
  tombstone row records that the purge happened (`matter.retention.purged`,
  system actor `actor_id=None` for sweeper runs), and the audit
  entries/chain for the matter remain (they are WORM; ADR-002 forbids
  deleting them). Tombstoned matters reject uploads/reindex.
- **Retention is enforced opt-in, dry-run by default:** the sweeper
  (`app.tools.retention_sweep`) defaults to dry-run; `--apply` purges expired
  matters via the shared tombstone path. (Known follow-up: no `--limit`
  blast-cap before putting it on a cron.)
- FK design supports this: deleting a document cascades its chunks;
  audit tables are `ON DELETE RESTRICT`.

## Consequences

- "We deleted it" is a verifiable claim: the bytes are gone *and* the record
  of deletion is in the chain.
- A storage outage makes deletes fail loudly rather than lie — correct, but
  worth knowing when debugging "delete doesn't work" reports.

## What not to change, and why

- **Do not reorder delete flows to "audit first, delete storage best-effort"**
  or wrap storage deletion in a swallow-and-continue. The audit row asserting
  deletion must only exist if deletion happened.
- **Do not add a hard-delete path for matters that removes audit rows** —
  impossible by trigger anyway (ADR-002); don't try to migrate around it.
- **Do not fork a second deletion code path** — route and sweeper share
  `tombstone_matter` on purpose; a second path is where the audit/tombstone
  guarantees will silently diverge.
- **Do not flip the retention sweeper to apply-by-default** or schedule it
  without the blast-cap.
