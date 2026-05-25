# Phase 6 Build Plan — Streaming + Async Runtime

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** Phase 5 handover commit (TBC; this plan assumes Phase 5 closed and ratified)
**Goal:** Phase 6 turns long-running capability invocations from blocking-HTTP-call into observable async work. Two deliverables:
1. Server-sent events for long-running capability invocations — citation extraction over a bundle, multi-doc bundling, model invocations with streaming tokens.
2. Background job runner — extract-on-upload, batch reindex, scheduled re-evaluation. Reuses the existing arq/Redis worker, but routes capability invocations through the same MCP host so audit + scoping + grant enforcement all still apply.

Phase 6 is architecturally bigger than 5. Two halves built sequentially — SSE first (smaller, lower-risk), then the background runner.

---

## Pre-build findings

Already known:
- An arq worker exists in `backend/app/workers/` (Phase 0 stack-up; runs against the Upstash Redis instance in prod, the compose Redis in dev).
- Capability invocations are dispatched through `MCPHost.invoke_tool()` (Phase 3). Today every call is synchronous over HTTP.
- Frontend (Phase 12, not yet built) has no realtime channel.
- `audit_entries` carries an `invocation_id` field on `module.capability.invoked` / `*.completed` rows — Phase 6 uses this as the SSE channel id.
- Existing Redis usage in the codebase is **only** for short-lived task state — per the non-negotiables (memory: *"Redis never holds matter content"*), Phase 6 must not break this.

### Architectural decisions taken pre-code

**Decision #1 — SSE channel keyed by `invocation_id`. Events are metadata-only.**

When a capability is invoked via `MCPHost.invoke_tool()`, the host returns an `invocation_id` immediately. The client opens `GET /api/invocations/{invocation_id}/events` (SSE).

Reviewer redline (R3 P1): the `non-negotiable "Redis never holds matter content"` rules out any event payload that carries privileged content. Streaming model tokens and document chunks ARE matter content. Phase 6 events are therefore strictly metadata + references to canonical sources of truth (audit rows, artifact rows, document rows in Postgres).

Event types (final):
- `progress` — `{percent: 0-100, message: str}` (message is short status text — no document content, no model output)
- `audit_row` — `{audit_entry_id: uuid, action: str, ts: iso}` — pointer to the freshly-written audit row; the client re-fetches the full row from Postgres if it wants the payload
- `gate_decision` — `{gate: str, decision: "allow"|"block", advice_boundary_decision_id: uuid}` — pointer to the WORM row
- `artifact_ready` — `{artifact_id: uuid, kind: str}` — pointer to a freshly-written artifact in the matter store (e.g. a citation pack, a generated document)
- `terminal` — `{status: "completed"|"blocked"|"failed"|"cancelled", audit_entry_id: uuid, error_code?: str}` — never carries the result payload

`partial_result` is **explicitly out of scope** for Phase 6. Token streaming from model APIs, when the user has supplied keys, lands directly in Postgres as an artifact row; the SSE channel emits `artifact_ready` when the streamed write completes. Phase 7+ may add a separate per-user direct-stream channel that bypasses Redis entirely.

The connection closes on `terminal`. Disconnect-and-reconnect uses `Last-Event-ID` — see Decision #2a for replay semantics across API instances.

**Decision #2 — Event transport is Redis Streams keyed by `invocation_id`.**

Reviewer redline (R3 P2): an in-memory per-API-process ring buffer cannot support replay when the reconnect lands on a different API machine. Hosted-eval already runs 2 app machines on Fly; production will grow. Replay is required, not optional.

Phase 6 uses **Redis Streams** (`XADD invocation:{id} *`, consumer reads via `XREAD`) — keyed by `invocation_id`, capped per-stream at 200 entries via `XADD ... MAXLEN ~ 200`, TTL 5 min via `EXPIRE invocation:{id} 300` set on first publish.

Streams give us three things pub/sub doesn't:
1. **Replay across instances.** Any API machine can `XREAD` from any stream. `Last-Event-ID` maps to the stream entry id.
2. **Bounded memory.** `MAXLEN ~ 200` is enforced by Redis, not by an app-side sweeper.
3. **Audit consistency.** Stream events are metadata-only references to Postgres rows (see Decision #1) — the canonical row is always the source of truth; the stream is the live notification channel. **No matter content ever lands in Redis.**

**Decision #2a — Replay semantics.**

- `Last-Event-ID` header → `XREAD COUNT N STREAMS invocation:{id} <last-id>` returns everything after.
- Stream TTL is 5 min; reconnects after that get a `replay_unavailable` event and must rebuild state from `GET /api/matters/.../audit/reconstruction` (Phase 5).
- Cap of 200 entries: if a client falls more than 200 events behind during an active invocation, they get a `replay_truncated` event and the same fallback applies.

Both gaps documented as "best-effort live UX with authoritative Postgres fallback" — Reviewer explicitly flagged this as acceptable provided it is documented; Phase 5's reconstruction view is the always-correct surface.

**Decision #3 — Background runner is a thin wrapper around the existing arq worker.**

`enqueue_capability(invocation_id, module_id, capability_id, args, *, matter_id, actor_user_id, deadline)` writes:
- A `module.capability.enqueued` audit row (synchronous, in caller's DB session).
- An arq job whose handler calls `MCPHost.invoke_tool(...)` with the same args — meaning grants, scope, signature checks, advice-boundary gates all still apply at execution time.

The arq handler runs in a fresh DB session, dispatches the capability, and emits the usual audit rows (`*.invoked` → `*.completed` / `*.blocked`).

**Decision #4 — Deadlines and cancellation are first-class.**

Every enqueued job carries a `deadline` (default 5 min). Worker checks deadline at three points: enqueue, dequeue, mid-execution. Cancellation:
- `POST /api/invocations/{invocation_id}/cancel` flips a flag in Redis (`invocation:{id}:cancel` SETEX 1h).
- Worker polls the flag at well-defined breakpoints (between document chunks, between MCP tool calls).
- On cancel: emits `module.capability.cancelled`; SSE channel closes with `terminal{status:"cancelled"}`.

Cancellation is **cooperative** — workers that ignore the flag finish their work. Phase 6 documents the breakpoints; module authors honour them.

**Decision #5 — Grants checked at execution, re-checked, not snapshot at enqueue. Via the existing lifecycle helper.**

A capability enqueued at T₀ that runs at T₅ must re-check the grant exists and the matter is still open. Revocation during the wait window MUST cause the job to fail with `module.capability.blocked{reason:"grant_revoked_post_enqueue"}` rather than execute with stale authority.

Reviewer redline (R3 P2): the re-check must call the canonical grant-enforcement helper, NOT embed raw SQL against `granted_permissions_snapshot`. The raw-SQL approach would drift from Phase 4's grant semantics (matter-scoped vs workspace-scoped, snapshot interpretation, revocation cascades). Phase 6 routes through `core/grants_lifecycle.assert_grant_active(session, *, user_id, plugin, capability, matter_id) -> None | raise GrantRevoked` — if that helper doesn't exist yet, Phase 6 Step 0 extracts it from the existing matters/modules call sites first, then Phase 6's worker calls it.

This is the load-bearing decision for honouring the supervised-autonomy claim once jobs run async. Phase 6 cannot defer this to Phase 7.

**Decision #6 — Persisted invocation registry is the source of truth.**

Reviewer redline (R3 P1): SSE + cancel + worker re-check all need an authoritative answer to "who started this invocation, against which matter and module, in what status." Inferring this from scattered audit rows is fragile (audit ids are append-only and the registry needs UPDATE for status transitions).

Phase 6 ships migration `0018_capability_invocations.py`:

```
capability_invocations
  id              UUID PK
  module_id       VARCHAR(128) NOT NULL
  capability_id   VARCHAR(256) NOT NULL
  matter_id       UUID NOT NULL REFERENCES matters(id)
  actor_user_id   UUID NOT NULL REFERENCES users(id)
  status          VARCHAR(32) NOT NULL  -- enqueued|running|completed|blocked|failed|cancelled|deadline_exceeded
  enqueued_at     TIMESTAMPTZ NOT NULL
  started_at      TIMESTAMPTZ NULL
  finished_at     TIMESTAMPTZ NULL
  deadline_at     TIMESTAMPTZ NOT NULL
  grant_id        UUID NULL REFERENCES workspace_skill_capability_grants(id)
  args_hash       VARCHAR(64) NOT NULL  -- sha256 of canonical args
  cancel_requested_at TIMESTAMPTZ NULL
  cancel_requested_by UUID NULL REFERENCES users(id)

  INDEX (matter_id, enqueued_at DESC)
  INDEX (actor_user_id, enqueued_at DESC)
  INDEX (status) WHERE status IN ('enqueued','running')
```

NOT WORM — this table has UPDATE access (status transitions, finished_at). The append-only record stays in `audit_entries`.

`/api/invocations/{id}/events` + `/cancel` authorise by reading the row: `matter_access(matter_id) OR actor_user_id == current_user`. The worker reads + updates this row at dequeue / completion. The SSE event-bus channel id is the row's `id`.

**Decision #7 — No streaming of model tokens from server-paid keys.**

Honours the non-negotiable: *"no server-paid model keys in prod"*. Provider modules that the user has supplied keys for can stream tokens; built-in providers (hosted-eval shipped without server-paid keys) emit a single `terminal` event after the full response is in hand. Phase 6 doesn't change the auth model.

---

## Critical path

```
Step 0: extract assert_grant_active() from existing call sites
        into core/grants_lifecycle.py (R3 P2 prerequisite)
   ↓
Step 1: migration 0018 — capability_invocations table
   ↓
Step 2: core/event_bus.py — Redis Streams publisher + XREAD subscriber
   ↓
Step 3: core/sse.py — FastAPI SSE response helper
   ↓
Step 4: api/invocations.py — GET /events, POST /cancel
        (authorised via capability_invocations row)
   ↓
Step 5: MCPHost integration — emit metadata-only events alongside audit rows
   ↓
Step 6: First reference module wired to progress (test fixture)
   ↓
Step 7: workers/capability_runner.py — arq job handler
   ↓
Step 8: enqueue_capability() in core/runtime.py — writes invocation row + arq job
   ↓
Step 9: Re-check via assert_grant_active() at dequeue
   ↓
Step 10: Cancellation polling + deadline enforcement
   ↓
Step 11: Tests
   ↓
Step 12: Full sweep green
   ↓
Step 13: HANDOVER_PHASE_6_DONE.md
```

---

## Step 0 — extract `assert_grant_active()`

**File:** `backend/app/core/grants_lifecycle.py` (extend)

**Public surface:**
- `async def assert_grant_active(session, *, user_id: UUID, plugin: str, capability: str, matter_id: UUID) -> WorkspaceSkillCapabilityGrant | None`
- Raises `GrantRevoked` if no active grant matches the matter scope.
- Mirrors the predicate already in use at the synchronous call sites (matters API + modules API), now lifted into a single helper.

Phase 6 needs this BEFORE Step 9 worker re-check can be implemented without raw SQL.

~80 LOC + 4 tests.

---

## Step 1 — Migration `0018_capability_invocations.py`

**File:** `backend/alembic/versions/0018_capability_invocations.py` (new)

Creates `capability_invocations` per Decision #6. NOT WORM (status transitions need UPDATE).

~60 LOC.

---

## Step 2 — `core/event_bus.py`

**File:** `backend/app/core/event_bus.py` (new)

**Public surface:**
- `publish(invocation_id: uuid, event_type: str, data: dict) -> str`  (returns stream entry id)
- `subscribe(invocation_id: uuid, *, last_event_id: str | None = None) -> AsyncIterator[Event]`
- `Event` dataclass: `event_id: str` (Redis Streams id), `event_type: str`, `data: dict`, `timestamp: datetime`

Implementation:
- `publish` → `XADD invocation:{id} MAXLEN ~ 200 * type <t> data <json>` + `EXPIRE invocation:{id} 300`
- `subscribe` → `XREAD BLOCK 15000 COUNT 50 STREAMS invocation:{id} <last_event_id or 0>`; loops; yields `replay_truncated` or `replay_unavailable` per Decision #2a when entries are gone.
- No in-memory state. Every API instance can serve any invocation's stream.

**Belt-and-braces metadata guard:** `publish` rejects any `data` dict containing a key in `_FORBIDDEN_KEYS = {"chunk", "tokens", "content", "text", "document"}` with a runtime assertion. Drift protection so module authors cannot accidentally smuggle matter content into Redis.

~280 LOC.

---

## Step 3 — `core/sse.py`

**File:** `backend/app/core/sse.py` (new)

FastAPI `StreamingResponse` helper with correct headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` for Cloudflare). Heartbeat every 15 s (comment-only event line).

~80 LOC.

---

## Step 4 — `api/invocations.py`

**File:** `backend/app/api/invocations.py` (new)

- `GET /api/invocations/{invocation_id}/events` (SSE)
  - Authorisation: load `capability_invocations` row by id; allow if `actor_user_id == current_user` OR `matter_access(matter_id)` (Phase 5's canonical predicate). 404 if no row exists.
  - Honours `Last-Event-ID` header → `event_bus.subscribe(..., last_event_id=...)`.
  - Emits `invocation.events.viewed` audit row on connect.
- `POST /api/invocations/{invocation_id}/cancel`
  - Same authorisation.
  - Sets `cancel_requested_at` + `cancel_requested_by` on the row AND a fast-path flag in Redis (`invocation:{id}:cancel` SETEX 3600) so worker doesn't have to round-trip to Postgres on every poll.
  - Emits `module.capability.cancel_requested` audit row.

~170 LOC.

---

## Step 5 — `MCPHost` integration

**File:** `backend/app/core/mcp_host/host.py` (extend)

`invoke_tool` already emits audit rows. Phase 6 adds a parallel `event_bus.publish` for the metadata-only event types in Decision #1 (`progress`, `audit_row`, `gate_decision`, `artifact_ready`, `terminal`). The audit row remains the source of truth; events are pointers to it.

Module authors get a thin `report_progress(percent, message)` helper passed in as part of the invocation context. The host wraps every audit-row emission so the corresponding `audit_row` event fires automatically — module authors don't choose what to send to Redis. The `_FORBIDDEN_KEYS` guard in `event_bus` is the second line of defence.

~120 LOC delta.

---

## Step 6 — First reference module wired

**File:** `backend/tests/fixtures/test_streaming_module.py` (new fixture)

A synthetic capability that calls `report_progress(...)` five times then completes. Used by the SSE tests. No real work, just enough for the integration tests to exercise the channel.

~60 LOC.

---

## Step 7 — `workers/capability_runner.py`

**File:** `backend/app/workers/capability_runner.py` (new)

arq job `run_capability_job(ctx, *, invocation_id, module_id, capability_id, args, matter_id, actor_user_id, deadline)`:
- Open fresh DB session from worker context.
- Load `capability_invocations` row by id; flip status to `running`, set `started_at`.
- Re-check grant + matter status (Step 9).
- Check cancel flag.
- Dispatch via `MCPHost.invoke_tool(...)`.
- On terminal: flip status to `completed`/`blocked`/`failed`, set `finished_at`, emit terminal event.

~200 LOC.

---

## Step 8 — `enqueue_capability` in `core/runtime.py`

**File:** `backend/app/core/runtime.py` (new or extend)

**Public surface:**
- `enqueue_capability(session, *, module_id, capability_id, args, matter_id, actor_user_id, deadline) -> UUID`

Inside the caller's DB session:
1. Resolve the active grant for `(actor_user_id, module_id, capability_id, matter_id)` via `assert_grant_active`.
2. Insert a `capability_invocations` row with `status='enqueued'`, generated `id`, `args_hash`, `deadline_at`, `grant_id`.
3. Emit `module.capability.enqueued` audit row referencing the invocation_id.
4. Enqueue the arq job carrying the invocation_id.
5. Return the invocation_id so the client can immediately open the SSE channel.

If step 1 raises → no row written, 403 surfaces to the caller.

~100 LOC.

---

## Step 9 — Re-check at dequeue

**File:** `backend/app/workers/capability_runner.py` (extend Step 7)

Before dispatch, in the worker's fresh DB session:
- `await assert_grant_active(session, user_id=..., plugin=..., capability=..., matter_id=...)` — must NOT raise `GrantRevoked`.
- `matter = await session.get(Matter, matter_id); assert matter.status in ACTIVE_STATUSES` — matter must still be open.
- If either fails → flip the `capability_invocations.status` to `blocked`, emit `module.capability.blocked{reason: "grant_revoked_post_enqueue" | "matter_closed_post_enqueue"}` + terminal SSE event, return.

No raw SQL — both checks go through canonical Phase 4 helpers (Decision #5 + R3 P2 redline).

~60 LOC.

---

## Step 10 — Cancellation + deadlines

**Files:**
- `backend/app/workers/capability_runner.py` (extend)
- `backend/app/core/runtime.py` (extend)

- Worker polls `invocation:{id}:cancel` Redis flag at the breakpoints documented in Decision #4.
- Worker checks `now > deadline_at` at the same breakpoints.
- Both → flip `capability_invocations.status` → `cancelled` or `deadline_exceeded`, emit corresponding audit row + terminal SSE event, return.

~80 LOC.

---

## Step 11 — Tests

- `test_phase6_grants_helper.py` (~4 tests) — Step 0 extraction: `assert_grant_active` honours matter scoping, raises on revoked, raises on closed matter.
- `test_phase6_invocations_migration.py` (~3 tests) — Step 1: table shape, indexes, no WORM trigger.
- `test_phase6_event_bus.py` (~10 tests) — XADD/XREAD round-trip, MAXLEN cap, EXPIRE, `Last-Event-ID` replay, `replay_truncated` past cap, `replay_unavailable` past TTL, multi-instance read (subscribe from a different connection), `_FORBIDDEN_KEYS` guard rejects matter content.
- `test_phase6_sse_api.py` (~10 tests) — connection, heartbeat, Last-Event-ID, authorisation via invocation row, 404 on unknown id, cancel endpoint.
- `test_phase6_capability_runner.py` (~12 tests) — enqueue → dequeue → complete, grant re-check via helper, matter-closed re-check, deadline, cooperative cancel, audit + invocation-row state transitions.
- `test_phase6_runtime.py` (~6 tests) — `enqueue_capability` writes row + audit + arq job; rejects when caller lacks grant; returns invocation_id.

~45 new tests (revised up from 36 to cover the new helper + registry surface).

Worker tests need an arq fake — use `arq.connections.create_pool` against the compose Redis with a unique queue name per test.

---

## Step 12 — Full sweep

- Phase 6 only: ~45 tests
- Phases 1–6 combined: ~625 tests
- Entire backend stays green.

---

## Step 13 — Handover

`HANDOVER_PHASE_6_DONE.md` covers:
- Phase 6 deliverables ledger
- Architectural decisions (6) requesting Reviewer ratification
- Combined test counts
- SSE behavioural contract (events, ordering, replay semantics)
- Async-runtime contract (grants re-checked, deadlines, cooperative cancel)
- Hand-off line for Reviewer

---

## Out of scope (deferred)

- Streaming token responses from server-paid model keys (the non-negotiable forbids server-paid keys in prod)
- Cross-invocation event aggregation (Phase 7 admin console)
- WebSocket transport (SSE is sufficient; WS adds bidirectional channel we don't need yet)
- Worker autoscaling (deploy-layer concern; Fly machine count handled outside the app)
- Cancellation via UI (Phase 12 frontend)
- Job priority lanes (one queue for Phase 6; lanes are a Phase 7+ concern)
- Reference module ports (Phase 7–10)
- Connector proof set (Phase 11)

---

## Reviewer redlines applied

Phase 6 plan v2 incorporates the Reviewer redline (post v1, pre-Step 0):

1. **R3 P1 — `partial_result` removed.** Decision #1 events are strictly metadata + pointers to canonical Postgres rows. `_FORBIDDEN_KEYS` runtime guard in `event_bus.publish` rejects any payload containing matter content. Streaming model tokens deferred to Phase 7 via a non-Redis path.
2. **R3 P1 — Persisted invocation registry.** New Decision #6 + migration `0018_capability_invocations` create the authoritative table mapping `invocation_id → (actor_user_id, matter_id, module_id, status)`. SSE and cancel authorise by reading this row, not by scanning audit.
3. **R3 P2 — Replay across API instances solved.** Decision #2 replaces in-memory ring buffer with Redis Streams (`XADD MAXLEN ~ 200`, `EXPIRE 300`). Decision #2a documents the gap semantics (`replay_truncated`, `replay_unavailable`) with Phase 5 reconstruction as the authoritative fallback.
4. **R3 P2 — Grant re-check via lifecycle helper.** Decision #5 + Step 0 + Step 9 wire the worker through `assert_grant_active(...)` (extracted from existing call sites) instead of raw SQL against `granted_permissions_snapshot`.

---

*End of Phase 6 build plan v2. Builder commits this together with Phase 5 plan v2, then waits for Reviewer ratification of both redlines before starting Phase 5 Step 0.*
