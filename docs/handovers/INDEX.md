# Handovers Index

Start here before reading older phase notes.

## Current Truth

- `HANDOVER_V1_PRODUCT_STATE_2026_05_30.md` — current product state and V1
  product rules.
- `KISS_REPO_REVIEW_2026_05_30.md` — current hygiene/KISS cleanup review and
  execution plan.
- `KRAMER_DEMO_COMPREHENSION.md` — what to lift from the Kramer vs Kramer vs AI
  build (shipped at divorce.broker 1 Jun 2026) into Legalise's demo layer, and
  what to leave behind. Demo-comprehension scope only — does not modify the
  locked v2 architecture plan.
- `../IMPLEMENTATION_PLAN_REWRITE_ADDENDUM_2026_06_01.md` — factual
  reconciliation between the v2 plan and master at `c94d0ca`. Pairs with
  `../IMPLEMENTATION_PLAN_REWRITE.md`.
- `KHAN_HEALTH_CHECK.md` — non-destructive pre-flight runbook (`legalise
  doctor`) for Khan demo. Required gate before any Kramer carry-over PR.
- `LEGALISE_IA_RESET_WHITEPAPER_2026_06_02.md` — decision paper for the
  proposed product-model reset: Open Project -> Install Skill -> Chat. Read
  before any frontend IA/navigation rebuild.

## Current Working Rule

Only the most recent `DONE` handover for an active feature should remain easy to
find at the top level. Older phase plans and per-feature handovers are
historical context.

When a consolidated state handover lands:

1. it names the recent handovers it supersedes;
2. older per-feature handovers can move to `docs/handovers/archive/` in a
   mechanical commit;
3. future agents should read this index, then the current state handover, before
   reading historical plans.

## Recent Product Handovers Consolidated By Current State

The current V1 product state handover supersedes these per-feature
handovers, all moved to `archive/` per the rule above:

- `archive/HANDOVER_PROFESSIONAL_SIGNOFF_V1_DONE.md`
- `archive/HANDOVER_EXPORT_GATING_V1_1_DONE.md`
- `archive/HANDOVER_SOURCE_ANCHORS_V1_DONE.md`
- `archive/HANDOVER_CONTRACT_REVIEW_SOURCE_ANCHORS_V1_DONE.md`
- `archive/HANDOVER_MATTER_DESK_UX_PASS_DONE.md`
- `archive/HANDOVER_V1_KISS_COMPRESSION_PASS_DONE.md`
- `archive/HANDOVER_DOCUMENT_INGRESS_MARKETPLACE_V1_DONE.md`
- `archive/HANDOVER_DOCUMENT_WORKSPACE_V1_DONE.md`
- `archive/HANDOVER_ORIGINAL_FILE_RETRIEVAL_V1_DONE.md`
- `archive/HANDOVER_MODULE_STANDALONE_CREATE_V1_DONE.md`
- `archive/HANDOVER_PROMPT_RUNTIME_V1_DONE.md`
- `archive/HANDOVER_EXTERNAL_SKILLS_LOOP_V1_DONE.md`
- `archive/HANDOVER_GUIDED_DEMO_LOOP_V1_DONE.md`
- `archive/HANDOVER_PROVIDER_READINESS_HINT_DONE.md`

Do not treat older wording in those files as more current than the
consolidated state handover.

## Archive Policy

Do not delete historical handovers without a deliberate archive commit. Moving
old handovers is safe only when current docs no longer link to them as active
instructions.

High-signal candidates to keep top-level:

- current product-state handover;
- current KISS/repo review;
- current active build plan, if one exists;
- this index.

Everything else can be archived once links have been checked.
