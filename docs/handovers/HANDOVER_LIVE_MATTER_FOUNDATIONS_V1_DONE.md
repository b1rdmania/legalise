# Live-Matter Foundations v1 — Handover (DONE)

**Status:** built on `phase-17-crm-pass`, awaiting review/merge. Backend-touching; **no migration** (storage_path/column shapes unchanged — only the *meaning* of artifact `storage_path` goes from fs-path → object key, forward-only).
**Date:** 2026-05-29
**Plan:** `LIVE_MATTER_FOUNDATIONS_V1_PLAN.md` (4 gaps; ratified answers Q1 forward-only / Q2 split / Q3 `matter.export.downloaded`).

## Context
The inventory found the foundations ~80% built (S3 documents, Postgres jobs + arq worker, matter-export ZIP, fail-closed delete). This phase closed the 4 real gaps. The job/worker substrate (decision #3) was already done — untouched.

## LMF-1 — matter artifacts → object storage (forward-only)
- `write_artifact` now writes bytes to object storage under `artifact_key(owner, matter, artifact_id, capability, kind)` (beneath `matter_prefix`, so the existing matter-`DELETE` `delete_prefix` sweep cleans artifacts too). `storage_path` now holds the **object key**.
- New legacy-aware reader: `core/matter_artifacts.load_artifact_bytes` / `load_artifact_payload` + `ArtifactBytesUnavailable`. **Legacy** rows (absolute fs path, `startswith("/")`, no backfill) and **missing** objects raise it; the read endpoint returns **410 `legacy_artifact_unavailable`** — never crashes (per Andy's requirement). `reviews.compute_artifact_hash` reads via the loader too; the review-request endpoint maps unavailable → 422.
- Forward-only: no backfill, no WORM-trigger change (new rows INSERT only).

## LMF-2 — export bundle completeness
`build_matter_export` ZIP now also contains: `artefacts/{id}/metadata.json` **+ the artefact JSON bytes** (via the legacy-aware reader; unavailable ones noted, not crashed), `artefacts.json` index, `reviews.json` (supervisor review decisions), `reconstruction.json` (the rebuilt decision timeline via `reconstruct()`, paged to completion), and `README.md` (manifest + limitations, incl. any unavailable-artefact ids). Existing members (matter_metadata/documents+bytes/audit/jobs) unchanged.

## LMF-3 — non-destructive Close, distinct from destructive Delete
- New **`POST /api/matters/{slug}/close`** — sets `status=closed` (the `STATUS_CLOSED` the model already had) + `closed_at`, **retains storage + audit + access** (closed matters still list and read), audits `matter.closed`, owner-only, idempotent, one-way in v1. A tombstoned (`archived`) matter cannot be closed (409).
- The existing destructive `DELETE` (→ `status=archived` tombstone + `delete_prefix` storage purge + `matter.deleted` audit, fail-closed) is **unchanged** — not weakened.
- **Naming note:** the codebase already reserves `archived` for the delete-tombstone, so the non-destructive action is "Close" (`STATUS_CLOSED`), not "Archive". Andy's "Archive/Close" maps to this.

## LMF-4 — audit gaps
- `matter.export.downloaded` emitted on the export download endpoint (existing audit source; no new source), payload `{export_job_id, export_key}`. Presigned URLs for the export bundle are the sanctioned decision-#2 exception.
- Storage-cleanup *success* is already implied by `matter.deleted` (cleanup is the fail-closed gate — the row only lands after bytes are confirmed deleted), so no redundant row was added.

## Tests run (focused; full backend at the close-out gate + CI)
- LMF-1: `test_artifact_legacy_unavailable` (legacy → 410) + migrated 6 fs-assuming tests to S3 semantics (phase6 helper, r2 WORM, phase13b missing→410, SR hash, both vertical slices).
- LMF-2: `test_export_completeness` (artefact bytes + reviews + reconstruction + README in the ZIP); `test_export.py` reconstruct stubbed for its pure-mock builder tests.
- LMF-3/4: `test_lmf_close_and_export_audit` (close non-destructive/audited/idempotent, archived→409, cross-user→404, export-download audit).
- Close-out: full backend pytest = **775 passed, 4 failed** — the 4 are the known pre-existing env/platform failures (3 macOS-only sandbox/rlimit tests + 1 demo-seed audit-count test) that fail on master too; **zero failures attributable to this work**. Full backend runs in-container at CI (where those env tests pass).

## Residual / out-of-scope
- **No UI for Close yet** — the endpoint exists; surfacing a "Close matter" button in the matter UI is a small frontend follow-up (the plan kept this backend-first).
- Reopen-after-close not implemented (close is one-way in v1).
- No true crypto-purge (delete uses `delete_prefix`; deeper shred is not-in-v1).
- Legacy artifacts (pre-cutover) remain unavailable by design (forward-only, no backfill).

## Next recommended phase
A small frontend pass to surface Close + the export/download + (optionally) artifact-availability state in the matter UI; otherwise the v1 substrate tracks are essentially complete.
