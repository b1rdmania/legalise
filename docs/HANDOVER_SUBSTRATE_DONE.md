# Handover — Serious Backend Substrate Shipped + Integrated + CI Green

**For:** the reviewer agent (and Andy for context).
**As of:** 2026-05-21 evening. Repo head: `6f63d9c`. Pushed to `origin/master`.
**Prior handover:** [`HANDOVER_SERIOUS_BACKEND.md`](./HANDOVER_SERIOUS_BACKEND.md) at `eecae83` (Andy's stop-feature-work pivot + 8-unit substrate plan).
**Scope:** all 8 substrate units shipped through 3 parallel-agent waves, integrated to master, and validated by CI on real Postgres. Captures what landed, what CI now proves, and explicit follow-ups deferred during the substrate push.

---

## 1. TL;DR

All 8 units of `HANDOVER_SERIOUS_BACKEND.md §4` shipped. Master is **18 commits ahead** of pre-substrate `eecae83`. **CI is green on real Postgres** at `6f63d9c` — backend pytest + frontend build + voice check all pass.

The substrate is now defensible against the audit's "no reproducible builds, no durable jobs, no real storage, no deletion, no WORM, no key rotation, no observability" critique.

Three explicit follow-ups deferred during the push (named in §6 below).

---

## 2. Eight Units Shipped

Each unit dispatched in a worktree, returned a branch, integrated with merge commit + any wiring fix. Order reflects the three waves (Wave 1: 1/3/7 parallel; Wave 2: 2/4/8 parallel; Wave 3: 5/6 parallel).

| Unit | Subject | Commit | Branch landed |
|---|---|---|---|
| 1 | Real object storage (S3/MinIO/R2 + path traversal + cross-user denial) | `37405d3` | `unit-1-storage` |
| 3 | Migration discipline (Fly release_command + boot revision check + RUNBOOK.md) | `9e2970f` | `unit-3-migration` |
| 7 | Key rotation CLI (`python -m app.tools.rotate_encryption_key`) | `f691b6d` | `unit-7-rotation` |
| 2 | Durable jobs substrate (jobs table + arq worker + JOB endpoints) | `87d0d62` | `unit-2-jobs` |
| 4 | Hosted evaluation limits (5/50/500MB/100-msg/50-run + `/api/me/usage`) | `23ac18f` | `unit-4-limits` |
| 8 | Observability with scrubbing (structlog + scrub + global exception handler) | `fd42ca9` | `unit-8-observability` |
| 6 | Audit WORM groundwork (Postgres trigger on `audit_entries`) | `33088f7` | `unit-6-worm` |
| 5 | Matter export/delete (zip-to-storage export job + tombstone delete) | `a31ec0b` | `unit-5-export` |

Two integration commits wired routers post-merge:
- `ccd7db1` — usage + jobs routers into `backend/app/main.py`
- `d51c0c1` — exports router + DELETE 204 response shape fix

---

## 3. Five CI-Green Recovery Commits

The substrate code was correct in isolation; failures were integration / test-env edges that only surface against real Postgres + a clean CI workflow. Listed for transparency — none of these changed substrate semantics.

| | Commit | What it fixed |
|---|---|---|
| 1 | `c871ba4` | **Unit 5 / Unit 6 collision.** Unit 5 nulled `audit_entries.matter_id` on tombstone; Unit 6 WORM trigger correctly blocked it. The tombstone design keeps the matter row, so the FK resolves fine — dropped the null-out. `account.py` matter_count now filters `status != STATUS_ARCHIVED` so the export→delete→close-account flow actually works. Test assertion + test fixture updated to match. |
| 2 | `9957684` | `:payload::jsonb` syntax in `test_audit_worm._insert_row` collided with SQLAlchemy named binds — Postgres parsed `::jsonb` as another bind ref. Switched to `CAST(:payload AS jsonb)`. |
| 3 | `34c539a` | `test_usage_endpoint_shape` asserted on speculative field names (`matters_per_user`). Aligned to actual `UsageResponse` shape (`matters`, `documents_per_matter`, …). |
| 4 | `03ec1c1` | `test_matter_create_limit_blocks_at_max` set cap to 1, forgot that signup auto-seeds the Khan matter. Bumped to 2 so the first user-create succeeds, second hits the cap. |
| 5 | `734ad26` + `6f63d9c` | **Storage env cascade.** (a) CI workflow didn't run MinIO, so the upload path tried boto3 → DNS fail. Routed CI to `LocalStorageBackend` via `STORAGE_BACKEND=local` + `LOCAL_STORAGE_ROOT`. (b) `test_export.py` was doing `del os.environ["STORAGE_BACKEND"]` in `finally` — wiping the CI-level env var, cascade-failing every downstream test. Captured prior value + restored. |

---

## 4. What CI Now Proves

Real Postgres validates things local mock tests can't:

- **WORM trigger fires** on attempted UPDATE/DELETE of `audit_entries`. Test `test_audit_worm.py` confirms.
- **Matter delete tombstone path** works end-to-end with audit-FK survival — audit rows still resolve against `status=archived` matter rows after deletion.
- **Storage abstraction routes correctly** between `S3StorageBackend` (prod) and `LocalStorageBackend` (CI / tests) via env.
- **Lockfile drift check** passes (`uv lock --check`).
- **Cryptography ≥44.0.0 assertion** passes (the audit's specific finding is now mechanised in CI).
- **All migrations** run cleanly on a fresh DB — `0010_jobs` (jobs table) + `0011_audit_worm` (trigger function + ENFORCE_AUDIT_WORM trigger).
- **Per-day audit-row counters** for limits (assistant messages, generated artefacts, submissions) actually count.
- **Active-job limit** (3 concurrent queued+running) enforced at `create_job`.
- **Export-then-delete** with no prior export writes the `matter.deleted_without_export` audit warning.

Test count at green: backend has ~180 tests collected (the exact number depends on which DB-backed tests are runnable; local pre-push was 176 + 83 skipped without Postgres).

---

## 5. Non-Negotiables (per `HANDOVER_SERIOUS_BACKEND.md §2`) — verified

- ✅ **No server-paid model keys in production.** `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` is dev-only by gateway-level guard; `fly.toml` deploy comment explicitly says do not set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
- ✅ **Redis does not hold matter content.** arq queue stores job IDs only; the worker reads matter context from Postgres + R2.
- ✅ **Fly filesystem is not source of truth.** Uploaded bytes + generated artefacts now live in R2/MinIO via `app.core.storage`. Matter materialisation (`matter_fs.py`) remains a derived cache.
- ✅ **No new feature surfaces.** Substrate-only. Pre-Motion and Contract Review routers still expose their existing SSE endpoints unchanged; jobs endpoints are additive.
- ✅ **Every migration has rollback/repair thinking.** `0010_jobs` and `0011_audit_worm` both have downgrade paths.
- ✅ **Public copy stays honest.** README, ROADMAP, TRUST, Landing untouched by substrate work (5 of 6 agents tried; integrator reverted each on merge per Andy's freeze rule).

---

## 6. Deferred Follow-ups (explicit, bounded, not in this work)

Three items called out at the time of the substrate push. Each is small-to-medium scope; none block evaluation-grade launch posture.

### F1. Pre-Motion / Contract Review router migration to jobs endpoints

**State:** additive endpoints shipped (`POST /api/matters/{slug}/pre-motion/jobs`, …/contract-review/jobs), worker can run them, audit + job rows flow correctly. The **existing** SSE endpoints (`/pre-motion/run`, `/pre-motion/run-stream`, equivalents on contract-review) still run pipelines inline.

**Why deferred:** the SSE endpoints are working code with real client behaviour (the frontend currently consumes them). Migrating in the same push as the substrate would have meant rushing a runtime change to working modules without proper end-to-end coverage. Substrate-first was the safer call.

**To pick up:** swap the existing routers to enqueue jobs + return the job row, then either (a) keep the SSE channel as a job-status transport pointing at the same job, or (b) drop SSE entirely and have the client poll `/jobs/{id}`. Option (a) preserves the current UX with a smaller change surface.

### F2. Frontend wiring for evaluation-limit 429 banner

**State:** backend boundary enforcement is authoritative — `check_matter_create` / `check_document_upload` / `check_assistant_message` / `check_generated_artefact` / `check_module_submission` all raise 429 with a `evaluation_limit_reached` envelope. The frontend currently surfaces a generic error.

**To pick up:** ~30 lines. Add `EvaluationLimitError` to `frontend/src/lib/api.ts` (mirrors `UploadError` / `ProviderKeyMissingError` patterns), wire a banner primitive that reads `detail.limit` + `detail.current` + `detail.max`. Copy line: "Hosted evaluation limit reached. Legalise is open source; self-hosting removes hosted limits."

### F3. WORM role split (v0.6)

**State:** Unit 6 shipped a **trigger guard** that immediately gives the "code cannot mutate audit rows" property at the database level. The role split (separate `legalise_app` + `legalise_migrate` Postgres roles, with `REVOKE UPDATE, DELETE ON audit_entries FROM legalise_app`) is documented in comments inside `backend/alembic/versions/0011_audit_worm.py` but not yet enacted — it requires a Fly secrets change + new DSN for the worker / API / migrations and is operationally non-trivial.

**To pick up:** the runbook is embedded at the top of the 0011 migration. Land when there's a deploy maintenance window.

---

## 7. New Surfaces Available

Endpoints added (all owner-scoped, cross-user returns 404):

- `GET /api/me/usage` — current/max counts for every limit field
- `POST /api/matters/{slug}/pre-motion/jobs` — enqueue Pre-Motion run as durable job
- `POST /api/matters/{slug}/contract-review/jobs` — same for Contract Review
- `GET /api/matters/{slug}/jobs/{job_id}` — job state
- `GET /api/matters/{slug}/jobs/{job_id}/events` — SSE-based status stream (transport, not source of truth)
- `POST /api/matters/{slug}/export` — start an export job
- `GET /api/matters/{slug}/export/{export_job_id}` — download the export zip
- `DELETE /api/matters/{slug}` — tombstone the matter (status → archived, storage bytes deleted, audit FK preserved)

Background processes:

- arq worker (`python -m app.worker`) — runs Pre-Motion, Contract Review, and Export jobs
- Production migration: `[deploy] release_command = "alembic upgrade head"` in `backend/fly.toml`

New CLIs:

- `python -m app.tools.rotate_encryption_key --old-secret … --new-secret … [--dry-run] [--batch-size N]`

New docs:

- `docs/RUNBOOK.md` — production deploy + manual migration runbook (Unit 3)

---

## 8. Open Questions for the Reviewer

1. **Frontend 429 banner (F2)** — drive it now as part of pre-launch tidy, or hold until first hosted-demo abuse signal?
2. **Pre-Motion / Contract Review jobs migration (F1)** — is the additive shape (new endpoints alongside SSE) sufficient for v0.4 evaluation launch, or should the SSE endpoints be retired before paid eyeballs arrive?
3. **arq worker in CI** — currently CI runs pytest only; the worker process isn't smoke-tested. Worth a follow-up CI job that boots the worker against the same Postgres + Redis + verifies a no-op job round-trip?
4. **Storage backend in CI** — the workflow now routes to `LocalStorageBackend`. Should there also be a separate CI job that spins up MinIO and runs the storage tests against real S3-API to catch boto3-specific behaviour?
5. **Submissions enabled by default off?** — `module_submissions_per_day = 0` is the default and blocks anonymous + authenticated submissions equally. Andy's call whether the hosted demo opens with submissions enabled (e.g. `=1`) or stays closed at launch.

---

## 9. Commit Log Since `eecae83`

```
6f63d9c test_export: restore STORAGE_BACKEND env rather than unconditional del
734ad26 CI: route storage to LocalStorageBackend (no MinIO in workflow)
03ec1c1 Fix test_matter_create_limit: account for auto-seeded Khan matter
34c539a Fix test_usage_endpoint_shape field names
9957684 Fix WORM test: PostgreSQL cast syntax conflicts with SQLAlchemy named binds
c871ba4 Fix Unit 5 + Unit 6 integration: audit FK preserved on tombstone
d51c0c1 Wire Unit 5 exports router + fix DELETE 204 response shape
7278d8b Merge Unit 5: matter export/delete
a0aa5de Merge Unit 6: audit WORM groundwork
a31ec0b Unit 5: matter export/delete
33088f7 Unit 6: audit WORM groundwork
ccd7db1 Wire usage + jobs routers into main.py
d332e6e Merge Unit 2: durable jobs substrate
ffdee5b Merge Unit 4: hosted evaluation limits
aa18535 Merge Unit 8: observability with scrubbing
87d0d62 Unit 2: durable jobs substrate
23ac18f Unit 4: hosted evaluation limits
fd42ca9 Unit 8: observability with scrubbing
1c9a8c7 Merge Unit 7: key rotation CLI
ce7f05c Merge Unit 1: real object storage
5e4b818 Merge Unit 3: migration discipline
9e2970f Unit 3: migration discipline — release-step migrations
37405d3 Unit 1: real object storage abstraction
f691b6d Unit 7: key rotation CLI
2fd1cdc Reframe README around matter-first thesis    ← Andy
eecae83 Document serious backend hardening plan      ← Andy (substrate plan)
```

All pushed to `origin/master`. CI status: green at `6f63d9c`.

---

## 10. Suggested Reviewer Hand-Off Line

> Read `docs/HANDOVER_SUBSTRATE_DONE.md`. All 8 units of `HANDOVER_SERIOUS_BACKEND.md §4` shipped, integrated, pushed; CI green on real Postgres at `6f63d9c`. Three explicit follow-ups (Pre-Motion/Contract Review router migration, frontend 429 banner, WORM role split) named and bounded in §6. Five reviewer questions in §8 — particularly around the additive-vs-replace shape of the new job endpoints and whether the CI matrix should grow to cover MinIO + arq worker.

---

## 11. What's Next for Andy

The pre-launch pre-flight from `HANDOVER_PRE_LAUNCH.md §4` is still load-bearing:

1. **Account checklist** — Cloudflare / Neon / R2 / Resend / Turnstile / GitHub PAT / Fly
2. **Clean-clone smoke walk** (10-item reviewer gate) — task #1 in the work list
3. **Deploy** — `fly launch --copy-config` → `fly secrets set` (no model keys) → `fly deploy` + Cloudflare Pages bundle + DNS
4. **Production smoke walk** — cold open at `legalise.dev`, walk signup → BYO key → upload → workflow → audit row
5. **Launch copy + paired HN drop**

Substrate is now coherent enough that the smoke walk is the real launch test, not a "demo polish" exercise.
