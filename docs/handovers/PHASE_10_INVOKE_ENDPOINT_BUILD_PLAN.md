# Phase 10 Build Plan v2 — HTTP Invoke Endpoint

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `3d0d148` (Phase 9 Pre-Motion follow-up; sweep 636/8)
**Supersedes:** Phase 10 v1 (in this same file, pre-redline).
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

**Decision #4 (v2) — Provider-call wiring goes through an explicit adapter; gateway's shape and module's shape are NOT the same.**

Reviewer Phase 10 v1 P1#1: v1 said "provider_call comes from `model_gateway`" but the shapes don't match.

- `ModelGateway.call()` returns `ModelResult(text, model_used, prompt_hash, response_hash, token_count, latency_ms)`.
- Modules expect `ProviderResponse(text, model_id, provider, tokens_in, tokens_out, cost_micros, currency)` — seven fields, three not in `ModelResult`.

v2 adds an explicit adapter contract:

**`app.core.runtime.ProviderResponse`** — canonical dataclass with the seven fields modules access. Single point of truth; both reference modules import it (same convergence pattern as `InvocationContext`).

**`app.core.runtime.make_provider_call(*, session, matter, actor_user_id, module_id, capability_id) -> Callable[..., Awaitable[ProviderResponse]]`** — returns the bound `provider_call` callable the dispatcher hands to modules. Internally:

1. Calls `model_gateway.call(prompt, system=..., requested_model=matter.default_model_id, actor_id=actor_user_id, matter_id=matter.id, module=module_id)`.
2. Receives `ModelResult` back.
3. Builds `ProviderResponse` mapping:

   | Module field | Gateway source |
   | --- | --- |
   | `text` | `ModelResult.text` |
   | `model_id` | `ModelResult.model_used` |
   | `provider` | resolved from the same provider record the gateway picked (re-exposed via `model_gateway.last_provider_used` or via a small return-tuple extension; see Step 1) |
   | `tokens_in` | `ModelResult.token_count` (until providers report split counts) |
   | `tokens_out` | `0` (placeholder — sentinel "not yet computed", see audit consequence below) |
   | `cost_micros` | `None` (gateway doesn't compute cost yet) |
   | `currency` | `None` (paired with cost_micros per `audit_emit_model_invoked` validation) |

   `tokens_in` carrying the combined `token_count` and `tokens_out=0` is the honest current shape — providers don't yet return split. A future provider-protocol extension lets the adapter split correctly without touching modules. `cost_micros` + `currency` stay `None` paired so the Phase 5 check constraint doesn't fire.

**Audit consequence — dual emission accepted for now.**

The gateway emits `model.call` from inside `ModelGateway.call()` (existing Phase 1 behaviour). Modules emit `model.invoked` via `audit_emit_model_invoked()` (Phase 5 cost-column emission). Both rows land for every Phase 10 invocation.

The duplication is acceptable in Phase 10 because:
- The reconstruction view shows both rows; clients pick whichever they want.
- `model.invoked` is the canonical cost-bearing row (it carries the new columns).
- `model.call` is the older substrate row (it doesn't carry cost columns).

A future cleanup phase can either suppress `model.call` for callers that go through the adapter, OR add a lower-level gateway path that doesn't emit. KISS says don't do that work until a reconstruction-noise complaint arrives. Until then, both rows are tolerated and tested: Phase 10's reconstruction test asserts the canonical `model.invoked` row is present (the row that matters for cost provenance).

The adapter has dedicated tests (`test_phase10_provider_adapter.py`) covering: all seven fields populated, currency/cost pairing, gateway exceptions propagate (see Decision #5 v2 for the HTTP shape).

**Decision #5 (v2) — Exception → HTTP translation, explicit and tested. Provider errors included.**

Reviewer Phase 10 v1 P2: v1 mapped only generic capability exceptions. The first real hosted-eval failures will be `ProviderKeyMissing` or `ProviderUpstreamError` from `app.core.model_gateway`. v1 would have let them fall to a generic 500.

v2 endpoint maps:

| Exception | HTTP | Body shape |
| --- | --- | --- |
| `PostureBlocked` | 403 | `{error: "posture_gate_blocked", posture, required_role, actor_role, reason}` |
| `CapabilityDenied` | 403 | `{error: "capability_denied", plugin, skill, capability, matter_id, scope}` |
| `Phase1Blocked` (advice-boundary, matter_context, etc.) | 403 | `{error: "phase1_blocked", blocked_reason, gate_state}` |
| `CapabilityScopeUnsupported` (from `core/grants_lifecycle.py`, raised at the endpoint's scope-check, see Decision #7) | 422 | `{error: "capability_scope_not_supported_here", capability_id, capability_scope}` — same code Phase 7 `/grants` uses for matter-scope refusal |
| `ProviderKeyMissing` | 422 | `{error: "provider_key_missing", provider, message: "User has not configured an API key for <provider>."}` — same status code other UI-nudge errors use; consistent with existing UX |
| `ProviderUpstreamError` | 502 | `{error: "provider_upstream_error", provider, upstream_status, code}` |
| `ValueError` from capability args | 422 | `{error: "invalid_args", message}` |
| `ManifestNotFoundError` / unknown module / unknown capability_id | 404 | `{error: "module_not_installed"}` or `{error: "capability_not_declared"}` |
| Module installed but `enabled = False` | 409 | `{error: "module_disabled"}` |
| Matter access denied | 404 | uniform 404 (Phase 5/7 pattern — never leak which matters exist) |
| Anything else | 500 | `{error: "internal_error"}` — and the request session rolls back |

`ProviderKeyMissing` was already documented in the model_gateway as "routers translate to 422 with a UI nudge" — v2 honours that contract. `ProviderUpstreamError` becomes 502 (a true upstream gateway failure; the user can retry).

Every translation has a dedicated test in the negative-path battery. A future generalisation is a FastAPI exception-handler registry; KISS says wire them explicitly until at least three more capability types land.

**Decision #7 — Endpoint rejects non-matter-scope and non-invokable capabilities before dispatch.**

Reviewer Phase 10 v1 P1#2: v1 validated only that `capability_id` existed in the manifest. Both Pre-Motion and Contract Review manifests include a `default-provider` capability with `kind="provider"` and `scope="workspace"`. If the endpoint dispatched it, the module's entry class would raise `ValueError("unknown capability: 'default-provider'")` and the API would surface `422 invalid_args` — which masquerades a Phase 7 scope-violation as an args validation error.

v2 endpoint inspects the resolved capability declaration BEFORE dispatch and rejects:

1. **`capability.scope != "matter"`** → HTTP 422 `capability_scope_not_supported_here` (reuses the Phase 7 `/grants` error code; the matter URL never produces non-matter authority).
2. **`capability.kind in {"provider", "gate"}`** → HTTP 422 `capability_kind_not_invokable` (provider capabilities are dispatched internally by the gateway; gates are substrate-internal; neither is for direct user invocation).

The check happens after manifest resolution but before `dispatch_capability(...)` — so the module never sees a non-invokable request. A dedicated regression POSTs `capability_id="default-provider"` and asserts 422 before any dispatch side effect.

Future invokable kinds (`tool`, `workflow` from the v2 vocabulary) stay accepted alongside `skill`.

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

**Public surface (v2):**

```python
@dataclass(frozen=True)
class InvocationContext:
    actor_user_id: uuid.UUID
    actor_role: str
    invocation_id: uuid.UUID


@dataclass(frozen=True)
class ProviderResponse:
    """Canonical shape modules expect from provider_call.

    Promoted from each module's local declaration in Phase 10
    (P1#1 redline) — Contract Review and Pre-Motion had identical
    shapes that the substrate now owns. Modules import from here.
    """

    text: str
    model_id: str
    provider: str
    tokens_in: int | None
    tokens_out: int | None
    cost_micros: int | None  # paired with currency per Phase 5 check
    currency: str | None     # paired with cost_micros per Phase 5 check


def make_provider_call(
    *,
    session: AsyncSession,
    matter: Matter,
    actor_user_id: uuid.UUID,
    module_id: str,
    capability_id: str,
) -> Callable[..., Awaitable[ProviderResponse]]:
    """Build the provider_call callable the dispatcher hands to modules.

    Wraps ``model_gateway.call(...)`` with the seven-field mapping
    documented in Decision #4 v2:
        text          ← ModelResult.text
        model_id      ← ModelResult.model_used
        provider      ← gateway-resolved provider name
        tokens_in     ← ModelResult.token_count
        tokens_out    ← 0 (provider-protocol limitation; future split)
        cost_micros   ← None (gateway doesn't price; provider future)
        currency      ← None (paired with cost_micros)

    Propagates ProviderKeyMissing + ProviderUpstreamError so the
    endpoint can translate per Decision #5 v2.
    """


async def dispatch_capability(
    session: AsyncSession,
    *,
    installed_module: InstalledModule,
    capability_declaration: dict,  # the v2 capability dict from manifest
    matter: Matter,
    context: InvocationContext,
    args: dict[str, Any],
    provider_call,
) -> dict[str, Any]:
    """Resolve the module's entrypoint via importlib, instantiate
    the entry class, and call entry.invoke(...).

    Pre-dispatch checks happen at the endpoint (Decision #7) — the
    dispatcher assumes the scope + kind have been validated.

    Raises:
    - ManifestNotFoundError if the entrypoint can't be imported
    - ValueError if capability_id isn't declared on the entry class
    - Whatever the capability raises (PostureBlocked, CapabilityDenied,
      Phase1Blocked, ValueError, etc.) — the endpoint translates.
    """
```

~140 LOC (up from ~80 to cover the adapter) + **~7 unit tests** (was ~4): entrypoint resolution, missing-entry handling, capability_id validation, args passthrough, adapter populates all seven fields, adapter pairs cost+currency as None correctly, adapter propagates `ProviderKeyMissing` + `ProviderUpstreamError` unchanged.

---

## Step 2 — Reference modules import shared types

**Files:**
- `examples/modules/contract_review/capability.py` — drop local `InvocationContext` dataclass; import `InvocationContext` + `ProviderResponse` from `app.core.runtime`. Drop any local stub response classes that duplicate the seven-field shape (Pre-Motion has `_StubResponse` in its test file, not the capability module; Contract Review uses module-local annotations the same way).
- `examples/modules/pre_motion/capability.py` — same.

The convergence is narrow but real: both modules' identical declarations finally collapse into one substrate-provided source of truth. Phase 9's "zero core edits" claim retroactively becomes "zero core edits except the shared types Phase 10 lifted" — documented in the Phase 10 handover.

Tests update accordingly: `test_phase6_vertical_slice.py` and `test_phase9_pre_motion_vertical_slice.py` import `InvocationContext` from `app.core.runtime`; stub provider responses in tests construct `ProviderResponse` instead of the local dataclass.

~30 LOC delta per module.

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

Endpoint flow (v2):
1. Strict matter-access predicate (`_load_matter_or_404` from Phase 5/7 shape) → 404 on miss
2. Load `InstalledModule` by `module_id` → 404 `module_not_installed`; 409 `module_disabled` if `enabled = False`
3. Find the capability declaration in `installed_module.manifest_snapshot.capabilities[]` → 404 `capability_not_declared` if `capability_id` is unknown
4. **Decision #7 scope check**: reject `capability.scope != "matter"` → 422 `capability_scope_not_supported_here`
5. **Decision #7 kind check**: reject `capability.kind in {"provider", "gate"}` → 422 `capability_kind_not_invokable`
6. Build `provider_call` via `make_provider_call(...)` (Decision #4 v2 adapter)
7. Build `InvocationContext` from the authenticated user + a fresh `invocation_id`
8. Call `dispatch_capability(...)` with the validated declaration
9. Translate any exception per Decision #5 v2 (including `ProviderKeyMissing`, `ProviderUpstreamError`)
10. Commit + return

~220 LOC (up from ~200 to cover the two new pre-dispatch rejections + the provider-error translations).

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

~20 tests on `test_phase10_invocations_api.py`:

- **Happy paths (2):** Contract Review invoke via HTTP succeeds; Pre-Motion invoke via HTTP succeeds (the vertical-slice updates already cover the deep assertions; Phase 10 tests pin endpoint shape + status codes).
- **Auth (3):** non-owner → 404; superuser non-owner → 200 (matches Phase 5/7 shape); unauthenticated → 401.
- **Module/capability resolution (3):** module not installed → 404 `module_not_installed`; module disabled → 409 `module_disabled`; capability_id not in manifest → 404 `capability_not_declared`.
- **Decision #7 scope/kind rejections (2):** `capability_id="default-provider"` (`scope="workspace"`, `kind="provider"`) → 422 `capability_scope_not_supported_here` BEFORE dispatch (no `module.capability.invoked` audit row emitted); same call with a hypothetical `kind="gate"` → 422 `capability_kind_not_invokable`.
- **Error translation (7):** `PostureBlocked` → 403; `CapabilityDenied` → 403; `Phase1Blocked` → 403; `ValueError` from capability args → 422; `ProviderKeyMissing` → 422 `provider_key_missing`; `ProviderUpstreamError` → 502 `provider_upstream_error`; unexpected `RuntimeError` → 500 with rolled-back session.
- **Audit integration (2):** invocation completes → reconstruction view includes `module.capability.invoked` + `model.invoked` + `module.capability.completed` (both `model.call` from the gateway and `model.invoked` from the module land — Phase 10 only asserts the canonical `model.invoked` row carries cost columns); invocation blocked by posture → reconstruction includes `posture_gate.check.blocked` only, no `module.capability.invoked`.
- **Archived matter (1):** archive between install and invoke → 404 uniform.

Plus the ~7 unit tests from Step 1 (extended for the adapter) on `test_phase10_runtime.py` = **~27 tests total** (was ~19; +8 for scope/kind/provider-error coverage).

---

## Step 7 — Full sweep

- Phase 10 only: ~20 endpoint tests + ~7 dispatcher/adapter unit tests = ~27
- Phases 1–10 combined: ~663 tests
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

## Reviewer redlines applied (v2)

Three Phase 10 v1 findings closed before build:

1. **P1 #1 — Provider-call adapter spec'd explicitly.** v1 said "provider_call comes from `model_gateway`" while the gateway returns `ModelResult(text, model_used, prompt_hash, response_hash, token_count, latency_ms)` and modules expect `ProviderResponse(text, model_id, provider, tokens_in, tokens_out, cost_micros, currency)` — three fields missing, three renamed. v2 adds `ProviderResponse` to `app.core.runtime`, adds `make_provider_call(...)` with the seven-field mapping (Decision #4 v2 table), and explicitly accepts the dual `model.call` + `model.invoked` audit emission for now (cleanup deferred until a reconstruction-noise complaint arrives).

2. **P1 #2 — Endpoint rejects non-matter-scope + non-invokable capabilities before dispatch** (Decision #7). v1 validated only `capability_id` existed; both manifests carry `default-provider` with `scope="workspace"` `kind="provider"` which would have masqueraded as `invalid_args` from the module. v2 endpoint inspects the resolved declaration and returns `422 capability_scope_not_supported_here` (Phase 7's existing error code) for non-matter scope, and `422 capability_kind_not_invokable` for provider/gate kinds. Dedicated regression test pins both.

3. **P2 — Provider errors mapped explicitly.** v1 would have let `ProviderKeyMissing` and `ProviderUpstreamError` fall to generic 500. v2 Decision #5's table adds both: `ProviderKeyMissing` → 422 `provider_key_missing` (UI-nudge consistent with existing `audit.model.key_missing` shape); `ProviderUpstreamError` → 502 `provider_upstream_error`. Dedicated tests for each path.

Test count revised: ~19 → ~27 (+8 for the scope/kind/provider-error coverage).

---

*End of HTTP invoke endpoint build plan v2. Builder commits this, then waits for Reviewer ratification before Step 1.*
