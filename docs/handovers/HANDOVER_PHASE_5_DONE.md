# Handover — Phase 5 Done (v3 trim)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Sweep:** 564 passed, 8 skipped, 0 failed
**Plan:** `docs/handovers/PHASE_5_BUILD_PLAN_V3.md`

---

## Deliverables ledger

| Step | Title | Status | Commit |
| --- | --- | --- | --- |
| 0 | Carry-over tidy | done | `7637830` |
| 1 | Migration 0017 — cost columns | done | `f18ace1` |
| 2 | `audit_emit_model_invoked` helper | done | `117549d` |
| 3 | Wire providers to helper | closed early — no existing emit site has cost data; helper is forward-looking for Phase 6 | n/a |
| 4 | `audit_reconstruction` timeline builder | done | (this commit) |
| 5 | Reconstruction API endpoint | done | (this commit) |
| 6 | Ceremony rejection audit emission | done | (this commit) |
| 7 | Tests | done — 22 new tests | (this commit) |
| 8 | Full sweep green | done — 564 / 8 skipped | (this commit) |
| 9 | This handover | done | (this commit) |

---

## Architectural decisions requesting Reviewer ratification

All five v2 decisions stand. The v3 trim altered scope, not decisions. Re-stating for the ratification record:

**1. Reconstruction is read-only and matter-scoped, auth = strict matter-access predicate.**

`GET /api/matters/{slug}/audit/reconstruction` gates strictly on:
- `Matter.created_by_id == user.id` (owner), OR
- `User.is_superuser` (workspace superuser fallback)

Capability grants on the matter do NOT, on their own, satisfy access. The reconstruction view is privileged inspection; a grant lets you RUN a capability, not READ the audit trail of every other capability the matter has run.

A 404 (not 403) is returned for unauthorised callers — uniform cross-user response avoids leaking which matters exist.

The explicit-matter-role surface (third clause from the v2 plan) is deferred to Phase 7+ when role rows are real.

**2. Three sources, cursor shape `{source, occurred_at, source_row_id}`.**

Originally four sources in the v2 plan. The dedicated `ceremony` source was redundant — ceremony events (`module.ceremony.*`, `module.installed`, `module.granted`, etc.) are emitted via the standard audit path and live in `audit_entries` already. Removed.

Final three sources:
- `audit` — `audit_entries` filtered by `matter_id`
- `state_machine` — `state_machine_transitions` joined to `state_machine_instances` (owner_scope='matter', owner_id=str(matter_id)) and `state_machine_definitions` (for `definition_key`)
- `advice_boundary` — `advice_boundary_decisions` filtered by `gate_state->>'matter_id' = matter_id`

Cursor shape is `{source, occurred_at, source_row_id}`. The three-key tuple uniquely identifies the next-row boundary across three id spaces with different orderings. `(occurred_at, id)` alone would duplicate or skip rows on timestamp ties.

**3. Cost rollup is first-class columns. Micros + currency. NO `/audit/cost` endpoint (v3 trim).**

Migration `0017_audit_cost_columns.py` adds six nullable columns to `audit_entries`:

- `tokens_in BIGINT`
- `tokens_out BIGINT`
- `cost_micros BIGINT`
- `currency CHAR(3)`
- `provider VARCHAR(32)`
- `model_id VARCHAR(128)`

Plus a check constraint `ck_audit_entries_cost_currency_paired` enforcing `(cost_micros IS NULL) = (currency IS NULL)`. Cost and currency move together.

Plus a partial index `ix_audit_entries_matter_action_timestamp` on `(matter_id, action, timestamp DESC) WHERE matter_id IS NOT NULL` for ad-hoc rollups when they're needed.

The `/audit/cost` endpoint, `rollup_matter_cost()` helper, and `CostRollup` dataclass from v2 are **dropped under the v3 trim**. Cost metadata as provenance is essential; a cost dashboard is product breadth. The data is in the table; aggregation can happen in SQL when there's a real spending signal.

**4. No retroactive backfill.**

Existing `model.invoked`/`model.call` rows keep their JSONB-only payload. New columns populate forward-only from migration head. Reconstruction reads column-first / JSONB-fallback so old rows still render.

**5. No new audit tables.**

Phase 5 reuses `audit_entries`. The reconstruction view is a query, not a materialised store.

---

## Carry-over items closed (Step 0)

Four tidy items absorbed:

1. **`CeremonyState.DEPENDENCY_MISSING` removed.** Phase 4's R2 fix returns 422 BEFORE `start_ceremony`, so the terminal state was unreachable. Dead transitions in a state machine confuse readers; gone.
2. **`datetime.utcnow()` → `datetime.now(UTC)`** across 26 files (3 core, 21 models, 3 module pipelines). Plan said 6 model files; reality was wider. Same mechanical change. Sweep warnings dropped from ~12,773 to 2.
3. **`HTTP_422_UNPROCESSABLE_ENTITY` → `HTTP_422_UNPROCESSABLE_CONTENT`** across `api/{matter_context,modules,state_machine}.py`. FastAPI 1.x renamed it.
4. **Regression test** at `backend/tests/test_phase5_carryover_tidy.py` pins all three so they can't creep back via copy-paste.

---

## New files

```
backend/alembic/versions/0017_phase5_audit_cost_columns.py
backend/app/core/audit_cost.py
backend/app/core/audit_reconstruction.py
backend/app/api/audit.py
backend/tests/test_phase5_carryover_tidy.py
backend/tests/test_phase5_audit_cost_columns.py
backend/tests/test_phase5_audit_reconstruction.py
backend/tests/test_phase5_ceremony_rejection_audit.py
```

## Modified files

```
backend/app/core/api.py                 — audit.log gains six cost kwargs
backend/app/core/trust_ceremony.py      — DEPENDENCY_MISSING removed
backend/app/api/modules.py              — ceremony rejection audit emission + 422 sweep
backend/app/api/state_machine.py        — 422 sweep
backend/app/api/matter_context.py       — 422 sweep
backend/app/main.py                     — audit router registration + RequestValidationError handler with ceremony-rejection audit emission
backend/app/models/audit.py             — six new cost columns on AuditEntry
26 files (models + core + modules)      — datetime.utcnow → datetime.now(UTC)
```

---

## Tests added (22 total)

| File | Tests | What it pins |
| --- | --- | --- |
| `test_phase5_carryover_tidy.py` | 4 | DEPENDENCY_MISSING gone, no datetime.utcnow, no HTTP_422_UNPROCESSABLE_ENTITY |
| `test_phase5_audit_cost_columns.py` | 6 | Helper populates columns + payload, validates pairing, rejects negative cost, rejects unknown currency, check constraint at DB level, WORM still rejects UPDATE |
| `test_phase5_audit_reconstruction.py` | 14 | Cursor round-trip, source ordering, single-source filter, matter scoping, time window, unknown source rejection, bad limit rejection, three-source merge in canonical order, pagination cursor (no overlap), API owner-passes, API non-owner 404s, API audit-reconstruction-viewed emission, API unknown source 422 |
| `test_phase5_ceremony_rejection_audit.py` | 2 | `InvalidCeremonyTransition` → 409 + `module.ceremony.rejected` audit; `{"action":"banana"}` → 422 + same audit row via global RequestValidationError handler |

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Migrate test DB to head (includes 0017).
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+psycopg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head

# Phase 5 only — 26 tests across 4 files.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest \
    tests/test_phase5_carryover_tidy.py \
    tests/test_phase5_audit_cost_columns.py \
    tests/test_phase5_audit_reconstruction.py \
    tests/test_phase5_ceremony_rejection_audit.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Out of scope (deferred)

- `GET /audit/cost` endpoint + matter-scoped cost rollups (v3 trim)
- Cost forecasting / budget alerts
- Cross-matter reconstruction
- Audit export (PDF / CSV)
- Real-time audit stream (Phase 7 parked async runtime)
- Frontend rendering of the reconstruction timeline (Phase 12)
- Sigstore/Rekor real verification (Phase 11)

---

## Hand-off line for Reviewer

> *Phase 5 v3 (trimmed) implemented end-to-end on `runtime-rewrite`. Full sweep green: 573 passed, 8 skipped. 31 new tests; 26 files modernised (`datetime.utcnow` → `datetime.now(UTC)`). Reconstruction endpoint live at `/api/matters/{slug}/audit/reconstruction` with strict matter-access auth. Five architectural decisions request ratification. R2 fixes for cursor-pagination + malformed-cursor-422 applied. Phase 6 (Contract Review vertical slice) starts after this handover lands.*

---

## R2 fixes applied (post-handover Reviewer pass)

Reviewer flagged one P1 + one P2 on the first ratification pass; both fixed in `core/audit_reconstruction.py` with 9 new tests in `test_phase5_audit_reconstruction_r2_fixes.py`.

**P1 — Pagination silently skipped rows from non-cursor sources.**

The pre-fix shape: when the cursor lived on source X, only source X's SQL applied the strict-after filter. Sources Y/Z re-queried from the window start with LIMIT N — so a source with many pre-cursor rows could have the first N rows all sorted BEFORE the cursor, get dropped in memory, and later rows from that source never get fetched (capped by LIMIT N).

Fix: new `_cursor_predicate()` helper builds a per-source SQL predicate that applies the global cursor key, adapted via `SOURCE_ORDER` for cross-source tie-breaking:
- `SOURCE_ORDER[self] > cursor_source_order` → `ts >= cursor_ts` (ties on this source count as later)
- `SOURCE_ORDER[self] < cursor_source_order` → `ts > cursor_ts` (ties on this source count as earlier)
- `SOURCE_ORDER[self] == cursor_source_order` → standard `(ts > cursor_ts) OR (ts == cursor_ts AND id > cursor_row_id)`

The in-memory filter survives as defence-in-depth so any future-source bug fails closed (omits) rather than open (duplicates).

**P2 — Malformed cursor returned 500, not 422.**

The pre-fix `decode_cursor` raised `base64.binascii.Error`, `json.JSONDecodeError`, `KeyError`, or `ValueError` from `datetime.fromisoformat` — only the last was caught by the API's `ValueError` translator. Bad client cursors leaked as HTTP 500.

Fix: `decode_cursor` wraps every failure mode into a `ValueError` with a useful message. Six failure paths covered: bad base64, bad JSON, non-dict payload, missing keys, non-string source/source_row_id, bad timestamp, non-UUID row id. The API translation to HTTP 422 was already in place.

**Sweep after R2 fixes:** 573 passed, 8 skipped, 0 failed.

---

*End of Phase 5 v3 handover.*
