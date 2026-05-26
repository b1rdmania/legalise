# Phase 10 Build Plan — HTTP Invoke Endpoint

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `3d0d148` (Phase 9 Pre-Motion follow-up; sweep 636/8)
**Goal:** Close the last gap in the user-facing flow. Today the demo sentence
> install → grant → **run** → reconstruct

is true via HTTP for every step **except `run`**. Invocation happens by importing the capability function directly in tests. Real users can't drive the substrate from a UI. Phase 10 ships `POST /api/matters/{slug}/invocations` and updates both vertical-slice tests to walk it.

After Phase 10: every step in the load-bearing demo is a real curl-able HTTP call.

---

## Why this is the right next phase

Andy's roadmap after Phase 9 was: *"only then consider async."* Considering it: not yet. The reference modules return in seconds. Sync HTTP works. Async stays parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md` until a real long-running capability genuinely hurts.

The bigger value is the HTTP invoke endpoint. Without it:
- Vertical-slice tests use `from examples.modules.foo.capability import bar` — a Python-call cheat that hides the dispatch surface
- A frontend (Phase 12) has nowhere to POST
- The Reviewer can't see "install + grant + run + reconstruct" via a single curl story
- The substrate-reusability claim Phase 9 made is partial — the dispatch path hasn't been exercised end-to-end via HTTP

Phase 10 closes this with a small surface: one endpoint, one dispatcher, one host-provided `InvocationContext` type, two test-fixture updates.

---

## Scope (deliberately small)

**In:**
- `core/runtime.py` — canonical `InvocationContext` + `dispatch_capability()`
- `api/invocations.py` — `POST /api/matters/{slug}/invocations` (sync)
- Both reference modules updated to import `InvocationContext` from substrate (minor module-author edit)
- Provider-call wiring: matter's `default_model_id` → `model_gateway`
- Exception → HTTP translation (`PostureBlocked` → 403, `CapabilityDenied` → 403, `ValueError` → 422, etc.)
- Phase 6 + Phase 9 vertical-slice tests walk via HTTP instead of direct call
- Tests: ~15 new (happy + 8 negative paths + error-translation matrix)

**Out (parked, KISS):**
- Async / job queue / streaming / cancellation — still parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`
- Hot-reload — modules require restart after install
- Inline module install (one HTTP shot that combines install+grant+invoke) — three endpoints stay distinct
- Multi-invocation batching — one invocation per call
- Result polling — sync only
- Webhooks — out
- Frontend wizard — Phase 12

---

## Pre-build findings

- Both reference modules declare an `entrypoint.python_module` + `entrypoint.entry` class. Phase 10's dispatcher resolves these via `importlib`.
- Both modules' entry classes (`ContractReviewModule`, `PreMotionModule`) already accept a `context` kwarg — they're shaped for host dispatch already.
- The `model_gateway` from `app.core.api` is the canonical model surface. The endpoint resolves provider_call from `matter.default_model_id` via this gateway.
- The matter-access predicate from Phase 5 reconstruction + Phase 7 grants (`_load_matter_or_404` shape) is the auth gate this endpoint reuses.
- The `InstalledModule` table holds `manifest_snapshot` which already carries the capability declarations; the dispatcher reads it to find the right capability before invoking.
- Audit events emit from inside the capability. The endpoint adds nothing to the emission story; reconstruction renders the full timeline naturally.

### Architectural decisions taken pre-code

**Decision #1 — Sync HTTP, no async surface.**

Phase 10 ships a synchronous endpoint. The capability runs in-process during the request. Per Andy's KISS rule + the unchanged "no real long-running capability" condition, async stays parked. If a future module's invocation exceeds the request-timeout budget, that's the trigger to unpark `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md` — not now.

**Decision #2 — Canonical `InvocationContext` lives in substrate, not in modules.**

Today both Contract Review and Pre-Motion declare identical `InvocationContext` dataclasses inside their own `capability.py`. That's quiet duplication; the second module already proved the shape is universal. Phase 10 lifts it to `app.core.runtime.InvocationContext`. Both reference modules import from there.

This is a deliberate, narrow substrate touch — the type was implicitly canonical already, and a host that builds the context (Phase 10's whole job) needs a shared declaration to construct it. Reference modules drop their local declarations and import from substrate.

**Decision #3 — Dispatcher uses `importlib` + the manifest's `entrypoint`.**

The dispatcher in `core/runtime.py` resolves the entrypoint via `importlib.import_module(manifest.entrypoint.python_module)` + `getattr(module, manifest.entrypoint.entry)`. It instantiates the entry class (parameterless constructor by convention) and calls `await entry.invoke(capability_id, ...)`.

No registry. No module hot-reload. The dispatcher is stateless — it loads the module fresh each invocation. Python's import cache makes this near-free; module instances are typically immutable surface.

**Decision #4 — Provider-call wiring is opaque to modules.**

The endpoint resolves `provider_call` from the matter's `default_model_id` via `app.core.api.model_gateway`. Modules receive `provider_call` as a parameter — they never know which provider is wired. This mirrors the test seam Contract Review + Pre-Motion already use; tests stay identical, production just calls the gateway.

**Decision #5 — Exception → HTTP translation, explicit and tested.**

The endpoint maps:

| Exception | HTTP | Body shape |
| --- | --- | --- |
| `PostureBlocked` | 403 | `{error: "posture_gate_blocked", posture, required_role, actor_role, reason}` |
| `CapabilityDenied` | 403 | `{error: "capability_denied", plugin, skill, capability}` |
| `ValueError` from capability | 422 | `{error: "invalid_args", message}` |
| `Phase1Blocked` (advice-boundary, etc) | 403 | `{error: "phase1_blocked", blocked_reason, gate_state}` |
| `ManifestNotFoundError` / unknown capability | 404 | `{error: "capability_not_found"}` |
| Anything else | 500 | `{error: "internal_error"}` — and the request session rolls back |

Every translation has a dedicated test in the negative-path battery. A future generalisation would be a FastAPI exception-handler registry; KISS says wire them explicitly until at least three more capability types land.

**Decision #6 — Audit emission stays inside the capability.**

The endpoint does NOT emit `module.capability.invoked` or `module.capability.completed`. Those land from inside the capability body via `audit_phase1`, exactly as they do today. The endpoint adds one row only — `module.invocation.viewed` is NOT a thing (that would be the reconstruction endpoint, not invocation). Invocation provenance lives entirely in the capability's existing audit chain.

This keeps the endpoint thin and the audit responsibility with the producer.

---

## Critical path

```
Step 1: core/runtime.py — InvocationContext + dispatch_capability()
   ↓
Step 2: Both reference modules import InvocationContext from substrate
        (drop their local dataclass declarations)
   ↓
Step 3: api/invocations.py — POST /api/matters/{slug}/invocations
        + exception → HTTP translation
   ↓
Step 4: main.py registers the router
   ↓
Step 5: Update Phase 6 + Phase 9 vertical-slice tests to walk
        via the HTTP endpoint instead of importing the capability
   ↓
Step 6: Tests — ~15 new (happy + 8 negative + the translation
        matrix)
   ↓
Step 7: Full sweep green
   ↓
Step 8: HANDOVER_PHASE_10_INVOKE_ENDPOINT_DONE.md
```

~5 days at recent cadence.

---

## Step 1 — `core/runtime.py`

**File:** `backend/app/core/runtime.py` (new)

**Public surface:**

```python
@dataclass(frozen=True)
class InvocationContext:
    actor_user_id: uuid.UUID
    actor_role: str
    invocation_id: uuid.UUID


async def dispatch_capability(
    session: AsyncSession,
    *,
    installed_module: InstalledModule,
    capability_id: str,
    matter: Matter,
    context: InvocationContext,
    args: dict[str, Any],
    provider_call,
) -> dict[str, Any]:
    """Resolve the module's entrypoint via importlib, instantiate
    the entry class, and call entry.invoke(...).

    Raises:
    - ManifestNotFoundError if the entrypoint can't be imported
    - ValueError if capability_id isn't declared in the manifest
    - Whatever the capability raises (PostureBlocked, CapabilityDenied,
      Phase1Blocked, ValueError, etc) — the endpoint layer translates.
    """
```

~80 LOC + ~4 unit tests pinning: entrypoint resolution, missing-entry handling, capability_id validation, args passthrough.

---

## Step 2 — Reference modules import shared `InvocationContext`

**Files:**
- `examples/modules/contract_review/capability.py` — drop local `@dataclass InvocationContext`, import from `app.core.runtime`
- `examples/modules/pre_motion/capability.py` — same

This is a deliberate, narrow module-author edit. It eliminates duplication that should never have shipped (the type was identical between the two). Phase 9's "zero core edits" claim retroactively becomes "zero core edits except the shared type Phase 10 then lifted" — documented in the Phase 10 handover.

~20 LOC delta per module.

---

## Step 3 — `api/invocations.py`

**File:** `backend/app/api/invocations.py` (new)

Single endpoint:

```python
POST /api/matters/{slug}/invocations

Body:
{
  "module_id": "examples.contract-review",
  "capability_id": "review",
  "args": {"document_id": "<uuid>"}
}

Response (sync, 200):
{
  "invocation_id": "<uuid>",
  "module_id": "examples.contract-review",
  "capability_id": "review",
  "matter_id": "<uuid>",
  "result": { ... module-returned dict ... }
}
```

Endpoint flow:
1. Strict matter-access predicate (`_load_matter_or_404` from Phase 5/7 shape)
2. Load `InstalledModule` by `module_id`; 404 if not installed, 409 if disabled
3. Validate `capability_id` exists in the manifest; 404 if not
4. Resolve `provider_call` from `matter.default_model_id` via `model_gateway`
5. Build `InvocationContext` from the authenticated user + a fresh `invocation_id`
6. Call `dispatch_capability(...)`
7. Translate any exception per Decision #5
8. Commit + return

~200 LOC.

---

## Step 4 — Wire into main.py

One line:

```python
app.include_router(invocations_router, prefix="/api/matters", tags=["invocations"])
```

Registered AFTER the broad matters router, same rule as Phase 5 audit + Phase 7 grants.

~5 LOC.

---

## Step 5 — Vertical-slice tests walk via HTTP

**Files:**
- `backend/tests/test_phase6_vertical_slice.py` — replace the `from examples.modules.contract_review.capability import review_contract` block with `POST /api/matters/{slug}/invocations`
- `backend/tests/test_phase9_pre_motion_vertical_slice.py` — same, for Pre-Motion

The Pre-Motion happy-path test's monkey-patched provider becomes a `monkeypatch` of `app.core.api.model_gateway` (or wherever the endpoint resolves provider_call). Test seam is at the gateway boundary, not the capability boundary.

After this update, neither vertical-slice test directly imports a capability function. They drive the substrate via HTTP end-to-end. The substrate-reusability claim becomes empirically tighter.

~80 LOC delta across the two files.

---

## Step 6 — Tests

**File:** `backend/tests/test_phase10_invocations_api.py` (new)

~15 tests:

- **Happy paths (2):** Contract Review invoke via HTTP succeeds; Pre-Motion invoke via HTTP succeeds (the vertical-slice updates already cover the deep assertions; Phase 10 tests pin endpoint shape + status codes)
- **Auth (3):** non-owner → 404; superuser non-owner → 200 (matches Phase 5/7 shape); unauthenticated → 401
- **Module/capability resolution (3):** module not installed → 404; module disabled → 409; capability_id not in manifest → 404
- **Error translation (5):** `PostureBlocked` → 403 with posture body shape; `CapabilityDenied` → 403 with capability body shape; `ValueError` from capability → 422; archived matter → 404; unexpected exception (e.g. provider raises RuntimeError) → 500 with rolled-back session
- **Audit integration (2):** invocation completes → reconstruction view includes `module.capability.invoked` + `model.invoked` + `module.capability.completed`; invocation blocked by posture → reconstruction includes `posture_gate.check.blocked` only

Plus the ~4 unit tests from Step 1 = **~19 tests total**.

---

## Step 7 — Full sweep

- Phase 10 only: ~15 new tests + ~4 Step-1 unit tests
- Phases 1–10 combined: ~655 tests
- Entire backend stays green.

---

## Step 8 — Handover

`HANDOVER_PHASE_10_INVOKE_ENDPOINT_DONE.md` covers:
- Six architectural decisions for Reviewer ratification
- Note: Step 2's reference-module edits are documented as a deliberate, narrow substrate convergence — first edits to reference modules since Phase 9's "zero substrate touches" claim
- The new demo-sentence-via-HTTP-only: every step is a curl now
- Hand-off line for Reviewer

---

## Out of scope (intentional)

- Async runtime — still parked
- Job queue / cancellation / streaming — still parked
- Hot-reload — still parked
- Inline module install (combined install+grant+invoke) — three endpoints stay distinct
- Multi-invocation batch — out
- Result polling — sync only
- Webhooks — out
- Frontend wizard — Phase 12
- Sigstore real verification — Phase 11
- Per-jurisdiction templates — out
- Role management endpoints — out (separate small phase if demo accounts need it)
- Affirmative-consent posture override — still parked at the Phase 8 boundary

If anything in this list creeps in during build, push back. Phase 10 is one endpoint + one dispatcher + the test plumbing to use them.

---

*End of HTTP invoke endpoint build plan. Builder commits this, then waits for Reviewer redline before Step 1.*
