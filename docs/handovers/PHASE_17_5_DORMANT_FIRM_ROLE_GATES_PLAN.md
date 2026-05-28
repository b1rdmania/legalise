# Phase 17.5 — Dormant Firm Role Gates

**Status:** IMPLEMENTED + live (master d00d3bb, 2026-05-28). Flag LEGALISE_FIRM_ROLE_GATES_ENABLED default false; dormant on prod. CI+e2e green, both deploys succeeded.  
**Branch:** `phase-17-crm-pass`  
**Date:** 2026-05-28  
**Owner intent:** keep the role/governance substrate in the codebase, but do not make the live evaluation product depend on the solicitor / qualified solicitor hierarchy.

## Why This Exists

The substrate now has serious law-firm governance machinery:

- `User.role` values: `solicitor`, `qualified_solicitor`, `workspace_admin`
- posture gate policy: `B_mixed` requires `qualified_solicitor`
- advice-boundary role rules for higher legal-advice tiers
- admin role-management endpoints
- posture banners and e2e expectations that expose this policy in the UI

That is useful for a future firm deployment. It is too much for the current launch/evaluator product.

The current public story should be:

> install signed module -> grant matter-scoped permissions -> run capability -> produce artifact -> reconstruct the trail.

It should **not** be:

> understand our internal solicitor hierarchy before the demo works.

Andy’s instruction is explicit: keep the code, but do not use this hierarchy anywhere live for now, including ordinary signed-in users doing their own work.

## Product Decision

Make firm role gates dormant by default.

That means:

- The role fields and admin role pages remain.
- The posture/advice-boundary primitives remain.
- The audit rows remain truthful.
- The default live/evaluation product does not block normal module use because the user is `solicitor` rather than `qualified_solicitor`.
- The user should not see “only qualified solicitors can run modules” as a normal launch-era product rule.

This is a product-mode decision, not a substrate deletion.

## Recommended Control

Add one explicit backend setting:

```text
LEGALISE_FIRM_ROLE_GATES_ENABLED=false
```

Recommended default: `false` for local demo, hosted demo, and production evaluation.

When a real law-firm deployment needs junior/senior role enforcement, set it to `true` and the existing doctrine becomes active again.

Do not infer this from `ENVIRONMENT`. Make it a named setting so support/debugging is unambiguous.

## Scope

### In Scope

1. Add the firm-role-gate feature flag.
2. Make posture role enforcement dormant when the flag is false.
3. Make advice-boundary role enforcement dormant when the flag is false, if the role check can be reached through any live/default flow.
4. Update frontend posture UX so B_mixed no longer presents a qualified-solicitor blocker in dormant mode.
5. Update specs/docs/tests so the default product does not claim or require solicitor hierarchy enforcement.
6. Preserve enabled-mode tests proving the law-firm policy still works.

### Out of Scope

- Removing `User.role`.
- Removing admin role-management endpoints.
- Removing posture/advice-boundary primitives.
- Mass-updating users to `qualified_solicitor`.
- SRA roll verification.
- Role-request workflows.
- Multi-user law-firm supervision.
- New module capabilities.
- New connector work.
- Redesigning the whole UI.

## Policy Semantics

### Default Mode: `LEGALISE_FIRM_ROLE_GATES_ENABLED=false`

Recommended behavior:

| Matter posture | Behavior |
|---|---|
| `A_cleared` | allow authenticated invocation |
| `B_mixed` | allow authenticated invocation; no qualified-solicitor requirement |
| `C_paused` | still block all invocations |

Rationale: `B_mixed` is where the confusing role hierarchy currently bites. `C_paused` is not junior/senior hierarchy; it means the matter is paused. Keeping it as a hard stop preserves a useful safety control without making users learn firm roles.

Audit should record that the firm role gate was dormant. Suggested `gate_state` addition on any posture/advice decision row where relevant:

```json
{
  "firm_role_gates_enabled": false,
  "policy_mode": "firm_role_gates_dormant"
}
```

Do not fake the actor role as `qualified_solicitor`.

### Firm Mode: `LEGALISE_FIRM_ROLE_GATES_ENABLED=true`

Existing behavior should remain:

| Matter posture | Required role |
|---|---|
| `A_cleared` | any authenticated user |
| `B_mixed` | `qualified_solicitor` |
| `C_paused` | nobody |

The existing important invariant also remains: `is_superuser` / `workspace_admin` does not automatically satisfy `B_mixed`; the actor role must be `qualified_solicitor`.

## Likely Touchpoints

### Backend

Known files / concepts to inspect first:

- `backend/app/core/posture_gate.py`
  - `POSTURE_POLICY`
  - `check_posture`
  - `PostureBlocked`
- `backend/app/core/runtime.py`
  - `InvocationContext.actor_role`
  - HTTP invoke context creation from `User.role`
- `backend/app/core/advice_boundary/tiers.py`
  - role satisfaction and tier transition requirements
- `backend/app/core/advice_boundary/gate.py`
  - transition/role denial emission
- `backend/app/models/user.py`
  - role field
- `backend/app/api/admin_users.py` or equivalent admin role endpoint
- `backend/tests/test_phase8_posture_gate.py`
- `backend/tests/test_phase11_admin_role.py`
- Phase 10/vertical-slice tests that currently promote users to `qualified_solicitor`

Implementation preference:

- Add a small helper near settings/core policy, not duplicated conditionals everywhere.
- Keep enabled-mode behavior close to the existing code path.
- Add mode-specific tests rather than rewriting old tests into weaker assertions.

### Frontend

Known files / concepts to inspect first:

- `frontend/src/matter/PostureBanner.tsx`
  - B_mixed copy currently communicates qualified-solicitor restriction
  - C_paused copy/action should likely stay
- `frontend/src/matter/InvocationRunner.tsx`
  - structured posture-blocked error banner
- `frontend/src/admin/AdminUserDetail.tsx`
  - role management copy can remain but should not imply it is required for evaluator use
- `frontend/e2e/posture.spec.ts`
  - default e2e should no longer prove B_mixed role blocking unless the suite explicitly enables the flag

Frontend default-mode expectations:

- No normal B_mixed banner telling users they need `qualified_solicitor`.
- No disabled Run affordance solely because the user role is `solicitor`.
- If `C_paused`, still show the paused hard-stop banner.
- Admin role pages can remain, but should read like deployment/firm controls rather than mandatory demo setup.

### Docs / Specs

Docs that currently encode the old always-on assumption:

- `docs/spec/POSTURE_GATE_UX.md`
- `docs/spec/ACCEPTANCE.md`
- `docs/spec/PAGE_MAP.md`
- `docs/spec/AUDIT_EMISSION_MAP.md`
- `docs/handovers/HANDOVER_PHASE_8_POSTURE_GATE_DONE.md`
- `docs/handovers/HANDOVER_PHASE_15_PLAYWRIGHT_DONE.md`

Do not rewrite history in old handovers unless it creates current implementation confusion. Prefer adding an explicit “Phase 17.5 product-mode override” note in current specs.

## Test Bar

Backend tests:

1. Default dormant mode:
   - `B_mixed` + `solicitor` allows Contract Review / Pre-Motion invocation.
   - no `posture_gate.check.blocked` row is emitted for B_mixed solely due to role.
   - audit/gate metadata records `firm_role_gates_enabled=false` where a decision row is emitted.
2. Dormant mode still blocks paused matters:
   - `C_paused` blocks even for `qualified_solicitor`.
3. Enabled firm mode:
   - existing `B_mixed` + `solicitor` block behavior remains.
   - `B_mixed` + `qualified_solicitor` allows.
   - `workspace_admin` / `is_superuser` still does not bypass B_mixed unless role is `qualified_solicitor`.
4. Advice-boundary role checks:
   - if reachable in default live flows, add dormant/enabled coverage.

Frontend tests:

1. Default mode:
   - B_mixed matter does not render “Only qualified solicitors can run modules.”
   - Run affordance is not hidden/disabled solely due to `solicitor` role.
2. Paused mode:
   - C_paused still renders a hard-stop banner.
3. Enabled mode, if frontend can be configured in test:
   - old posture-blocking banner remains correct.

E2E:

- Default Playwright should follow the launch product: B_mixed should not require role promotion.
- If enabled-mode browser coverage is expensive, keep it in pytest/vitest and mark e2e as default-product coverage only.

## Reviewer Decisions

1. **Flag name.** Recommended: `LEGALISE_FIRM_ROLE_GATES_ENABLED`.
2. **Default.** Recommended: false everywhere unless explicitly enabled by deployment/test env.
3. **C_paused.** Recommended: remains hard stop in both modes.
4. **Advice boundary.** Recommended: apply the same dormant-mode principle to role-based tier checks if reachable, while keeping tier vocabulary and WORM rows.
5. **Admin role pages.** Recommended: keep them live but make copy clear they are firm/deployment controls, not required for evaluator use.
6. **Audit wording.** Recommended: never pretend role checks ran. Include `policy_mode="firm_role_gates_dormant"` where useful.

## Tripwires

- Do not delete the role substrate.
- Do not silently promote everyone to `qualified_solicitor`.
- Do not make `C_paused` runnable unless Reviewer explicitly changes that decision.
- Do not hide audit truth. Dormant policy mode should be visible in metadata, not erased.
- Do not introduce test-only bypasses.
- Do not expand into signup/waitlist copy, Cloudflare token work, or broader IA polish in this phase.

## Suggested Build Sequence

1. Add setting + helper.
2. Patch backend posture gate with default dormant behavior.
3. Patch advice-boundary role checks if they can affect current product use.
4. Update frontend B_mixed posture UX.
5. Update specs (`POSTURE_GATE_UX`, `ACCEPTANCE`, audit matrix if needed).
6. Update backend/frontend tests.
7. Run:

```bash
cd backend && python -m pytest tests/test_phase8_posture_gate.py tests/test_phase6_vertical_slice.py tests/test_phase9_pre_motion.py
cd frontend && npm run typecheck && npm test && npm run build
```

Then run the full backend/frontend suites if the local stack is available.

## Handover Line

> Phase 17.5 should make firm role gates dormant by default. Keep all role/advice/posture substrate intact, but default live/evaluator behavior must not require `qualified_solicitor` for B_mixed matters. `C_paused` should remain a hard stop unless Reviewer decides otherwise. Add an explicit env flag, mode-specific tests, and update posture UX/specs so the launch product is install -> grant -> run -> artifact -> audit, not role hierarchy onboarding.
