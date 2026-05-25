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

**Decision #1 — SSE channel keyed by `invocation_id`, not by user or matter.**

When a capability is invoked via `MCPHost.invoke_tool()`, the host returns an `invocation_id` immediately. The client opens `GET /api/invocations/{invocation_id}/events` (SSE). Events are typed:
- `progress` — `{percent: 0-100, message: str}`
- `partial_result` — `{chunk: any}` (for streaming models)
- `audit` — minimal audit-row preview so the timeline can update live
- `gate_decision` — fires when an advice-boundary gate evaluates
- `terminal` — `{status: "completed"|"blocked"|"failed", result?: any, error?: str}`

The connection closes on `terminal`. Disconnect-and-reconnect is supported by replaying from a `Last-Event-ID` header.

**Decision #2 — Event bus is Redis pub/sub keyed by invocation_id, NOT Redis lists.**

Pub/sub means: no buffering of matter content in Redis (decision honours the non-negotiable). Subscribers connect *before* the worker emits; reconnect uses a small in-memory ring buffer (TTL 5 min, capped 200 events per invocation) kept in the **API process**, not Redis. The ring buffer holds only event metadata — never payload content; payload references point back to `audit_entries` rows that the client must re-fetch.

This is a tradeoff: a reconnecting client may miss high-volume `partial_result` events older than the ring buffer. Accepted for Phase 6 — real fidelity comes from the audit table, not the SSE stream.

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

**Decision #5 — Grants checked at execution, re-checked, not snapshot at enqueue.**

A capability enqueued at T₀ that runs at T₅ must re-check the grant exists and the matter is still open. Revocation during the wait window MUST cause the job to fail with `module.capability.blocked{reason:"grant_revoked_post_enqueue"}` rather than execute with stale authority.

This is the load-bearing decision for honouring the supervised-autonomy claim once jobs run async. Phase 6 cannot defer this to Phase 7.

**Decision #6 — No streaming of model tokens from server-paid keys.**

Honours the non-negotiable: *"no server-paid model keys in prod"*. Provider modules that the user has supplied keys for can stream tokens; built-in providers (hosted-eval shipped without server-paid keys) emit a single `terminal` event after the full response is in hand. Phase 6 doesn't change the auth model.

---

## Critical path

```
Step 1: core/event_bus.py — Redis pub/sub publisher + in-memory ring buffer
   ↓
Step 2: core/sse.py — FastAPI SSE response helper
   ↓
Step 3: api/invocations.py — GET /events, POST /cancel
   ↓
Step 4: MCPHost integration — emit events alongside audit rows
   ↓
Step 5: First reference module wired to streaming progress (test fixture)
   ↓
Step 6: workers/capability_runner.py — arq job handler
   ↓
Step 7: enqueue_capability() in core/runtime.py
   ↓
Step 8: Re-check grants + matter status at job dequeue
   ↓
Step 9: Cancellation polling + deadline enforcement
   ↓
Step 10: Tests
   ↓
Step 11: Full sweep green
   ↓
Step 12: HANDOVER_PHASE_6_DONE.md
```

---

## Step 1 — `core/event_bus.py`

**File:** `backend/app/core/event_bus.py` (new)

**Public surface:**
- `publish(invocation_id: uuid, event_type: str, data: dict) -> None`
- `subscribe(invocation_id: uuid) -> AsyncIterator[Event]`
- `Event` dataclass: `event_id: int`, `event_type: str`, `data: dict`, `timestamp: datetime`
- In-memory `_RingBuffer` per-invocation with a TTL sweeper task

Implementation:
- `publish` → Redis pub/sub `PUBLISH invocation:{id} <json>` + write to ring buffer
- `subscribe` opens a Redis pub/sub subscription, plus replays from ring buffer if `Last-Event-ID` was provided
- Sweeper task removes ring-buffer entries > 5 min old; runs every 60 s

~250 LOC.

---

## Step 2 — `core/sse.py`

**File:** `backend/app/core/sse.py` (new)

FastAPI `StreamingResponse` helper with correct headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` for Cloudflare). Heartbeat every 15 s (comment-only event line).

~80 LOC.

---

## Step 3 — `api/invocations.py`

**File:** `backend/app/api/invocations.py` (new)

- `GET /api/invocations/{invocation_id}/events` (SSE)
  - Authorisation: caller must have started the invocation OR have matter access for the invocation's matter.
  - Honours `Last-Event-ID` header.
  - Emits `invocation.events.viewed` audit row on connect.
- `POST /api/invocations/{invocation_id}/cancel`
  - Same authorisation.
  - Sets cancel flag in Redis.
  - Emits `module.capability.cancel_requested` audit row.

~150 LOC.

---

## Step 4 — `MCPHost` integration

**File:** `backend/app/core/mcp_host/host.py` (extend)

`invoke_tool` already emits audit rows. Phase 6 adds a parallel `event_bus.publish` for the four event types (`progress`, `partial_result`, `gate_decision`, `terminal`). The audit row remains the source of truth; events are advisory.

Module authors get a thin `report_progress(percent, message)` helper passed in as part of the invocation context. Built-in helpers cover the most common patterns.

~100 LOC delta.

---

## Step 5 — First reference module wired

**File:** `backend/tests/fixtures/test_streaming_module.py` (new fixture)

A synthetic capability that emits 5 `progress` events + 1 `terminal`. Used by the SSE tests. No real work, just enough for the integration tests to exercise the channel.

~60 LOC.

---

## Step 6 — `workers/capability_runner.py`

**File:** `backend/app/workers/capability_runner.py` (new)

arq job `run_capability_job(ctx, *, invocation_id, module_id, capability_id, args, matter_id, actor_user_id, deadline)`:
- Open fresh DB session from worker context.
- Re-check grant + matter status (Step 8).
- Check cancel flag.
- Dispatch via `MCPHost.invoke_tool(...)`.
- Emit terminal event when done.

~180 LOC.

---

## Step 7 — `enqueue_capability` in `core/runtime.py`

**File:** `backend/app/core/runtime.py` (new or extend)

**Public surface:**
- `enqueue_capability(session, *, invocation_id, module_id, capability_id, args, matter_id, actor_user_id, deadline) -> uuid`

Writes `module.capability.enqueued` audit row + arq job. Returns `invocation_id` so the client can subscribe to events immediately.

~80 LOC.

---

## Step 8 — Re-check at dequeue

**File:** `backend/app/workers/capability_runner.py` (extend Step 6)

Before dispatch:
- `select 1 from workspace_skill_capability_grants where user_id = ? and capability = ? and (granted_permissions_snapshot->>'matter_id' = ? or granted_permissions_snapshot is null);` — must return a row.
- `select status from matters where id = ?;` — must be `open` (or whatever the canonical active states are).
- If either check fails → emit `module.capability.blocked{reason: "grant_revoked_post_enqueue" | "matter_closed_post_enqueue"}` and stop.

~50 LOC.

---

## Step 9 — Cancellation + deadlines

**Files:**
- `backend/app/workers/capability_runner.py` (extend)
- `backend/app/core/runtime.py` (extend)

- Worker polls `invocation:{id}:cancel` flag at the breakpoints documented in Decision #4.
- Worker checks `now > deadline` at the same breakpoints.
- Both → emit `module.capability.cancelled` or `module.capability.deadline_exceeded` and terminate.

~80 LOC.

---

## Step 10 — Tests

- `test_phase6_event_bus.py` (~8 tests) — publish/subscribe round-trip, ring buffer replay, TTL sweeper, multi-subscriber fan-out.
- `test_phase6_sse_api.py` (~10 tests) — connection, heartbeat, Last-Event-ID, authorisation, cancel endpoint.
- `test_phase6_capability_runner.py` (~12 tests) — enqueue, dequeue, grant re-check, matter-closed re-check, deadline, cooperative cancel, audit emission.
- `test_phase6_runtime.py` (~6 tests) — `enqueue_capability` writes the audit row + arq job; rejects when caller lacks grant.

~36 new tests.

Worker tests need an arq fake — use `arq.connections.create_pool` against the compose Redis with a unique queue name per test.

---

## Step 11 — Full sweep

- Phase 6 only: ~36 tests
- Phases 1–6 combined: ~610 tests
- Entire backend stays green.

---

## Step 12 — Handover

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

*End of Phase 6 build plan. Builder commits this together with Phase 5 plan, then waits for Reviewer redline before Step 0 of Phase 5.*
