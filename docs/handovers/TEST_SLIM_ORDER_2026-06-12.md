# Work order: slim the backend test suite

Date: 2026-06-12. Owner: Andy. Executor: rebuild agents.
Baseline: master `7a683fd`. Backend tests today: 113 files, 28,885 lines.
Target: ~20k lines with *better* protection of what actually ships, not less.

## Why

The suite is thickest where the product is oldest and thinnest where it is
shown. ~7k lines still reference modules cut in `70b235c` (pre_motion,
contract_review, letters, tabular_review, case_law). ~1.3k lines test
primitives whose enforcement status is unclear (state machine, advice
boundary). Meanwhile the golden loop — chat → tool call → skill run →
sign-off, the flow on the landing page — has no dedicated test file and no
e2e. This order reallocates: build the safety net first, then prune under it.

## Ground rules (read before touching anything)

1. **Never weaken governance coverage.** Tests for posture gate, audit
   completeness, ACL sweep, grants, sign-off, encryption, capability
   enforcement are the product. They may be *reorganised*, never thinned.
2. **Classify before deleting.** A test referencing `pre_motion` may be
   exercising the plugin bridge against `examples/modules/pre_motion/` —
   that is live coverage of the plugin runtime, not dead code. The question
   for every candidate is: *what app code path does this exercise today?*
   If the answer is a real path in `backend/app/`, it stays (possibly
   renamed). If the answer is "a module that no longer exists except as
   fixture vocabulary," it goes.
3. **One PR per phase below.** Each PR must show the line-count delta and a
   green run of the full suite. No combined mega-PR.
4. **Check the CI shard boundary** (`.github/workflows/ci.yml` — the shard
   split hard-codes a test filename). Any phase that deletes or renames
   files must confirm sharding still balances, or fix the split to be
   computed from the file list.
5. Update `docs/` references in the same PR if a deleted test file is named
   anywhere (TESTING docs, handovers INDEX is historical — leave it).

## Phase 0 — Safety net first (do before any deletion)

* Write `frontend/e2e/golden-loop.spec.ts`: signup → seeded Khan matter →
  chat is default surface → deterministic summary prompt (stub-echo model)
  → output row renders → Sources pane lists the cited document → sign-off →
  Activity shows `output.signed` with `signer_is_author: true`. Reuse the
  `first-run.spec.ts` scaffolding. Add `data-testid` where needed in the
  same PR (test plumbing only, no UI change).
* Extract the assistant cases from `test_smoke_evals.py` into a dedicated
  `backend/tests/test_assistant_pipeline.py`; add the three missing
  branches: parse-failure fallback, tool-error path, empty tool registry.
* Acceptance: both files gate CI; killing the sign-off route makes the e2e
  fail.

## Phase 1 — Classify the cut-module references

For each file below, label every test function A (exercises live app code —
keep), B (exercises the plugin bridge via examples/ — keep, rename to say
so), or C (exercises deleted built-ins or exists only to feed them fixtures
— delete). Produce the classification table in the PR description.

Files, by reference density:

| File | Lines | Refs |
|---|---|---|
| test_smoke_evals.py | 1,350 | 13 |
| test_phase10_invocations_api.py | 728 | 13 |
| test_phase7_grants_api.py | 624 | 13 |
| test_provider_audit_completeness.py | 414 | 8 |
| test_phase8_posture_gate.py | 519 | 7 |
| test_phase6_r2_fixes.py | 593 | 6 |
| test_phase13b_audit_gap_fill.py | 533 | 5 |
| test_phase11_admin_role.py | 405 | 4 |
| test_phase6_vertical_slice.py | 392 | 3 |
| test_declared_capabilities_resolver.py | 200 | 3 |
| test_phase10_runtime.py | 461 | 2 |
| test_export.py | 416 | 1 |
| test_observability.py, test_module_validate_endpoint.py, test_audit_module_kwarg.py, test_source_anchors.py | <300 ea | 1 ea |

Expectation: posture gate / grants / audit files are mostly A-B (keep);
smoke_evals and the phase6/phase10 files carry most of the C weight.

## Phase 2 — Resolve the dormant primitives

* `test_phase1_state_machine.py` (712) and `test_phase1_advice_boundary.py`
  (612): first **verify enforcement status in current code** — note that
  `core/prompt_runtime.py` and `core/posture_gate.py` now reference
  advice_boundary, so the June 10 "declared, not enforced" finding may be
  stale for it.
* If enforced: keep, rename to `test_advice_boundary.py` etc., trim to the
  enforced surface.
* If still dormant: move the file to `backend/tests/dormant/` excluded from
  CI collection, with a header comment naming the feature flag / roadmap
  item that revives it. Do not delete — these are spec-by-test for v0.2.

## Phase 3 — Kill phase-name duplication

46 of 113 files are named `test_phaseN_*`. Rename survivors to
module-based names (`test_posture_gate.py`, `test_grants_api.py`,
`test_invocations_api.py`, …), merging where two phase files test the same
module. While merging, delete duplicate assertions — the same behaviour
re-tested across phases is the main source of bloat. Rule of thumb during
merge: a behaviour earns one test per distinct failure mode, not one per
phase it was touched in.

Add a short `backend/tests/README.md` mapping module → test file, so the
next agent can see coverage at a glance.

## Phase 4 — Lock it in

* Add `pytest --cov` with the report published as a CI artifact (audit item
  C2) so the reallocation is visible, not asserted.
* Post a before/after table in the final PR: files, lines, runtime of the
  suite, coverage of `backend/app/core/` and `backend/app/modules/`.

## Acceptance for the whole order

1. Golden-loop e2e and assistant pipeline tests exist and gate CI.
2. No test references a module that exists neither in `backend/app/` nor in
   `examples/` — grep proof in the final PR.
3. Governance coverage (posture, audit, ACL, grants, sign-off, encryption)
   line count is >= today's. Everything else may shrink.
4. Suite total around 20k lines; full run no slower than today.
5. CI green on every intermediate PR — never land a red step.
