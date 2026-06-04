# Handovers Index

Start here before reading older phase notes.

## Current Truth

- `HANDOVER_V1_PRODUCT_STATE_2026_05_30.md` — current product state and V1
  product rules.
- `LEGALISE_IA_RESET_BLUEPRINT_2026_06_02.md` — **SOURCE OF TRUTH** for the
  IA reset. Buildable spec with locked vocabulary, visual tokens, ten Mobbin-
  anchored surface patterns (§4A), and a seven-PR sequence with merge gates.
  Build agents cite this; deviations are merge blockers. Read this before
  touching any frontend route, label, or layout.
- `DOCUMENT_ENGINE_PARITY_PLAN_2026_06_04.md` — current document-engine parity
  plan.
- `SIMPLIFY_CUTLIST_2026-06-04.md` — current code/doc simplification cutlist.
- `BACKEND_TODOS.md` and `LAUNCH_ISSUES.md` — active backlog notes.
- `DEPLOYMENT_SECRETS.md`, `PRE_FLIGHT.md`, and `PRODUCTION_SMOKE.md` — live
  ops runbooks.

## Current Working Rule

Only current state, current doctrine, live runbooks, active findings, and the
current active build plan should remain easy to find at the top level. Older
phase plans, superseded build briefs, per-feature `DONE` handovers, and
round-by-round reviewer notes are historical context carried by git history.

When a consolidated state handover lands:

1. it names the recent handovers it supersedes;
2. older per-feature handovers can move to `docs/handovers/archive/` in a
   mechanical commit;
3. future agents should read this index, then the current state handover, before
   reading historical plans.

## Deleted Historical Exhaust

On 2026-06-04, stale handover/build-exhaust files were deleted in the KISS
simplification pass. That included old per-phase plans, superseded `DONE`
handovers, resolved findings, reviewer round notes, and the previous `archive/`
directory. The decision rule is recorded in `SIMPLIFY_CUTLIST_2026-06-04.md`.

Do not treat removed handover wording as active instruction. If historical
detail is needed, use git history for the deleted file.

## Archive Policy

Do not delete historical handovers unless current docs no longer link to them
as active instructions and the deletion commit states the decision rule.

High-signal candidates to keep top-level:

- current product-state handover;
- current KISS/repo review;
- current active build plan, if one exists;
- this index.

Everything else can be archived once links have been checked.
