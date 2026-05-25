# Phase 5 Build Plan v3 — Audit Reconstruction + Cost Metadata (TRIMMED)

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `e1bdd5e` (v2.1 nits closed)
**Supersedes:** `PHASE_5_BUILD_PLAN.md` (v2.1)
**Goal:** Phase 5 makes the audit table load-bearing — but only as deep as the smallest real proof needs. Two deliverables only:

1. **Audit-reconstruction API** — replay the audit log for a matter into a structured timeline that an admin can inspect after the fact.
2. **Cost metadata on `model.invoked` rows** — token + provider + cost-in-micros + currency promoted to first-class columns + a helper that writes them.

Same discipline as Phases 1–4: plan first, code follows, full sweep green before handover.

---

## What v3 cuts vs v2.1

Per Andy's redirect (Reviewer's narrow-vertical-slice framing, accepted 2026-05-25):

**Dropped from v2:**
- `GET /api/matters/{slug}/audit/cost` endpoint
- `rollup_matter_cost(...)` helper + `CostRollup` dataclass
- Test file `test_phase5_cost_rollup.py`

**Reason:** cost metadata as provenance is essential; a cost dashboard is product breadth. The columns + helper get written so the data is there when a real module starts emitting it. Aggregation can happen in a SQL query when there's a real reason to look. No endpoint.

**Kept from v2 (unchanged):**
- Carry-over tidy (Step 0)
- Migration `0017` cost columns + check constraint
- `audit_emit_model_invoked` helper
- Provider-module wiring
- `core/audit_reconstruction.py` timeline builder
- `GET /api/matters/{slug}/audit/reconstruction` endpoint
- Ceremony rejection audit (`module.ceremony.rejected` emission for `InvalidCeremonyTransition` + Pydantic-422 fall-throughs)
- All five architectural decisions (auth, cursor shape, micros+currency, no backfill, no new audit tables)

---

## Pre-build findings + architectural decisions

Identical to v2.1. See `PHASE_5_BUILD_PLAN.md` for the full text — the five decisions remain ratified at `023a4b3`:

1. **Reconstruction is read-only and matter-scoped, auth = strict matter-access predicate.**
2. **Timeline rows are dimensional, not nested**; cursor is `{source, occurred_at, source_row_id}`.
3. **Cost rollup is first-class columns** — `cost_micros: BIGINT` + `currency: CHAR(3)` with NULL-paired check constraint. (v3 keeps the columns; drops the rollup endpoint.)
4. **No retroactive backfill.**
5. **No new audit tables.**

---

## Critical path (revised)

```
Step 0: carry-over tidy
        (datetime.utcnow → datetime.now(UTC), 422 deprecation,
         remove dead CeremonyState.DEPENDENCY_MISSING)
   ↓
Step 1: migration 0017 — audit cost columns + check + index
   ↓
Step 2: core/audit_cost.py — audit_emit_model_invoked helper
   ↓
Step 3: wire provider modules to the helper
   ↓
Step 4: core/audit_reconstruction.py — timeline builder
   ↓
Step 5: api/audit.py — GET /api/matters/{slug}/audit/reconstruction
        (no /audit/cost endpoint — dropped per v3 trim)
   ↓
Step 6: ceremony rejection audit
   ↓
Step 7: tests
   ↓
Step 8: full sweep green
   ↓
Step 9: HANDOVER_PHASE_5_DONE.md
```

---

## Step 0 — Carry-over tidy

Unchanged from v2.1. ~50 LOC delta, zero new logic.

**Files:**
- `backend/app/core/trust_ceremony.py` — remove `CeremonyState.DEPENDENCY_MISSING`
- `backend/app/models/*.py` (6 files) — `datetime.utcnow()` → `datetime.now(datetime.UTC)`
- Sweep `HTTP_422_UNPROCESSABLE_ENTITY` → `HTTP_422_UNPROCESSABLE_CONTENT`

**Tests:** one regression confirming `dependency_missing` removed from public surface.

---

## Step 1 — Migration `0017_audit_cost_columns.py`

Unchanged from v2.1. Adds `tokens_in`, `tokens_out`, `cost_micros`, `currency`, `provider`, `model_id` to `audit_entries` + `(cost_micros NULL) = (currency NULL)` check + partial index. ~40 LOC.

---

## Step 2 — `core/audit_cost.py`

**Trimmed.**

**File:** `backend/app/core/audit_cost.py` (new)

**Public surface (v3, single function):**
- `audit_emit_model_invoked(session, *, matter_id, actor_user_id, module_id, capability_id, model_id, provider, tokens_in, tokens_out, cost_micros, currency, payload_extra: dict | None) -> AuditEntry`

Builds the canonical `model.invoked` row, populates both the new columns AND the JSONB payload (forward-compat for any external reader), routes through `audit_emit` so WORM + plumbing apply.

Dropped: `rollup_matter_cost`, `CostRollup`. They live on the v2.1 plan and can come back in a later phase if needed.

~80 LOC.

---

## Step 3 — Wire provider modules to the helper

Unchanged from v2.1. Replace direct `audit_emit(action="model.invoked", payload={…})` calls with `audit_emit_model_invoked(…)` at every provider call site (Phase 1 provider module + test fixtures). ~80 LOC delta.

---

## Step 4 — `core/audit_reconstruction.py`

Unchanged from v2.1.

**Public surface:**
- `reconstruct(session, *, matter_id, since=None, until=None, sources={"audit","state_machine","advice_boundary","ceremony"}, cursor=None, limit=200) -> ReconstructionPage`
- `ReconstructionPage`, `TimelineEntry` dataclasses
- Cursor encoded as `base64(json({"source", "occurred_at", "source_row_id"}))`

Pure-functional. One SQL query per source, in-memory merge sort, DB-side `LIMIT limit + 1` per source to bound memory.

~300 LOC.

---

## Step 5 — API endpoint

**Trimmed.**

**File:** `backend/app/api/audit.py` (new)

**Single endpoint (v3):**
- `GET /api/matters/{slug}/audit/reconstruction`
  - Query params: `since`, `until` (ISO8601), `include` (csv), `cursor`, `limit` (≤500, default 200).
  - Authorisation: strict matter-access predicate (Decision #1 v2.1).
  - Emits `audit.reconstruction.viewed` audit row on success.

Dropped: `GET /api/matters/{slug}/audit/cost`. The data is in the table; aggregate via SQL when needed.

Registered **after** any catch-all matter routes (route-ordering rule from Phase 3).

~70 LOC.

---

## Step 6 — Ceremony rejection audit

Unchanged from v2.1.

When `InvalidCeremonyTransition` is caught → 409, emit `module.ceremony.rejected` audit row. Same pattern at the FastAPI 422 layer via `add_exception_handler` for `RequestValidationError` on ceremony endpoints.

~60 LOC.

---

## Step 7 — Tests (trimmed)

- `test_phase5_audit_cost_columns.py` (~6 tests) — migration head; helper populates columns + JSONB; WORM still rejects UPDATE.
- `test_phase5_audit_reconstruction.py` (~12 tests) — single matter, multi-source merge, cursor pagination, time window, source filter, **strict matter-access authorisation** (capability-grant-only callers rejected), audit-emission on view.
- `test_phase5_ceremony_rejection_audit.py` (~4 tests) — `module.ceremony.rejected` rows land for both `InvalidCeremonyTransition` and Pydantic-422 paths.
- `test_phase5_carryover_tidy.py` (~3 tests) — `DEPENDENCY_MISSING` removed from public surface; no `datetime.utcnow` left in models.

**Dropped:** `test_phase5_cost_rollup.py` (8 tests).

**v3 total: ~25 new tests** (down from ~33 in v2.1).

---

## Step 8 — Full sweep

- Phase 5 v3 only: ~25 tests
- Phases 1–5 combined: ~560 tests
- Entire backend stays green.

---

## Step 9 — Handover

`HANDOVER_PHASE_5_DONE.md` covers:
- Phase 5 v3 deliverables ledger
- Carry-over tidy items closed (4)
- Five architectural decisions (all ratified at v2.1)
- v3 trim rationale (cost-endpoint deferred per vertical-slice framing)
- Combined test counts
- Hand-off line for Reviewer

---

## Out of scope (deferred to Phase 7+ or later)

- `GET /audit/cost` endpoint + matter-scoped cost rollups (drop)
- Cost forecasting / budget alerts
- Cross-matter reconstruction (Phase 8+ admin console)
- Audit export (PDF / CSV)
- Real-time audit stream (Phase 7 async runtime)
- Frontend rendering of the reconstruction timeline (Phase 12)

---

*End of Phase 5 build plan v3. Builder commits this together with the new Phase 6 vertical-slice plan, then starts Phase 5 Step 0 once Reviewer ratifies the v3 trim.*
