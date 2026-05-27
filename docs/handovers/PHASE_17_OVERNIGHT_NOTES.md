# Phase 17 — Overnight Status Notes (2026-05-27)

Compiled while Andy was off-screen. Per the reviewer brief: **no
product-surface work, no redesign**. Everything below is recon or
captured-finding only.

## 1. Walkthrough started — two findings before unblock

The Andy-fallback walkthrough attempt at ~17:23 BST hit blockers
in the first two minutes. Both logged in
`PHASE_17_COLD_WALKTHROUGH.md`:

- **L-1 (P1):** Landing page at `/` has no visible Sign in / Sign
  up affordance. Cold user must guess `/auth/signin`.
- **L-2 (P0 product bug):** Submitting the signup form at
  `/auth/signup` returns `Error · HTTP 404`. Blocks account
  creation. **Not a Phase 17 finding — this is an existing-surface
  regression.** Phase 17 cannot fully complete until the
  walkthrough is runnable.

Screenshot evidence: in the Reviewer chat thread (CleanShot
2026-05-27 17:23).

## 2. CI red on master — substrate regression

`Backend pytest` job failing on master since the Phase 16 merge:

```
FAILED tests/test_phase10_invocations_api.py::test_invoke_posture_block_returns_403
  assert 500 == 403
```

The test expects a 403 (posture block) and gets a 500. Server log
also surfaces `audit_entries is append-only` errors (UPDATE +
DELETE attempts blocked by the WORM trigger — suggests the
500-path is trying to mutate audit rows). Real substrate bug, not
Phase 17 work.

Phase 15 e2e is **still green**. CI is masking this because e2e
runs as a separate workflow.

- Run: 26514572895
- Branch: master @ a364952
- Recommended next-session action: investigate as a P0 substrate
  hotfix before any Phase 17 sub-step build begins. Not addressed
  tonight per the brief.

## 3. Docs link sweep — clean

Ran intra-repo link check across `README.md` + `docs/**/*.md`.
**Zero broken links.** Phase 16 docs (DEMO, TROUBLESHOOTING)
resolve correctly.

## 4. Stale worktrees

Three `worktree-agent-*` directories from old sub-agent runs are
still in the working tree:

```
worktree-agent-a2244fa89422353aa  upload validation
worktree-agent-a52f0d6df69637a5f  provider-key-missing
worktree-agent-ac621250c350397c0  provider upstream errors
```

Pruning needs judgement (are any of these unmerged useful work?)
so left for Andy to decide. `git worktree list` and `git worktree
prune` are the tools.

## 5. Read-only UI inventory — sub-agent running

Spun up an Explore agent to inventory the three target screens
(matter detail, modules page, audit reconstruction). Strict
instructions:

- Read-only, no edits.
- Every section labelled `(context, not spec)`.
- Describes what's there; does not propose redesigns.
- Output: `docs/handovers/PHASE_17_UI_INVENTORY_CONTEXT.md`.

This file will be subordinate to the cold-walkthrough findings.
The walkthrough is still the spec.

## What was deliberately NOT done

- Did not touch the signup 404 bug. Product-surface fix; needs
  Andy's call on priority vs Phase 17.
- Did not touch the CI test failure on master. Substrate hotfix;
  same reason.
- Did not prune stale worktrees. Needs Andy to check for unmerged
  work first.
- Did not start any Phase 17 redesign work. The walkthrough
  artifact does not yet exist as a usable spec.
- Did not create a post-Phase-17 backlog. That needs Andy input.

## Suggested order for next session

1. Decide signup-404 (L-2) priority — fix now (unblocks
   walkthrough) or schedule.
2. Decide posture-block test regression priority — likely
   investigate now since substrate is meant to be stable.
3. Once L-2 is fixed, re-run the walkthrough end-to-end.
4. With the filled walkthrough doc, Reviewer locks 17A/B/C order
   and the redesign sub-steps begin.

Branch state:
- `master` @ `a364952` — Phase 16 closed, CI failing.
- `phase-17-crm-pass` @ `beed150` — Phase 17 plan v3 ratified.
- `runtime-rewrite` @ `a364952` — same as master, can probably
  be deleted next session.
