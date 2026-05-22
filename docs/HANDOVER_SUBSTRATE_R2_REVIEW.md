# Substrate R2 Review Handover

Repo head: `385ce41` (launch operations checklists on top of substrate fixes).
Code head under review: `3d89ed4`.
Prior review-fix handover: `docs/HANDOVER_SUBSTRATE_REVIEW_FIXES.md`.

This is a reviewer handover for the next agent. It starts with the two concrete
issues opened by the substrate review re-check, but the backend-hardening ethos
has changed: anything affecting trust boundaries, deletion, export, storage,
jobs, audit, provider keys, upload validation, limits, or operational failure
modes is in scope now. Public copy and launch narrative can wait; backend
correctness should not be version-bucketed if the fix is bounded.

## TL;DR

The substrate fix batch materially closed the original three P1 findings:
enqueue failures now mark jobs failed, delete fails closed on storage failure,
and tabular review exports write through the object-storage abstraction.

Two immediate follow-up implementation items remain before I would call the
backend substrate clean:

1. Archived/deleted matters are still reachable through several module, job,
   and export routes because their matter resolvers do not exclude
   `status="archived"`.
2. The active-job limit has two sources of truth: `/api/me/usage` reports the
   env-configured value, but actual enforcement still uses a hard-coded `3`.

There is also one policy note to decide while hardening: Redis enqueue failures
currently count against `workflow_runs_per_day`. That is acceptable if the
limit means "attempts"; if not, exclude `error_code="enqueue_failed"` from the
daily run count.

Once those are closed, keep going through the backend trust-boundary queue:
route access control, export/delete consistency, upload validation, provider-key
failure audit completeness, WORM role verification, storage retry semantics,
key-rotation smoke, and CI coverage for those behaviours.

## What Was Checked

Fix range checked:

- `dcb56a7` - substrate review fixes
- `148bae1` - merge
- `4ca46bf` - `PreMotionRunInputs.depth` test fix
- `3d89ed4` - remove explicit rollback in delete-matter storage failure path

Docs-only follow-up on top:

- `385ce41` - launch operations checklists

Commands used:

```bash
git diff --name-only 1fa9d6d..3d89ed4
rg -n "enqueue_failed|_enqueue_or_mark_failed|matter_storage_delete_failed|check_workflow_run|workflow_runs_today|active_jobs|basic matter export" backend docs
git diff --check 1fa9d6d..3d89ed4
```

No full local test run was repeated during this review; the hand-back claims CI
green on real Postgres. The review was code-path inspection against that claim.

## Confirmed Closed

### Original P1: Enqueue failure strands queued jobs

Status: closed.

Files:

- `backend/app/api/jobs.py`
- `backend/app/api/exports.py`
- `backend/tests/test_jobs.py`
- `backend/tests/test_export.py`

What changed:

- Both job surfaces added `_enqueue_or_mark_failed`.
- If Redis enqueue fails after the DB job row is committed, the job is moved to
  `failed`, `error_code="enqueue_failed"` is written, terminal state is
  committed, and the API returns `503`.
- Active-job counts exclude terminal states, so retry capacity is freed.

Reviewer note:

- This is the right immediate shape. It keeps Redis as a transport and the job
  row as the source of truth.

### Original P1: Matter delete succeeds when storage deletion fails

Status: closed for the exact failure that was reported.

Files:

- `backend/app/api/matters.py`
- `backend/tests/test_matter_delete.py`

What changed:

- Storage deletion now happens before `matter.deleted` audit rows and before
  `matter.status = "archived"`.
- If `storage.delete_prefix(...)` raises, the endpoint returns `502` with
  `error="matter_storage_delete_failed"`.
- The matter remains live, not archived.
- No `matter.deleted` audit row is emitted on that failed path.

Reviewer note:

- There is still the standard distributed-system caveat: if storage deletion
  succeeds but the later DB commit fails, storage has gone while the DB matter
  remains open. That is not introduced by this patch. It should be logged as a
  hardening follow-up if the next agent has capacity, with an outbox/delete-state
  machine as the likely durable shape.

### Original P1: Tabular review export writes local filesystem

Status: closed.

Files:

- `backend/app/modules/tabular_review/export.py`
- `backend/tests/test_tabular_review_export.py`

What changed:

- The exporter now uses `get_storage_backend().put_bytes(...)`.
- Storage key uses `generated_key(...)`.
- Test asserts valid `.docx` bytes are readable from storage and the old
  filesystem path is not used.

Reviewer note:

- This is now aligned with the generated-document download path.

### Original P2: Workflow-run limit declared but not enforced/surfaced

Status: mostly closed; see Issue 2 below.

Files:

- `backend/app/core/limits.py`
- `backend/app/api/jobs.py`
- `backend/app/api/usage.py`
- `backend/tests/test_limits.py`

What changed:

- `check_workflow_run(...)` counts Pre-Motion and Contract Review jobs created
  today.
- Exports are intentionally excluded.
- `/api/me/usage` now returns `workflow_runs_today` and `active_jobs`.
- Test covers `workflow_runs_per_day=0` returning `429`.

Reviewer note:

- The daily workflow limit itself is now real.
- Active-job reporting and active-job enforcement still diverge if
  `LEGALISE_LIMIT_ACTIVE_JOBS` is changed. See Issue 2.

### Original P2: Matter export overclaim

Status: closed.

Files:

- `backend/app/api/exports.py`
- `backend/app/core/exports.py`
- `backend/tests/test_export.py`

What changed:

- Export docs now call it a "basic matter export bundle", not complete data
  portability.
- Out-of-scope list is explicit: chronology, document bodies, versions, edits,
  citations, tabular review rows, assistant messages, generated artefact bytes.
- Test asserts out-of-scope files are absent so a future expansion must update
  the claim.

Reviewer note:

- Good Path A implementation. Full export scope remains a hardening item when
  the backend team is ready to widen the bundle.

## Issue 1 - Archived Matter Access Sweep

Severity: P1 for deletion posture.

Current problem:

`DELETE /api/matters/{slug}` tombstones the matter and removes storage bytes.
`GET /api/matters/{slug}` correctly returns `404` afterwards because
`backend/app/api/matters.py` checks `matter.status == STATUS_ARCHIVED`.

But many other routes fetch by `Matter.slug` and `created_by_id` only. They do
not exclude archived matters. That means a user who knows the slug can still
hit module/job/export routes against a deleted matter.

Examples found:

- `backend/app/api/jobs.py`:
  - `_resolve_matter(...)`
  - SSE preflight lookup
- `backend/app/api/exports.py`:
  - `_resolve_matter_owned(...)`
- `backend/app/modules/assistant/router.py`
- `backend/app/modules/chronology/router.py`
- `backend/app/modules/letters/router.py`
- `backend/app/modules/pre_motion/router.py`
- `backend/app/modules/contract_review/router.py`
- `backend/app/modules/tabular_review/router.py`
- `backend/app/modules/case_law/router.py`

Why it matters:

The public deletion story is now "export/delete exists and matter deletion
removes storage bytes." If archived matters remain reachable through module
routes, reviewers can say deletion is partial and inconsistent.

Recommended implementation:

1. Add a shared resolver in a core/API utility location, for example:

   ```python
   async def resolve_owned_open_matter(
       session: AsyncSession,
       slug: str,
       user_id: uuid.UUID,
   ) -> Matter:
       ...
   ```

2. Resolver should:

   - filter by `Matter.slug == slug`
   - filter by `Matter.created_by_id == user_id`
   - exclude `Matter.status == STATUS_ARCHIVED`
   - return 404 for missing, cross-user, or archived

3. Replace duplicated matter lookup helpers in the surfaces above.

4. Keep any route that genuinely needs archived matters explicit. If there are
   none, no exception needed.

Acceptance tests:

- Create matter, delete it, then assert `404` for:
  - `GET /api/matters/{slug}/jobs/{job_id}` or unknown job path
  - `POST /api/matters/{slug}/export`
  - `GET /api/matters/{slug}/export/{job_id}`
  - assistant route
  - one representative module route, ideally chronology or pre-motion
- Existing tests for live, owned matters remain green.
- Cross-user behaviour remains 404.

Suggested test file:

- Extend `backend/tests/test_matter_delete.py`, or add
  `backend/tests/test_archived_matter_access.py`.

Hard guard:

- Do not make archived matters return 403. The codebase convention is 404 for
  missing, cross-user, and inaccessible matter resources.

## Issue 2 - Active-Job Limit Single Source of Truth

Severity: P2.

Current problem:

`/api/me/usage` reports `active_jobs.max` from `app.core.limits.Limits`, which
reads:

```python
LEGALISE_LIMIT_ACTIVE_JOBS
```

Actual enforcement imports hard-coded `ACTIVE_JOB_LIMIT = 3` from
`backend/app/models/job.py`.

Files:

- Reporting source:
  - `backend/app/core/limits.py`
  - `backend/app/api/usage.py`
- Enforcement source:
  - `backend/app/models/job.py`
  - `backend/app/core/jobs.py`
  - `backend/app/api/jobs.py`
  - `backend/app/api/exports.py`

Why it matters:

If production sets `LEGALISE_LIMIT_ACTIVE_JOBS=10`, the usage endpoint says the
limit is 10 but enforcement still rejects the fourth active job. If production
sets it to 1, UI says 1 but backend still allows 3.

Recommended implementation:

1. Remove `ACTIVE_JOB_LIMIT` from `models/job.py`, or leave only a legacy alias
   that is not used for enforcement.
2. Put the canonical value in `core.limits`, ideally reusing the existing
   `ACTIVE_JOBS_LIMIT`.
3. Update `core/jobs.py` to call the canonical value at runtime.
4. Update `api/jobs.py` and `api/exports.py` error envelopes to report the same
   canonical value.
5. Update tests to prove override behaviour.

Acceptance tests:

- With active job limit set to 1, first job can queue and second returns 429.
- `/api/me/usage.active_jobs.max` returns 1 in the same test configuration.
- The `active_job_limit_reached` response body reports `limit: 1`.

Implementation caution:

- `get_limits()` is process-cached. Existing tests monkeypatch
  `limits_module._limits`. Keep that pattern or add a reset helper so env-based
  overrides are deterministic in tests.

## Policy Note - Failed Enqueue Attempts and Daily Workflow Quota

Severity: policy decision, not a blocker.

Current behaviour:

`check_workflow_run(...)` counts all Pre-Motion and Contract Review jobs created
today, regardless of terminal status. That means a Redis enqueue failure creates
a failed job and consumes one `workflow_runs_per_day` slot.

This is defensible if the limit means "workflow run attempts today."

Alternative:

If the product wants the hosted limit to mean "successfully queued workflow
runs", exclude jobs where:

```python
status == "failed" and error_code == "enqueue_failed"
```

Recommendation:

Decide explicitly. Simpler default: keep counting attempts because it is easy
to explain and enqueue failure should be rare in production if Redis is healthy.
More user-friendly default: exclude `enqueue_failed` rows because no workflow
actually ran. If this changes, update both `check_workflow_run(...)` and
`/api/me/usage.workflow_runs_today` together.

## Backend Hardening In Scope

After the two immediate items, the next agent should keep backend hardening in
scope. This does not mean rewriting the product. It means following the trust
edges until they are defensible.

Current hardening queue:

- Archived-matter access sweep across every route.
- Active-job limit single source of truth.
- Route access-control sweep for all owner-scoped resources.
- Export/delete consistency, including whether exports should remain
  downloadable after matter tombstone or must be downloaded before delete.
- Job quota semantics around enqueue failure.
- Storage retry/failure semantics beyond the first delete failure case.
- WORM role split verification in production-like Postgres.
- Provider-key failure audit completeness.
- Upload magic-byte validation.
- Key-rotation CLI smoke, not just existence.
- CI coverage for the above behaviours.

Still separate from this backend-hardening lane:

- Landing page copy.
- README philosophy rewrite.
- Social launch copy.
- Broad module-system product redesign.

Public docs can receive a pre-launch sweep after backend behaviour settles. If a
backend claim becomes false while hardening, fix the claim at the end of the
hardening pass rather than scattering public-copy churn mid-flight.

## Suggested Hand-Off Line

> Read `docs/HANDOVER_SUBSTRATE_R2_REVIEW.md`. Treat it as the first slice of
> full backend production hardening, not a narrow version patch. Start with
> archived-matter access and active-job limit consistency, then continue through
> backend trust boundaries: deletion, export, jobs, storage, audit, provider
> keys, upload validation, limits, and operational failure modes. Public copy
> can wait; backend hardening is in scope.
