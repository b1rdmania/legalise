# Phase 8 Build Plan — Posture-Aware Gate

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `33d7f64` (Phase 7 done; sweep 610/8)
**Goal:** Make the matter's `privilege_posture` actively gate capability invocations. Today it's recorded in audit rows but never blocks. Closes the legitimacy gap that turns "modular AI on a matter" into "modular **legal** AI on a matter".

KISS rule (still): every change must make the Contract Review slice more truthful, or enable the next brutal reference module. Phase 8 makes the slice truthful: a non-solicitor running a capability on a mixed-privilege matter must be blocked, not waved through.

---

## Scope (deliberately small)

One new substrate primitive + one wiring change into Contract Review + tests. No new tables. No new endpoints. No new permissions vocabulary.

**In:**
- `core/posture_gate.py` — pure-functional + audit-emitting check
- Contract Review capability calls it before `advice_boundary.check()`
- Audit emission via the existing `module.capability.blocked` shape so reconstruction renders it identically to other denials

**Out (parked, KISS):**
- Affirmative-consent override ("I acknowledge this is privileged") — Phase 9+ if a real use case appears
- Posture transitions / matter status workflow — out of scope
- New posture vocabulary beyond the existing three values
- Frontend prompt about posture — Phase 12

---

## Pre-build findings

The canonical posture vocabulary already exists at `app.models.matter`:

- `A_cleared` — work product cleared for non-solicitor handling
- `B_mixed` — some privileged content present (default for new matters)
- `C_paused` — model calls paused on this matter

The `model_gateway` already has a `MatterPaused` raise on `C_paused`. The posture gate fills the missing middle: `B_mixed` requires a qualified solicitor; `A_cleared` does not.

Today Contract Review's capability stores `gate_state.matter_id` for reconstruction visibility but never reads `matter.privilege_posture`. The posture is provenance, not policy. Phase 8 turns it into policy at the capability boundary.

### Architectural decisions taken pre-code

**Decision #1 — Posture is a new gate, not a clause inside advice_boundary.**

Posture is a matter property; advice tier is an output property. They sit on different axes. Adding posture into `advice_boundary.check()` would conflate them and force every future caller to think about both. A separate primitive keeps the responsibility line clean.

`core/posture_gate.py` exposes a single function:

```python
async def check_posture(
    session,
    *,
    matter,
    actor_user_id,
    actor_role,
    module_id,
    capability_id,
) -> PostureGateResult
```

Returns a small dataclass `{allowed: bool, posture: str, required_role: str, reason: str | None}`. The capability inspects `.allowed` and raises `PostureBlocked` if false. The gate function itself emits the audit row on block; success is just provenance via `module.capability.invoked` (no separate "posture passed" row — that would inflate audit volume for an always-on check).

**Decision #2 — The policy table is small and explicit.**

| Posture | Required role |
| --- | --- |
| `A_cleared` | `any_authenticated` |
| `B_mixed` | `qualified_solicitor` |
| `C_paused` | nobody (always blocks) |

This is the whole policy. It lives in `posture_gate.py` as a constant dict, not in config. A change to the table is a code change with reviewable diff and migration semantics, not a runtime configuration drift.

`PRIVILEGE_PAUSED` ALREADY blocks model calls via the model gateway. The posture gate adds the second layer: paused matters block **any** capability invocation, not just model calls.

**Decision #3 — `actor_role` comes from `InvocationContext`, never from the module.**

Phase 6 R2 P1#3 established the contract: modules cannot self-assert legal authority. The host populates `InvocationContext.actor_role` from `User.role` (server-authoritative); the module passes it through to the posture gate. No new shape — Phase 8 reuses the dataclass Phase 6 already built.

**Decision #4 — Posture denial emits `module.capability.blocked` with `blocked_reason="posture_gate_failed"`.**

Same action name Phase 4 cascade uses for grant-revoked denials and the model gateway uses for paused-matter denials. Reconstruction renders all three identically. The `blocked_reason` field discriminates.

A new dedicated `posture_gate.check.blocked` action would require Reviewer to learn one more vocabulary item; it would also bifurcate the reconstruction view's "what blocked this?" query. KISS says reuse the existing vocabulary.

**Decision #5 — The gate fires BEFORE `require_capability` in the capability body.**

Order: `check_posture` → `require_capability(read)` → `advice_boundary.check` → ... → `require_capability(write)` → `write_artifact`.

Reason: posture is the cheapest, most categorical check. A non-solicitor on a `B_mixed` matter should never get past the doorway — they should fail with a posture reason, not get a 403 about a missing capability grant. Putting posture first makes the failure message accurate.

**Decision #6 — No override path in Phase 8.**

A natural extension would be "non-solicitor can proceed if they explicitly acknowledge the privileged nature". Phase 8 deliberately ships without that. Reasons:

- Adds a new audit shape (`posture.acknowledgement.recorded`).
- Adds a new table for acknowledgements (so the audit is durable provenance, not just a click).
- Adds a UI surface for the acknowledgement prompt.

Three things at once is breadth. Phase 9+ ships override **only** when a real caller needs to bypass — until then, the strict policy is the right default.

---

## Critical path

```
Step 1: core/posture_gate.py — PostureGateResult + check_posture()
   ↓
Step 2: Contract Review capability calls check_posture before
        advice_boundary + require_capability
   ↓
Step 3: Tests — positive solicitor path, negative non-solicitor block,
        C_paused block for everyone, audit shape
   ↓
Step 4: Update Phase 6 vertical-slice + R2 tests so they pass a
        solicitor role (or the test user's actual role) through
   ↓
Step 5: Full sweep green
   ↓
Step 6: HANDOVER_PHASE_8_POSTURE_GATE_DONE.md
```

~3 days at recent cadence; ~10 new tests.

---

## Step 1 — `core/posture_gate.py`

**File:** `backend/app/core/posture_gate.py` (new)

**Public surface:**

```python
@dataclass
class PostureGateResult:
    allowed: bool
    posture: str            # the matter's privilege_posture value
    required_role: str      # role token the policy required
    actor_role: str | None  # what the host actually supplied
    reason: str | None      # blocked_reason on denial; None on pass

POSTURE_POLICY: dict[str, str] = {
    PRIVILEGE_CLEARED: "any_authenticated",
    PRIVILEGE_MIXED:   "qualified_solicitor",
    # PRIVILEGE_PAUSED is special-cased — no role satisfies.
}

class PostureBlocked(Exception):
    """Raised by the capability when check_posture returns allowed=False."""
    def __init__(self, result: PostureGateResult): ...

async def check_posture(
    session,
    *,
    matter,
    actor_user_id,
    actor_role,
    module_id,
    capability_id,
) -> PostureGateResult:
    """Evaluate the matter's posture against the actor's role.

    On block, emits a module.capability.blocked audit row with
    blocked_reason='posture_gate_failed' AND returns the result.
    On pass, emits nothing (capability.invoked covers it).

    The caller raises PostureBlocked(result) if not result.allowed.
    """
```

Reuses the existing `role_satisfies()` from `app.core.advice_boundary.tiers` — already maps role tokens to authority sets. No new role vocabulary.

Audit emission via `audit_phase1` so it shares the canonical shape with everything else the substrate emits.

~120 LOC + ~30 LOC of docstrings.

---

## Step 2 — Wire into Contract Review

**File:** `examples/modules/contract_review/capability.py` (modify)

Adds one call near the top of `review_contract()`:

```python
posture = await check_posture(
    session,
    matter=matter,
    actor_user_id=actor_user_id,
    actor_role=context.actor_role,
    module_id=MODULE_ID,
    capability_id=CAPABILITY_ID,
)
if not posture.allowed:
    raise PostureBlocked(posture)
```

Placement: BEFORE `require_capability(matter.document.read)`. A non-solicitor on a `B_mixed` matter gets a posture-shaped denial, not a grant-shaped one — the audit row says posture, the HTTP 403 says posture.

The capability already takes an `InvocationContext` with `actor_role`. No new parameters.

~15 LOC delta.

---

## Step 3 — Tests

**File:** `backend/tests/test_phase8_posture_gate.py` (new)

~10 tests:

- **Unit tests (5):**
  - `A_cleared` + any role → allowed
  - `B_mixed` + `qualified_solicitor` → allowed
  - `B_mixed` + `solicitor` (default) → blocked with `posture_gate_failed`
  - `B_mixed` + no role → blocked
  - `C_paused` + `qualified_solicitor` → blocked (paused beats role)

- **Integration tests (5):**
  - Contract Review on `B_mixed` matter + non-solicitor caller → `PostureBlocked` raised, no document read, no artifact written, audit row with `posture_gate_failed`
  - Contract Review on `B_mixed` matter + `qualified_solicitor` caller → success path completes (same shape as Phase 6 vertical slice but with elevated role)
  - Contract Review on `A_cleared` matter + non-solicitor caller → success (cleared posture, no special role needed)
  - Contract Review on `C_paused` matter + `qualified_solicitor` caller → blocked
  - Reconstruction view picks up the posture-block audit row under the `audit` source

---

## Step 4 — Update Phase 6 tests

`tests/test_phase6_vertical_slice.py` currently constructs `InvocationContext(actor_role=user.role)` where `user.role` defaults to `"solicitor"`. The new matter Khan v Acme defaults to `B_mixed` — which now requires `qualified_solicitor`.

Two options:
- Update the test to set `User.role = "qualified_solicitor"` post-register
- OR set Khan v Acme's posture to `A_cleared` in the test seed

Option 1 honours the matter's actual posture and keeps the vertical-slice realistic. Option 2 dodges the posture entirely.

Picking option 1. The vertical-slice test now explicitly promotes the user to `qualified_solicitor` before invoking. That's the realistic path — installing Contract Review as a solicitor is the load-bearing scenario.

Same edit applied to `test_phase6_r2_fixes.py` happy paths. Negative paths (missing grant) stay as default role since they don't reach the posture gate.

~20 LOC delta.

---

## Step 5 — Full sweep

- Phase 8 only: ~10 new tests
- Phases 1–8 combined: ~620 tests
- Entire backend stays green.

---

## Step 6 — Handover

`HANDOVER_PHASE_8_POSTURE_GATE_DONE.md` covers:
- Six architectural decisions for Reviewer ratification
- The policy table as the central artifact
- Documented coupling to Phase 6's `InvocationContext` (Phase 6's role-from-host contract is the foundation; without it, posture would be self-asserted)
- Hand-off line for Reviewer

---

## Out of scope (intentional)

Per Andy's KISS rule:

- Affirmative-consent override for non-solicitors → Phase 9+ if real
- Posture transition workflow (cleared ↔ mixed ↔ paused) → matter-management surface, not gate concern
- Per-document posture override (parts of a mixed matter cleared) → out
- Frontend prompt → Phase 12
- Pre-Motion as second module → Phase 9 (the immediate next phase)
- Async runtime → still parked
- Cross-user grants → still parked

If anything new tries to creep in during build, push back. The posture gate is one block check + one policy table. Anything bigger is breadth.

---

*End of Phase 8 build plan. Builder commits this, then waits for Reviewer redline before Step 1.*
