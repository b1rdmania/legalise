# Handover — Serious Backend Substrate

**For:** implementation agent and reviewer.
**As of:** 2026-05-21.
**Repo head when written:** `f94402f` plus this documentation pass.
**Purpose:** stop feature work and harden the backend so Legalise reads as a serious open-source legal AI workspace, not just a polished demo.

---

## 1. TL;DR

Andy has decided to pull the serious backend work forward now, before the public launch pressure rises.

Ethos update after the substrate R2 review: backend hardening is not a later-version bucket. If an issue affects trust boundaries, deletion, export, storage, jobs, audit, provider keys, upload validation, limits, secrets, WORM behaviour, or operational failure modes, it is in scope now. Public copy can wait for a pre-launch pass; backend correctness should not wait just because the hosted site is framed as a limited evaluation environment.

The launch posture remains:

> Legalise is open source. The hosted site is a limited evaluation environment.

The backend posture should become:

> Real storage, durable jobs, controlled migrations, evaluation limits, export/delete, audit hardening path, and operator runbooks.

Do not add new modules. Do not redesign the frontend. Preserve the current UX while making the runtime substrate harder to laugh at.

Already landed before this handover:

- `b6a78c9` — backend lockfile + dependency ceilings.
- `f94402f` — magic-byte upload validation.
- `d83559f` — supervised-autonomy claim-parity docs.

This handover is the next implementation sequence.

---

## 2. Non-Negotiables

1. **No server-paid model keys in production.** Hosted production is BYO keys only.
2. **Redis must not hold matter content.** Redis/arq carries queue metadata. Postgres stores job state. R2 stores artefact bytes.
3. **Fly filesystem is not source of truth.** It can materialise `matter.md` and cache generated files. Source of truth is Postgres + object storage.
4. **No new feature surfaces.** Stabilise storage/jobs/ops behind existing surfaces.
5. **Every migration has rollback/repair thinking.** This is legal data, even in evaluation mode.
6. **Keep public copy honest.** The hosted site can be serious without claiming live-client readiness.
7. **Harden the backend now.** Do not defer bounded trust-boundary fixes behind version labels.

---

## 3. Target Architecture

```
Browser
  |
  v
Cloudflare Pages
  |
  v
Fly API, lhr
  |
  +--> Neon Postgres, London
  |      - matters
  |      - documents metadata
  |      - jobs
  |      - audit
  |      - encrypted user provider keys
  |
  +--> R2 / MinIO via storage abstraction
  |      - uploaded document bytes
  |      - generated docx/pdf artefacts
  |      - export bundles
  |
  +--> Redis / arq
  |      - job queue only
  |      - rate-limit counters
  |
  +--> Gotenberg internal-only
         - PDF rendering
```

---

## 4. Implementation Order

### Unit 1 — Real Object Storage

**Goal:** uploaded binaries and generated artefacts no longer depend on local filesystem paths as source of truth.

Build:

- `backend/app/core/storage.py`
  - `StorageBackend` protocol.
  - `put_bytes(key, data, content_type, metadata)`.
  - `get_bytes(key)`.
  - `delete_object(key)`.
  - optional `exists(key)`.
  - optional `presigned_get_url(key, ttl)` only if needed.
- Implement S3-compatible backend using `boto3` against MinIO/R2.
- Optional local filesystem backend only for tests.
- Object key format:
  - `users/{user_id}/matters/{matter_id}/documents/{document_id}/{sha256}`
  - `users/{user_id}/matters/{matter_id}/generated/{document_id}/{filename}`
  - avoid original filename as the only path segment.
- Upload path:
  - magic-byte validation stays.
  - write object to storage.
  - store `storage_uri`, `sha256`, `size_bytes`, `mime_type`.
  - extraction reads from stored bytes, not request stream after commit.
- Generated artefacts:
  - letters, contract review exports, tabular review exports, Pre-Motion PDFs/docx write to storage.
  - DB rows point at storage key.

Acceptance:

- Local compose uses MinIO without code changes.
- Hosted prod uses R2 via env.
- No generated artefact relies on Fly local disk as source of truth.
- Tests cover path traversal resistance and cross-user denial.
- Existing document list, export, edit, anonymisation, and audit surfaces still work.

Important:

- If this becomes too large, ship uploads + generated docs first. Matter filesystem materialisation can remain derived cache.

### Unit 2 — Durable Jobs

**Goal:** long-running module runs survive request disconnects and are inspectable after completion/failure.

Build:

- Add `jobs` table:
  - `id`
  - `matter_id`
  - `created_by_id`
  - `kind`
  - `status` (`queued`, `running`, `succeeded`, `failed`, `cancelled`)
  - `stage`
  - `progress`
  - `input_payload`
  - `result_payload`
  - `error_code`
  - `error_message`
  - `created_at`, `started_at`, `finished_at`
- Add `backend/app/core/jobs.py`
  - create job
  - update stage/status
  - append event
  - enforce per-user active job limit
- Add arq worker process.
- Redis queues job ids only.
- API shape:
  - `POST /api/matters/{slug}/pre-motion/jobs`
  - `GET /api/matters/{slug}/jobs/{job_id}`
  - `GET /api/matters/{slug}/jobs/{job_id}/events` via SSE or polling.
- Migrate Pre-Motion first.
- Migrate Contract Review second.
- Tabular Review/export after the first two are stable.

Acceptance:

- Client disconnect does not cancel the job.
- Backend restart after queued job does not lose job record.
- Job failure writes terminal job state and audit row.
- Existing UI can still render progress.
- Active job limit enforced.
- Audit tab links job lifecycle rows to module/model rows.

Do not:

- Put prompts/document bodies in Redis.
- Build generic workflow engine unless it drops out naturally.

### Unit 3 — Migration Discipline

**Goal:** production app boot no longer mutates schema.

Build:

- Keep boot-time `alembic upgrade head` for local dev if useful.
- Add production release command for Fly, e.g. `[deploy] release_command = "alembic upgrade head"` if Fly config supports the target shape.
- Or document a one-off deploy step:
  - `fly ssh console --app legalise-backend -C "cd /app && alembic upgrade head"`
- App boot should check current revision and fail fast if behind in production.
- Update `backend/entrypoint.sh` so production does not silently run migrations unless an explicit env says so.

Acceptance:

- Local compose still works.
- Production deploy docs are sequential and unambiguous.
- Multi-machine future does not risk concurrent migrations.

### Unit 4 — Hosted Evaluation Limits

**Goal:** prevent viral-signup abuse without introducing a paid plan.

Copy doctrine:

> Legalise is open source. The hosted site is a limited evaluation environment.

Build:

- Add config-backed limits:
  - matters: 5
  - documents: 50
  - max file size: 25 MB
  - total storage: 500 MB
  - assistant messages: 100/day
  - workflow runs: 50/day
  - active jobs: 3 concurrent
  - generated artefacts: 50/day
  - module submissions: disabled at launch, or 1/day behind Turnstile
- Add `GET /api/me/usage` or equivalent.
- Enforce at backend boundaries:
  - matter create
  - document upload
  - assistant send
  - job create
  - generated artefact create
  - module submission
- UI blocked copy:
  - "Hosted evaluation limit reached. Legalise is open source; self-hosting removes hosted limits."

Acceptance:

- Reads remain ungated.
- Normal demo user never hits limits.
- Scripted abuse hits structured 429/403 with clear message.
- Audit row for limit-denied actions where meaningful.

### Unit 5 — Matter Export / Delete

**Goal:** close the obvious retention/deletion criticism with a conservative path.

Build:

- Export:
  - `POST /api/matters/{slug}/export`
  - creates export job.
  - writes zip to storage.
  - includes matter metadata, document metadata, uploaded files, generated artefacts, audit rows, job rows.
  - initially internal/full export only. Shareable redaction can be later.
- Delete/archive:
  - `DELETE /api/matters/{slug}`
  - owner-scoped.
  - refuses if jobs are running.
  - either hard deletes documents/artefacts and matter rows, or archives first if that is safer.
  - writes audit row before deletion or tombstone row after deletion.

Decision required before coding delete:

- Hard delete vs archive/tombstone.
- Whether audit rows survive matter deletion.
- Whether generated export must exist before delete.

Recommendation:

- Export first.
- Delete second.
- Preserve audit rows with matter id/tombstone where possible.
- Do not cascade-delete audit.

Acceptance:

- Cross-user delete/export returns 404.
- Delete with active job returns 409.
- Deleted matter no longer appears in list.
- Storage objects are removed or marked according to policy.
- Account deletion no longer gets stuck forever once matter delete/export exists.

### Unit 6 — Audit WORM Groundwork

**Goal:** app role cannot update/delete audit rows in production.

Prerequisite:

- Unit 3 migration discipline. Do not do WORM while app boot still runs migrations as the app role.

Build:

- Separate roles:
  - migration/admin role can migrate.
  - app role can read/insert necessary tables.
  - app role cannot UPDATE/DELETE `audit_entries`.
- Optional trigger guard on `audit_entries`.
- Tests or migration smoke that verifies app role update/delete fails.
- Update TRUST language after it is true.

Acceptance:

- App still writes audit rows.
- App cannot update/delete audit rows.
- Migrations still work through migration role.

### Unit 7 — Key Rotation CLI

**Goal:** operator can rotate `LEGALISE_KEY_ENCRYPTION_SECRET`.

Build:

- `python -m app.tools.rotate_encryption_key --old-secret ... --new-secret ...`
- Re-encrypt all `user_api_keys`.
- Dry-run mode.
- Transaction or resumable batching.
- Runbook in `docs/TRUST.md` or `docs/RUNBOOK.md`.

Acceptance:

- Round-trip test with two users and two providers.
- Wrong old key fails without partial writes.
- New key decrypts all rows.

### Unit 8 — Observability With Scrubbing

**Goal:** know when prod is broken without leaking matter content.

Build:

- Backend exception reporting or structured log drain.
- Frontend crash reporting if desired.
- Scrub:
  - prompts
  - responses
  - document text
  - provider keys
  - uploaded filenames if conservative
- Metrics:
  - request error rate
  - job failure count
  - provider error count
  - key-missing count
  - storage write/read failures

Acceptance:

- Simulated provider failure creates audit row and operational event without prompt/response.
- Simulated job failure visible in logs/telemetry.

---

## 5. Delivery Rounds

### Round A

- Unit 1 storage.
- Unit 3 migration discipline if simple.

Review asks:

- Are object keys tenancy-safe?
- Does upload/extraction still work?
- Are generated artefacts retrievable after restart?
- Did migration changes preserve local compose?

### Round B

- Unit 2 durable jobs for Pre-Motion and Contract Review.

Review asks:

- Does disconnect leave job running?
- Are audit rows complete?
- Are job results stable after refresh?
- Are active job limits enforced?

### Round C

- Unit 4 evaluation limits.
- Unit 5 export/delete.

Review asks:

- Are limits generous but effective?
- Does delete policy preserve audit integrity?
- Is export complete enough for a user to leave?

### Round D

- Unit 6 WORM groundwork.
- Unit 7 key rotation.
- Unit 8 observability.

Review asks:

- Can app role mutate audit?
- Can encrypted keys rotate?
- Does telemetry leak content?

---

## 6. What Not To Do

- Do not add new modules.
- Do not rewrite the landing page.
- Do not build billing.
- Do not call it a paid/free plan. It is a hosted evaluation limit.
- Do not use Redis for matter content.
- Do not add server-side Anthropic/OpenAI keys in production.
- Do not claim live-client readiness after this unless WORM, deletion/export, durable jobs, storage, and operational runbooks are actually green.

This list is about product sprawl, not backend seriousness. Keep hardening if the work touches archived/deleted resource access, owner scoping, storage failure handling, export/delete consistency, job recovery or quota semantics, WORM audit enforcement, provider-key provenance, upload validation, key rotation, secret guards, or CI coverage for those behaviours.

---

## 7. Current Public Copy Alignment

This handover also made a narrow docs pass:

- README now says: "Legalise is open source. The hosted site is a limited evaluation environment."
- README no longer says "shipping Friday".
- README status now names live-matter readiness gates rather than old v0.2/v0.3 buckets.
- ROADMAP now starts with evaluation release candidate and promotes serious backend substrate as the locked direction.
- TRUST now states that hosted legalise.dev is a limited evaluation environment and names storage/jobs as not-yet-live-client-ready.

Do not scatter more public-copy edits while backend work is mid-flight unless a claim becomes false.

---

## 8. Suggested Hand-Off Line

> Read `docs/HANDOVER_SERIOUS_BACKEND.md`. Stop feature work. Implement and keep hardening the serious backend substrate: real S3/R2 storage, durable jobs, migration discipline, hosted evaluation limits, matter export/delete, WORM audit groundwork, key rotation, observability, and any trust-boundary gaps uncovered while doing that work. Preserve current UX and current modules. Legalise is open source; legalise.dev is a limited evaluation environment. Do not add server model keys or billing.
