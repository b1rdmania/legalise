# Handover — Phase 10 Done (HTTP Invoke Endpoint)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_10_INVOKE_ENDPOINT_BUILD_PLAN.md` (v3)
**Sweep:** 659 passed, 8 skipped, 0 failed

---

## The demo sentence is now true through HTTP only

Pre-Phase 10:
> install → grant → **run (Python import)** → reconstruct

Post-Phase 10:
> install (HTTP) → grant (HTTP) → **run (HTTP)** → reconstruct (HTTP)

Every step is curl-able. The Phase 6 and Phase 9 vertical-slice tests no longer import capability functions; they POST to `/api/matters/{slug}/invocations`.

---

## Deliverables ledger

| Step | Title | Status |
| --- | --- | --- |
| 1 | `core/runtime.py` — `InvocationContext` + `ProviderResponse` + `make_provider_call` + `dispatch_capability` | done |
| 2 | Reference modules import shared types from substrate | done |
| 3 | `api/invocations.py` — `POST /api/matters/{slug}/invocations` with full exception translation | done |
| 4 | `main.py` registers the router | done |
| 5 | Phase 6 + Phase 9 vertical slices walk via HTTP | done |
| 6 | 10 dispatcher/adapter unit tests + 13 endpoint tests = 23 new | done |
| 7 | Full sweep — 659 / 8 / 0 | done |
| 8 | This handover | done |

---

## Architectural decisions ratified

The seven decisions from the v3 plan held end-to-end. Restating the load-bearing four:

### Decision #1 — Sync HTTP, no async surface

Phase 10 ships a synchronous endpoint. Capability runs in-process. Async stays parked at `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`. If a future capability exceeds the request-timeout budget, that's the trigger to unpark — not now.

### Decision #2 — Shared `InvocationContext` + `ProviderResponse` in substrate

Contract Review and Pre-Motion declared identical local dataclasses; Phase 10 lifts both to `app.core.runtime`. Each reference module drops its local declaration and imports from substrate. First time substrate has been deliberately edited since Phase 8 — the handover names it explicitly so the Phase 9 "zero substrate edits" claim retroactively becomes "zero substrate edits except the shared types Phase 10 lifted".

### Decision #4 v3 — Provider-call adapter pinned to the real gateway contract

`make_provider_call(...)` calls `model_gateway.call(...)` with the exact kwargs the gateway accepts (`model=`, `caller_module=`, `payload=`). v1 and v2 of the plan had hallucinated names; v3 verified against `backend/app/core/model_gateway.py:320` before write.

**`ModelResult` → `ProviderResponse` field mapping:**

| `ProviderResponse` | Source | Notes |
| --- | --- | --- |
| `text` | `result.text` | direct |
| `model_id` | `matter.default_model_id` | the requested model, not the provider's internal name |
| `provider` | `result.model_used` | gateway sets this to `provider.name` |
| `tokens_in` | `result.token_count` | combined count until protocol splits |
| `tokens_out` | `0` | sentinel — keeps audit `token_count = tokens_in + tokens_out` honest |
| `cost_micros` | `None` | gateway doesn't price |
| `currency` | `None` | paired with `cost_micros` per Phase 5 check |

**Audit-emission consequence:** the gateway emits its own `model.call` audit row from inside `ModelGateway.call()`; the capability also emits `model.invoked` via `audit_emit_model_invoked`. Both rows land per invocation under the adapter path. Cleanup of the dual emission is deferred until a reconstruction-noise complaint arrives.

**Legacy footgun closed.** At `model_gateway.py:364–378` the gateway runs a workspace-scope `require_capability("model.invoke", ...)` check whenever `payload` contains both `plugin` AND `skill` keys. The adapter's payload is restricted to `capability_id` + `invocation_id` only — guaranteed never to trip the legacy check. A dedicated test (`test_adapter_payload_does_not_trip_legacy_model_invoke_check`) asserts the captured payload's exact shape.

### Decision #5 v2 — Exception → HTTP translation, explicit

| Exception | HTTP | Notes |
| --- | --- | --- |
| `PostureBlocked` | 403 | `posture_gate_blocked` body |
| `CapabilityDenied` | 403 | `capability_denied` body |
| `Phase1Blocked` | 403 | `phase1_blocked` body (reads `exc.payload.blocked_reason` + `exc.payload.gate_state`) |
| `CapabilityScopeUnsupported` | 422 | defence-in-depth — endpoint pre-filters scope=matter, but the module may re-raise |
| `ProviderKeyMissing` | 422 | `provider_key_missing` (UI-nudge consistent with the gateway's documented contract) |
| `ProviderUpstreamError` | 502 | `provider_upstream_error` |
| `CapabilityNotDeclared` | 404 | `capability_not_declared` |
| `EntrypointResolutionError` | 500 | install-side data problem |
| `ValueError` | 422 | `invalid_args` |
| Anything else | 500 | request session rolls back |

### Decision #7 — Scope + kind rejection BEFORE dispatch

Endpoint inspects the resolved capability declaration before `dispatch_capability(...)`:
- `capability.scope != "matter"` → 422 `capability_scope_not_supported_here`
- `capability.kind not in {"skill", "tool", "workflow"}` → 422 `capability_kind_not_invokable`

Two dedicated regression tests:
- POST `default-provider` (`scope="workspace"`, `kind="provider"`) → 422 + NO `module.capability.invoked` audit row emitted
- A synthesised `kind="provider"` capability with `scope="matter"` → 422 `capability_kind_not_invokable`

---

## New / modified files

```
NEW
  backend/app/core/runtime.py
  backend/app/api/invocations.py
  backend/tests/test_phase10_runtime.py
  backend/tests/test_phase10_invocations_api.py
  docs/handovers/HANDOVER_PHASE_10_INVOKE_ENDPOINT_DONE.md (this doc)

MODIFIED
  backend/app/main.py                              — register invocations_router
  examples/modules/contract_review/capability.py   — import shared types from substrate
  examples/modules/pre_motion/capability.py        — same
  backend/tests/test_phase6_vertical_slice.py      — direct call → POST /invocations + gateway monkeypatch
  backend/tests/test_phase9_pre_motion_vertical_slice.py — same
```

---

## Tests added (23 total)

### Runtime unit tests (10)
- `_find_capability_declaration` happy + miss
- Dispatch resolves entrypoint
- Dispatch raises `EntrypointResolutionError` on missing `python_module`
- Dispatch raises `EntrypointResolutionError` on missing entry attribute
- Adapter populates all seven `ProviderResponse` fields
- Adapter passes correct gateway kwargs (`model=`, `caller_module=`, `payload=`)
- Adapter does NOT trip the legacy workspace-scope `model.invoke` check (the load-bearing v3 regression)
- Adapter propagates `ProviderKeyMissing`
- Adapter propagates `ProviderUpstreamError`

### Endpoint tests (13)
- Auth: non-owner → 404
- Archived matter → 404
- Module not installed → 404
- Module disabled → 409
- Unknown capability → 404
- Decision #7 scope rejection (workspace-scope capability) → 422 + no audit
- Decision #7 kind rejection (provider-kind matter-scope capability) → 422
- Posture block → 403 `posture_gate_blocked`
- Missing grant → 403 `capability_denied`
- Invalid args → 422 `invalid_args`
- `ProviderKeyMissing` → 422 `provider_key_missing`
- `ProviderUpstreamError` → 502 `provider_upstream_error`
- Happy path reconstruction shows canonical event chain

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Phase 10 only — 23 tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest \
    tests/test_phase10_runtime.py \
    tests/test_phase10_invocations_api.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Out of scope at end of Phase 10

Still parked per Andy's KISS rule:

- Async runtime / job queue / streaming → `PHASE_7_ASYNC_RUNTIME_PLAN_PARKED.md`
- Hot-reload (modules need restart after install)
- Inline install+grant+invoke combined endpoint
- Multi-invocation batch / result polling / webhooks
- Frontend wizard → Phase 12
- Sigstore real verification → Phase 11
- Role management endpoints
- Affirmative-consent posture override
- `model.call` vs `model.invoked` audit-row deduplication (deferred until a reconstruction-noise complaint arrives)
- Provider protocol that returns split `tokens_in` + `tokens_out` (the sentinel `tokens_out=0` mapping is honest until then)
- Pricing surface on `model_gateway` (cost_micros + currency stay None per call)

---

## Hand-off line for Reviewer

> *Phase 10 (HTTP invoke endpoint) implemented end-to-end on `runtime-rewrite`. Full sweep green: 659 passed, 8 skipped. Seven architectural decisions request ratification. The adapter is pinned to the real `ModelGateway.call` signature; the legacy workspace-scope `model.invoke` footgun is closed; Decision #7 rejects non-matter-scope + non-invokable capabilities BEFORE dispatch with no side effect. The Phase 6 + Phase 9 vertical slices walk through real HTTP between auth and invoke; no test imports a capability function directly. Ready for ratification.*

---

*End of Phase 10 handover.*
