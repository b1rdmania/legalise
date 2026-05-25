# Phase 5 Build Plan — Audit Reconstruction + Cost Tracking

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `02a08ca` (Phase 3 + 4 R2 residual closed; sweep 538 / 8 skipped)
**Goal:** Phase 5 makes the audit table load-bearing. Two deliverables:
1. Audit-reconstruction API — replay the audit log for a matter into a structured timeline that an admin (or the user) can inspect after the fact.
2. Cost tracking — every model invocation carries token + provider + cost on the audit row; matter-scoped rollups land at a stable endpoint.

Same discipline as Phases 1–4: plan first, code follows, full sweep green before handover.

---

## Pre-build findings

Already known from earlier phases:
- `audit_entries` (Phase 1) has WORM triggers, `actor_user_id`, `matter_id`, `action`, `payload` (JSONB), `timestamp` (indexed). The shape is stable; Phase 5 reads it, does not modify it.
- `state_machine_transitions` and `advice_boundary_decisions` are sibling WORM tables (also Phase 1). Phase 5 reconstruction stitches all three into a single timeline.
- Per-capability invocations land as `module.capability.invoked` / `*.completed` / `*.blocked` rows. Capability ids follow the v2 grammar (`<scope>.<resource>.<action>`).
- `module.invoked` rows from the MCP host carry `module_id`, `capability_id`, `invocation_id` (uuid).
- Provider modules already emit `model.invoked` rows with `tokens_in` / `tokens_out` / `model_id` in `payload`. These fields are NOT first-class columns; querying for cost rollup today scans JSONB.

### Carry-over from Phase 3/4 handover

Phase 5 absorbs four tidy items flagged during Phase 3/4 ratification:
1. `InvalidCeremonyTransition` raises 409/422 but emits no audit row — Phase 5 adds `module.ceremony.rejected` (admin-bypass-attempt observability).
2. `CeremonyState.DEPENDENCY_MISSING` is unreachable — Phase 5 either routes through it or removes it. Provisional decision: **remove**, since the 422 lands before ceremony start. The state machine should not carry dead terminals.
3. FastAPI `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warning — sweep to `HTTP_422_UNPROCESSABLE_CONTENT`.
4. `datetime.utcnow()` deprecations across 6 model files — switch to `datetime.now(datetime.UTC)`.

### Architectural decisions taken pre-code

**Decision #1 — Reconstruction is read-only and matter-scoped.**

`GET /api/matters/{slug}/audit/reconstruction?since=…&until=…&include=…` returns a JSON timeline. No mutation. Default scope is the matter; `include=` is a comma-separated set of sources (`audit`, `state_machine`, `advice_boundary`, `ceremony`). Default is all four.

**Authorisation: strict matter-access predicate only.** Reviewer redline (R2): a capability grant is permission to run a scoped capability — NOT permission to inspect every actor, model call, gate decision, failure, and payload on the matter. The reconstruction view is privileged inspection and gates on the canonical matter-access predicate only:

- Matter `created_by_id` (owner), OR
- Workspace `is_superuser` / workspace_admin, OR
- An explicit matter role row (e.g. `qualified_solicitor` assigned to the matter).

Any capability grant on the matter does NOT, on its own, satisfy this predicate. Audited via `audit.reconstruction.viewed`.

**Decision #2 — Timeline rows are dimensional, not nested.**

Each timeline entry is a flat dict:
```
{
  source: "audit" | "state_machine" | "advice_boundary" | "ceremony",
  occurred_at: <ISO timestamp>,
  actor: { user_id, role },
  action: <canonical action name>,
  matter_id, capability_id?, module_id?,
  payload: <source-specific dict>,
  refs: { invocation_id?, ceremony_id?, grant_id?, transition_id? }
}
```

Stitching is by timestamp; ties broken by source order (audit → state_machine → advice_boundary → ceremony). Pagination via `cursor` — opaque base64-encoded JSON of `{source, occurred_at, source_row_id}`. Reviewer redline (R2 P2): the tuple must carry **all three** keys. `(timestamp, id)` alone duplicates or skips rows on timestamp ties across the four source tables (different id spaces, different ordering). The combined key uniquely identifies the next-row boundary regardless of which source the previous page ended on.

**Decision #3 — Cost rollup is a first-class column set, not JSONB scan. Money in micros + currency.**

Reviewer redline (R2 P1): `cost_pence` silently rounds sub-penny model calls and assumes GBP. Many provider calls fall in the sub-penny band; some providers bill in USD. The column set must preserve precision and currency.

Migration `0017_audit_cost_columns.py` adds nullable columns to `audit_entries`:
- `tokens_in: BIGINT`
- `tokens_out: BIGINT`
- `cost_micros: BIGINT`  (integer minor-unit micros — 1 GBP = 100,000,000 micros; 1 USD = 100,000,000 micros)
- `currency: CHAR(3)`  (ISO 4217: `GBP`, `USD`, etc.)
- `provider: VARCHAR(32)`
- `model_id: VARCHAR(128)`
- index `ix_audit_entries_matter_action_timestamp` for rollup queries

These columns are populated **only** for `model.invoked` rows. Other rows leave them NULL. WORM triggers cover them automatically (audit is append-only).

`CostRollup` aggregates `total_cost_micros` per currency — Phase 5 does NOT do FX conversion. The endpoint returns `by_currency: dict[str, int]` (e.g. `{"GBP": 12_345_000, "USD": 4_500_000}`). FX normalisation belongs in a presentation layer or a Phase 7+ commercial reporting surface.

Provider modules (already emitting `model.invoked` audits via `audit_emit`) get a tiny helper — `audit_emit_model_invoked(...)` — that promotes the payload fields into the new columns.

**Decision #4 — No retroactive backfill.**

Existing `model.invoked` rows keep their JSONB-only payload. The new columns are populated forward-only from migration head. The reconstruction view reads either source (column first, JSONB fallback) so old rows still render.

**Decision #5 — No new audit tables.**

Phase 5 reuses `audit_entries`. The reconstruction view is a query, not a materialised store.

---

## Critical path

```
Step 0: carry-over tidy (datetime + 422 deprecations + remove DEPENDENCY_MISSING)
   ↓
Step 1: migration 0017 — audit cost columns + index
   ↓
Step 2: core/audit_cost.py — audit_emit_model_invoked helper
   ↓
Step 3: wire provider modules to the helper (Phase 1 provider module + any test fixtures)
   ↓
Step 4: core/audit_reconstruction.py — timeline builder (pure-functional)
   ↓
Step 5: api/audit.py — GET /api/matters/{slug}/audit/reconstruction
                       GET /api/matters/{slug}/audit/cost
   ↓
Step 6: ceremony rejection audit (carry-over #1) — module.ceremony.rejected emission
   ↓
Step 7: tests
   ↓
Step 8: full sweep green
   ↓
Step 9: HANDOVER_PHASE_5_DONE.md
```

---

## Step 0 — Carry-over tidy

**Files:**
- `backend/app/core/trust_ceremony.py` — remove `CeremonyState.DEPENDENCY_MISSING` and its terminal-failures membership; update audit-action mapping; clean references.
- `backend/app/models/*.py` — replace `datetime.utcnow` with `datetime.now(datetime.UTC)` in six files.
- All `HTTP_422_UNPROCESSABLE_ENTITY` usages → `HTTP_422_UNPROCESSABLE_CONTENT` (single grep-and-replace, validate behavioural parity).

**Tests:** sweep stays green; one regression test confirms `dependency_missing` is no longer a valid ceremony state in the public surface.

~50 LOC delta, zero new logic.

---

## Step 1 — Migration `0017_audit_cost_columns.py`

**File:** `backend/alembic/versions/0017_audit_cost_columns.py` (new)

Add to `audit_entries`:
- `tokens_in BIGINT NULL`
- `tokens_out BIGINT NULL`
- `cost_micros BIGINT NULL`
- `currency CHAR(3) NULL`
- `provider VARCHAR(32) NULL`
- `model_id VARCHAR(128) NULL`

Check constraint: `(cost_micros IS NULL) = (currency IS NULL)` — cost and currency move together.

Index:
- `CREATE INDEX ix_audit_entries_matter_action_timestamp ON audit_entries (matter_id, action, timestamp DESC) WHERE matter_id IS NOT NULL;`

Confirm WORM trigger still rejects UPDATE/DELETE on the new columns (it should — the trigger fires on row, not column).

~40 LOC.

---

## Step 2 — `core/audit_cost.py`

**File:** `backend/app/core/audit_cost.py` (new)

**Public surface:**
- `audit_emit_model_invoked(session, *, matter_id, actor_user_id, module_id, capability_id, model_id, provider, tokens_in, tokens_out, cost_micros, currency, payload_extra: dict | None) -> AuditEntry`
- `rollup_matter_cost(session, *, matter_id, since=None, until=None) -> CostRollup`
- `CostRollup` dataclass: `total_tokens_in: int`, `total_tokens_out: int`, `by_currency: dict[str, int]` (currency → total micros), `by_provider: dict[str, dict[str, int]]` (provider → currency → micros), `by_model: dict[str, dict[str, int]]`, `invocation_count: int`

Helper builds the canonical `model.invoked` row, populates both the new columns AND the JSONB payload (for backwards compatibility with existing readers), then routes through `audit_emit` so the WORM trigger and standard plumbing all apply.

~150 LOC.

---

## Step 3 — Wire provider modules to the helper

**Files:**
- `backend/app/modules/providers/*.py` (any provider that emits `model.invoked` today)
- `backend/tests/fixtures/test_provider_module.py` (the test fixture used in Phase 1+2 sweeps)

Replace direct `audit_emit(action="model.invoked", payload={…})` calls with `audit_emit_model_invoked(…)`. This is the only place that needs to know about the new columns.

~80 LOC delta.

---

## Step 4 — `core/audit_reconstruction.py`

**File:** `backend/app/core/audit_reconstruction.py` (new)

**Public surface:**
- `reconstruct(session, *, matter_id, since=None, until=None, sources={"audit","state_machine","advice_boundary","ceremony"}, cursor=None, limit=200) -> ReconstructionPage`
- `ReconstructionPage` dataclass: `entries: list[TimelineEntry]`, `next_cursor: str | None`, `total_in_window: int`
- `TimelineEntry` dataclass: source, occurred_at, actor, action, matter_id, capability_id, module_id, payload, refs

Implementation:
- One SQL query per source, all filtered by `matter_id` + time window.
- In-memory merge sort by `(timestamp, source_order)`.
- Cursor encoding: `base64(json({"ts": iso, "id": uuid}))`.
- DB-side `LIMIT limit + 1` per source to bound memory.

Pure-functional. No mutation. No external calls.

~300 LOC + dataclass tests.

---

## Step 5 — API endpoints

**File:** `backend/app/api/audit.py` (new)

Endpoints:
- `GET /api/matters/{slug}/audit/reconstruction`
  - Query params: `since`, `until` (ISO8601), `include` (csv), `cursor`, `limit` (≤500, default 200).
  - Authorisation: matter access predicate (same as matter detail).
  - Emits `audit.reconstruction.viewed` audit row on success.
- `GET /api/matters/{slug}/audit/cost`
  - Query params: `since`, `until`.
  - Returns `CostRollup`.
  - Same authorisation. Emits `audit.cost.viewed`.

Both endpoints register **after** any catch-all matter routes (route-ordering rule from Phase 3).

~120 LOC.

---

## Step 6 — Ceremony rejection audit

**File:** `backend/app/api/modules.py` (extend)

When `InvalidCeremonyTransition` is caught and translated to 409:
- Emit `module.ceremony.rejected` audit row with `payload = {requested_action, current_state, ceremony_id, module_id}`.
- Actor is the authenticated user.
- No matter_id (ceremony is workspace-scoped).

Same pattern at the FastAPI 422 layer for unknown actions — a small `add_exception_handler` for `RequestValidationError` that emits the audit row when the path is a ceremony endpoint.

~60 LOC.

---

## Step 7 — Tests

- `test_phase5_audit_cost_columns.py` (~6 tests) — migration head; helper populates columns + JSONB; WORM still rejects UPDATE.
- `test_phase5_audit_reconstruction.py` (~12 tests) — single matter, multi-source merge, cursor pagination, time window, source filter, authorisation, audit-emission on view.
- `test_phase5_cost_rollup.py` (~8 tests) — rollup by provider, by model, time window, multi-matter isolation.
- `test_phase5_ceremony_rejection_audit.py` (~4 tests) — `module.ceremony.rejected` rows land for both `InvalidCeremonyTransition` and Pydantic-422 paths.
- `test_phase5_carryover_tidy.py` (~3 tests) — `DEPENDENCY_MISSING` removed from public surface; no `datetime.utcnow` left in models.

~33 new tests.

---

## Step 8 — Full sweep

- Phase 5 only: ~33 tests
- Phases 1–5 combined: ~570 tests
- Entire backend stays green.

---

## Step 9 — Handover

`HANDOVER_PHASE_5_DONE.md` covers:
- Phase 5 deliverables ledger
- Carry-over tidy items closed (4)
- Architectural decisions (5) requesting Reviewer ratification
- Combined test counts
- Hand-off line for Reviewer

---

## Out of scope (deferred)

- Cost forecasting / budget alerts (Phase 6+ or commercial layer)
- Cross-matter reconstruction (Phase 7 admin console)
- Audit export (PDF / CSV) — Phase 7
- Real-time audit stream (would belong in Phase 6 SSE)
- Reference module ports (Phase 7–10)
- Connector proof set (Phase 11)
- Frontend rendering of the reconstruction timeline (Phase 12)

---

## Reviewer redlines applied

Phase 5 plan v2 incorporates the Reviewer redline (post v1, pre-Step 0):

1. **R2 P1 — Reconstruction auth tightened.** Decision #1 now gates strictly on the matter-access predicate (owner / workspace_admin / explicit matter role). Capability grants on the matter no longer satisfy reconstruction access.
2. **R2 P1 — Money unit fixed.** Decision #3 + Step 1 use `cost_micros: BIGINT` + `currency: CHAR(3)` with a `(cost_micros NULL) = (currency NULL)` check constraint. `CostRollup` aggregates per-currency; no FX conversion at this layer.
3. **R2 P2 — Cursor shape made unambiguous.** Decision #2 cursor is `{source, occurred_at, source_row_id}`, eliminating duplicate/skip on timestamp ties across the four source tables.

---

*End of Phase 5 build plan v2. Builder commits this, then waits for Reviewer ratification of the redline before starting Step 0.*
