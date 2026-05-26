# Handover — Phase 8 Done (Posture-Aware Gate)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_8_POSTURE_GATE_BUILD_PLAN.md` (v2.1)
**Sweep:** 623 passed, 8 skipped, 0 failed

---

## Demo sentence (now legitimacy-bearing)

> Install a signed module, grant scoped permissions, run it on a matter, produce an output, reconstruct the trail — **only if the matter's privilege posture allows it for your role**.

Pre-Phase 8 the matter's `privilege_posture` was provenance — recorded in audit rows, captured in Phase 6 reconstruction — but never blocked. A default-role user could run Contract Review on a `B_mixed` matter; the gate was decorative. Phase 8 makes posture policy.

A non-solicitor on `B_mixed` is now blocked before document resolution. The denial is posture-shaped (`posture_gate_failed`), the audit row carries the canonical gate_state, and the artifact never lands.

---

## Deliverables ledger

| Step | Title | Status |
| --- | --- | --- |
| 1 | `core/posture_gate.py` — primitive + policy table + `PostureBlocked` | done |
| 2 | Wired into Contract Review `review_contract` as gate-before-grant | done |
| 3 | 12 tests in `test_phase8_posture_gate.py` | done |
| 4 | Phase 6 vertical slice promotes user to `qualified_solicitor`; R2 tests switch to `A_cleared` for grant/role mechanics | done |
| 5 | Full sweep — 623 / 8 skipped / 0 failed | done |
| 6 | This handover | done |

All in one commit.

---

## Architectural decisions requesting Reviewer ratification

The six decisions from the v2 plan held end-to-end. Re-stating for the record:

### Decision #1 — Posture is a new gate, not a clause in `advice_boundary`

Posture is a matter property; advice tier is an output property. They sit on different axes. `core/posture_gate.py` is its own primitive alongside `core/advice_boundary/`. Cleaner responsibility line, no surprise coupling.

### Decision #2 — Policy table in code, not config

```python
POSTURE_POLICY: dict[str, str] = {
    PRIVILEGE_CLEARED: "any_authenticated",
    PRIVILEGE_MIXED:   "qualified_solicitor",
}
# PRIVILEGE_PAUSED is a hard stop — handled by special case in _evaluate_posture.
```

A change is a reviewable diff, not runtime drift. Unknown postures fail closed (defensive default: future migration adds a posture without extending the table → deny).

### Decision #3 — `actor_role` comes from `InvocationContext` (Phase 6 R2 P1#3 contract)

The module receives `actor_role` from the host; it cannot self-assert solicitor status. This is the same contract Phase 6 already pinned. Phase 8 simply uses it.

### Decision #4 — Audit shape: existing enum + new action, both explicit

- **Action**: `posture_gate.check.blocked` — **deliberate new Phase 8 action** named per the existing primitive convention (`matter_context.write.blocked`, `advice_boundary.check.blocked`, `state_machine.transition.blocked`)
- **`blocked_reason`**: `BlockedReason.GATE_BLOCKED` (existing canonical enum value)
- **`gate_state`**: canonical posture detail dict — `{gate, posture, required_role, actor_role, reason}`

This corrects v1's quiet invention of `module.capability.blocked` (never emitted anywhere) and `posture_gate_failed` as a top-level enum value (would have bifurcated the canonical vocabulary). v2 Reviewer redline closed both.

### Decision #5 — Gate fires BEFORE `require_capability`

Order in `review_contract`:

```
check_posture
  → require_capability(matter.document.read)
  → advice_boundary.check
  → provider call
  → require_capability(matter.artifact.write)
  → write_artifact
```

Reason: posture is the cheapest, most categorical check. A non-solicitor on a `B_mixed` matter should fail with a posture reason, not a missing-grant reason. Putting posture first makes the failure message accurate.

### Decision #6 — No override path in Phase 8

Affirmative consent ("I acknowledge this is privileged") is Phase 9+ if a real caller needs it. Adding it now would bring a new audit shape + acknowledgement table + UI prompt all at once — three things is breadth.

---

## Audit + survive-rollback contract

`check_posture` uses `audit_failure` (independent committed transaction) so the audit row survives the rollback that `PostureBlocked` triggers when it propagates to the HTTP handler. Same pattern Phase 1 `check_or_block` already uses for capability-denied audits.

Tests use the `captured_audit_failures` fixture (same pattern Phase 5 / Phase 6 ceremony-rejection used) because the SAVEPOINT-bound test session can't run an independent commit against an uncommitted user. The capture asserts on the call shape — full survive-rollback behaviour is exercised in production via the existing `audit_failure` mechanism, code-reviewed not test-pinned at this layer.

---

## Phase 6 test updates (Step 4)

The default user role is `"solicitor"`. Khan v Acme seeds with `B_mixed`. Under Phase 8 the existing happy-path tests broke. Two patterns:

**Vertical slice (`test_contract_review_vertical_slice`)** — promotes the test user to `role="qualified_solicitor"` post-register, then runs the real B_mixed Khan workflow. This is the realistic path; demo accounts will need the same promotion until role management exists (per the plan's product implication section).

**R2 grant/role tests** — switched the `_make_matter` helper to `A_cleared` because those tests target grant + role mechanics, not posture. The tests are unchanged in shape; only the underlying matter's posture changed so the posture gate passes and the actual concern fires.

---

## Product implication (carried forward from the plan)

`User.role` defaults to `"solicitor"`. Khan v Acme defaults to `B_mixed`. Until role management ships:

- **Operational handle 1** — vertical-slice + manual demo: seed-time promotion to `"qualified_solicitor"`
- **Operational handle 2** — marketing demos: seed matters with `A_cleared`

The vertical-slice test takes handle 1. The next phase that touches user onboarding should either close the gap (role management UI) OR document this requirement in deployment notes.

---

## New / modified files

```
NEW
  backend/app/core/posture_gate.py
  backend/tests/test_phase8_posture_gate.py
  docs/handovers/HANDOVER_PHASE_8_POSTURE_GATE_DONE.md (this doc)

MODIFIED
  examples/modules/contract_review/capability.py    — check_posture before require_capability
  backend/tests/test_phase6_vertical_slice.py       — user promoted to qualified_solicitor
  backend/tests/test_phase6_r2_fixes.py             — _make_matter uses PRIVILEGE_CLEARED
```

---

## Tests added (12 total)

**Unit (7):** policy table evaluated for every (posture, role) combination — A_cleared+solicitor allowed, B_mixed+qualified_solicitor allowed, B_mixed+solicitor blocked, B_mixed+no-role blocked, C_paused+qualified_solicitor blocked, unknown posture fails closed, policy table shape pinned.

**Integration (5):** Contract Review with each posture × role combination — non-solicitor on B_mixed blocked (no document read, no provider call, no artifact); qualified_solicitor on B_mixed allowed; non-solicitor on A_cleared allowed; qualified_solicitor on C_paused blocked; audit emission carries the canonical gate_state shape with all five keys.

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Phase 8 only — 12 tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase8_posture_gate.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Out of scope at end of Phase 8

Per Andy's KISS rule, still parked:

- Affirmative-consent override ("I acknowledge this is privileged") → Phase 9+ if real
- Role management UI / endpoints → Phase 9+
- Posture transition workflow → matter-management surface, not gate concern
- Per-document posture override → out
- Pre-Motion as second reference module → **next phase**
- Async runtime → still parked
- Connector breadth → still parked
- Frontend → Phase 12
- Sigstore real verification → Phase 11

---

## Hand-off line for Reviewer

> *Phase 8 (posture-aware gate) implemented end-to-end on `runtime-rewrite`. Full sweep green: 623 passed, 8 skipped. Six architectural decisions request ratification — `BlockedReason.GATE_BLOCKED` reused (not invented), `posture_gate.check.blocked` deliberate new action named per existing convention, gate-before-grant for accurate failure messaging, no override path. Two operational handles documented for the demo role gap. Ready for ratification.*

---

*End of Phase 8 handover.*
