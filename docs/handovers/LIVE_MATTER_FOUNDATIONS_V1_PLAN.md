# Live-Matter Foundations v1 — Build Plan

**Status:** RATIFIED 2026-05-29 — build LMF-1 → LMF-4 in order.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-29

## Ratified answers (Andy)
- **Q1 — forward-only artifact → S3 cutover. No backfill** (WORM + Fly ephemeral fs make backfill a risk multiplier). New artifacts → object storage; old local-fs-path rows are left as-is. **Requirement:** where an old local artifact path exists and its bytes are gone, surface **"legacy artifact unavailable"** cleanly in API + export — never crash.
- **Q2 — split Archive/Close from Delete.** Add a non-destructive Archive/Close (keeps audit **and** storage). Keep the existing destructive `DELETE` exactly as-is — **do not weaken its fail-closed storage-cleanup gate**.
- **Q3 — audit action `matter.export.downloaded`** (new action on the existing audit source; no new source).
- Sequence LMF-1 → LMF-4.

## Headline: most of this already exists

A full inventory (storage/jobs/export/delete/audit) shows the foundations are **~80% built**. This is **not** a from-scratch phase — it's closing **four specific gaps**. Honest framing matters so we don't rebuild working substrate.

### What already exists (verified)
- **Storage abstraction** (`core/storage.py`): S3/MinIO (default) + local (tests) backends; `get_bytes/put_bytes/presigned_get_url/delete_object/delete_prefix/exists/list_keys`; key helpers `uploaded_key` / `generated_key` / `matter_prefix`. **Uploaded document bytes already live in S3** (`Document.storage_uri`).
- **Jobs**: Postgres `jobs` table (`models/job.py`) + **arq worker** (`worker.py`); Redis carries only the job id. `create_job` / `update_status` with full lifecycle audit (`module.{kind}.job.{queued,started,completed,failed,cancelled}`). Export / pre-motion / contract-review already run as **durable background jobs**, not request-inline. **Decision #3 is already satisfied** — no Redis-Streams/SSE/async-runtime reopening needed.
- **Export**: `POST /api/matters/{slug}/export` → durable job → `GET …/export/{id}` returns a presigned URL (S3) or stream. `build_matter_export()` writes a ZIP: `matter_metadata.json`, per-document `metadata.json` + uploaded bytes, `artefacts.json` (metadata only), `audit.json` (raw entries), `jobs.json`. Written to `…/exports/{job_id}.zip`.
- **Delete/archive**: `DELETE /api/matters/{slug}` — fail-closed: storage cleanup (`delete_prefix(matter_prefix)`) is the gate (502 + matter stays live on failure), then `status = archived` (row preserved → audit FKs resolve), refuses if active jobs, warns if no prior export, audits `matter.deleted` (+ `matter.deleted_without_export`), revokes matter-scoped grants.
- **Audit**: export job lifecycle + `matter.deleted` already audited (existing `audit` source).

## Locked decisions (from Andy)
1. Object storage = source of truth for binary/original/generated files; Postgres holds metadata/hashes/keys/audit. No bytes in Postgres.
2. Backend-streamed proxy for governed matter assets by default; presigned URLs out of v1 **except where a specific export bundle needs them**.
3. Jobs stay boring: the existing Postgres jobs table + worker. Do NOT reopen Redis Streams/SSE/async runtime.
4. Matter export = single ZIP with: matter metadata JSON, documents metadata JSON, original uploaded files, generated artifacts, review decisions, audit reconstruction JSON, README/manifest.
5. No casual hard-delete: archive keeps audit + storage; delete/tombstone revokes access + schedules storage cleanup if supported; document true-purge as not-in-v1 if risky.
6. Export requested/completed/failed audited; delete/archive audited or verified. No new audit source.
7. Matter-owner only. No admin/superuser shortcut.

## The four real gaps (the actual work)

### G-A — Matter artifacts are NOT in object storage (the one decision-#1 violation)
`MatterArtifact.storage_path` is a **local filesystem path** (`matters_root/.../artifacts/...json`), written by `core/matter_artifacts.py` — the Fly local fs, not S3. Every other binary class (documents, generated docx, exports) is already S3. **This is the main substantive piece.** Move artifact writes/reads to object storage via the existing abstraction + an `artifact_key(...)` helper.
- **Risk:** `matter_artifacts` is WORM (Postgres trigger blocks UPDATE/DELETE), so the `storage_path` column's *meaning* changes from fs-path to S3-key — existing rows reference fs paths that won't exist in prod after a redeploy (Fly fs is ephemeral). **Open question Q1:** are there real artifact rows in prod to migrate, or is a forward-only cutover (new artifacts → S3; old fs-path rows tolerated as "unavailable") acceptable? A backfill of existing artifacts into S3 may be needed, or documented as a one-time gap.
- Reads (ArtifactDetail/preview/export) switch to `get_bytes(key)`; the export already lists artifact metadata — once artifacts are S3-keyed, export can include their **bytes** (feeds G-B).

### G-B — Export bundle is incomplete vs decision #4
`build_matter_export()` is missing: **artifact bytes** (only metadata today — unblocked by G-A), **review decisions** (`matter_reviews` — new since export was written), **audit *reconstruction* JSON** (today's `audit.json` is raw entries; decision #4 wants the reconstructed timeline), and a **README/manifest** describing contents + limitations. Additive changes to the export builder.

### G-C — No "archive (keep storage)" distinct from "delete (purge storage)"
Today there's a single `DELETE` that sets `status=archived` **and** purges storage. Decision #5 wants **two** behaviours: *close/archive* (keep audit **and** storage) vs *delete/tombstone* (revoke access + schedule storage cleanup). **Open question Q2:** split into two actions (a non-destructive "Close/Archive" + the existing destructive "Delete"), and what should the UI offer? Recommendation: add a non-destructive close/archive (status only, storage retained); keep the existing storage-purging path as explicit "Delete". True crypto-shred purge stays documented as not-in-v1.

### G-D — Audit gaps (small)
Export *download* and storage-cleanup *success* are not audited (only job lifecycle + `matter.deleted`). Decision #6 — add `matter.export.downloaded` (or similar) + a storage-cleanup success row, on the existing audit source. No new source.

## Proposed sequencing (plan only)
1. **LMF-1 — artifacts → object storage (G-A).** The foundational piece; everything else (export bytes) keys off it. Resolve Q1 first.
2. **LMF-2 — export completeness (G-B).** Add artifact bytes + reviews + reconstruction JSON + README/manifest.
3. **LMF-3 — archive/delete split (G-C).** Resolve Q2; add non-destructive close/archive alongside the existing destructive delete.
4. **LMF-4 — audit gaps (G-D).** Download + cleanup-success rows.

## Scope / non-goals
- No Redis-Streams/SSE/async-runtime work (jobs already durable). No new audit source. No admin/superuser shortcut (owner-only). No presigned URLs beyond the export bundle. No true crypto-purge if risky (document as not-in-v1). No new job kinds beyond what export needs.

## Open questions for Reviewer (resolve before LMF-1)
1. **Q1 (artifacts→S3 migration):** forward-only cutover (new→S3, old fs rows tolerated as unavailable) vs a backfill of existing prod artifact rows? Does prod even have artifact rows yet? WORM trigger means `storage_path` semantics change — confirm the migration story.
2. **Q2 (archive vs delete):** add a non-destructive Close/Archive (storage retained) as a distinct action from the existing storage-purging Delete? What does the matter UI surface, and does "Delete" keep its fail-closed storage-cleanup gate?
3. **Q3 (export download audit naming):** `matter.export.downloaded`? (decision #6 says no new *source*, but a new *action* on the existing audit source is fine — confirm the string.)

## Stop conditions
- If G-A (artifacts→S3) needs the WORM trigger relaxed or a destructive backfill, **stop and confirm** the migration story before building.
- If G-C requires changing what `DELETE` already does to storage (vs adding a new archive action), **stop** — don't weaken the existing fail-closed delete without sign-off.

## Testing approach (when built)
Per-gap focused backend tests (artifact S3 round-trip; export ZIP contains the new members; archive-keeps-storage vs delete-purges; new audit rows) + the existing storage/jobs/export tests must stay green. Full backend at CI. No frontend unless G-C adds UI. No e2e unless the matter journey changes materially.
