# Work order: remaining fluff — cut, split, or demote

Date: 2026-06-12. Owner: Andy. Executor: rebuild agents.
Baseline: master `7a683fd`. Companion to `TEST_SLIM_ORDER_2026-06-12.md`
(run that order's Phase 0 safety net before Phase C here, if not already
landed). Source findings: `legalise-audit-2026-06-10.md` (Andy's home dir)
— items QW3, M2.1, M2.3 referenced below are specced there in detail.

## Why

The rebuild has tightened the middle of the codebase (matters.py 1,159→893,
DocumentDetail 3,300→2,121, api.ts 2,855→2,118). What remains is
concentrated and known: one strategic lump (the editor stack), two god
files with splits already sketched, one dead dependency, one dormant
engine in core/, and two heavyweight optionals. This order finishes the
job without re-litigating the audit.

## Ground rules

1. One PR per phase. Line-count delta and green CI in every PR description.
2. Splits are mechanical and behavior-preserving — no API changes, no
   renames visible to callers, compiler/test-led throughout.
3. Anything demoted out of the platform follows the `70b235c` pattern:
   code moves to `examples/` with its manifest, docs updated in the same
   PR, tests reclassified per TEST_SLIM_ORDER Phase 1 rules.
4. Phase A blocks Phase C-editor only. Everything else can proceed in
   parallel.

## Phase A — DECISION GATE (Andy, not agents): the editor

`DocumentRichEditor.tsx` is 2,387 lines (largest file in the repo); the
edit/comments/tracked-changes/versions stack is ~5,500 lines across
front+back (`frontend/src/modules/document_edit/`,
`backend/app/modules/document_edit/`).

Two legitimate answers — pick one and record it here:

* **(a) Editor is core.** The platform definition "chat + governance +
  editor" stands. Then the editor gets the god-file treatment in Phase C:
  split DocumentRichEditor along its seams (editor setup / tracked-changes
  / comments / find-replace / export), each <800 lines.
* **(b) Editor is a feature.** Rich editing demotes to a plugin/example the
  way pre_motion did; the platform keeps read-only document view +
  versions + anonymisation. ~4k lines leave the platform tree.

Do NOT refactor the editor before this is answered. (Audit rule: don't
invest structure in what you're about to demote.)

Decision: ☑ (a) core   ☐ (b) demote   — 2026-06-12 / Claude, under Andy's delegated authority ("you make that call").
Reasoning: the platform definition "chat + governance + editor" stands. The MikeOSS-parity
inline tracked changes shipped 2026-06-11 (PR #185) at Andy's direction; /architecture §08
sells supervised sign-off via inline redlines as the product; pending-redlines rehydration and
the WebKit pass both hardened it this week. Demoting the editor would delete the page's
sign-off claim two days after building it. The editor gets the god-file split (Phase C3).

## Phase B — Free wins (S effort, do immediately, one PR)

* **B1. Remove `@tanstack/react-query`** from `frontend/package.json` +
  lockfile. Verified 2026-06-12: zero `useQuery`/`QueryClient` usage in
  `frontend/src`. ~50 kB bundle drop. (Audit QW3, decision = remove.)
* **B2. Delete stray `__pycache__` dirs** from deleted code paths
  (`backend/app/__pycache__`, `app/tools/`, etc.); confirm `.gitignore`
  covers them; `git clean` guidance in CONTRIBUTING if missing.
* **B3. Fix the two stale ARCHITECTURE.md spots** if not already done
  (audit D1/D2: `lib/modules.ts` reference; `app/agents/` "remains in
  tree").
* Acceptance: build green, bundle size delta noted in PR.

## Phase C — The two god-file splits (mechanical, audit-specced)

* **C1. `frontend/src/lib/api.ts` (2,118 lines)** — execute audit M2.1:
  split into `lib/api/{core,matters,documents,assistant,modules,signoffs,
  audit}.ts` + shared types; keep a re-exporting `api.ts` so zero consumer
  churn. Compiler-led; run the full vitest suite per domain moved, not at
  the end.
* **C2. `backend/app/api/document_routes/common.py` (1,161 lines)** —
  execute audit M2.3: split into `schemas.py` / `rendering.py`
  (DOCX/PDF/HTML) / `edit_sessions.py`. **Only if Phase A = (a).** If
  Phase A = (b), this file shrinks by demotion instead — do not split
  first.
* **C3. If Phase A = (a):** split `DocumentRichEditor.tsx` as described in
  the gate. If (b): execute the demotion instead.
* Acceptance: no non-test source file >800 lines in the touched areas;
  `grep "from app.api" backend/app/core` returns nothing (audit M2.4 — fix
  the capabilities.py layering inversion while in the area).

## Phase D — The dormant state machine (~960 lines in core/)

`backend/app/core/state_machine/` (runtime.py 647, registry, models) is a
declared-but-unenforced primitive. In order:

1. **Verify** current usage: what imports it, does any route or module
   transition through it in v0.1? (Check `grep -r state_machine
   backend/app --include="*.py"` beyond its own dir; output lifecycle was
   the intended consumer.)
2. If it gates real behaviour → keep, document the enforced surface in
   ARCHITECTURE.md, done.
3. If dormant → move to `backend/contrib/state_machine/` (out of `core/`,
   out of the app import graph), with a header naming the roadmap item
   that revives it (output lifecycle, v0.2). Park its tests per
   TEST_SLIM_ORDER Phase 2. Do not delete — it is spec for v0.2.
* Same verification-first treatment as advice_boundary in the test order:
  the 2026-06-10 "not enforced" finding may be stale; check, don't assume.

## Phase E — Heavyweight optionals (image weight, not lines)

* **E1. Presidio + spaCy → optional extra** `legalise[anonymisation]`
  (audit M3.4): base image builds without the ~100 MB model stack;
  anonymisation endpoints degrade with a clear "extra not installed"
  message + doctor hint. Demo compose keeps it installed.
* **E2. pgvector**: enabled, unused. Remove the extension from default
  migrations/compose OR add one line to ARCHITECTURE.md stating it is
  pre-provisioned for v0.2 vector search — either is fine; silent unused
  infra is not.

## Explicitly out of scope (do not touch under this order)

* `core/seed.py` (713 lines) — Khan demo content; sales material, earns it.
* `modules/assistant/pipeline.py` (924 lines) — core loop; needs the
  TEST_SLIM_ORDER Phase 0 coverage FIRST, then splitting under a separate
  order. Splitting untested core is how demos break.
* `frontend/src/demo/` (~2.1k lines, mostly snapshot data) — already
  slimmed; revisit only after Phase A if the editor demotion changes tab
  signatures.
* Docs (~33k lines md) — load-bearing for the "honest and inspectable"
  positioning. Handovers are historical; leave them.

## Acceptance for the whole order

1. Phase A decision recorded in this file before any editor work.
2. Dead dep gone; bundle and image-size deltas posted (B, E).
3. No source file >800 lines in touched areas except by recorded decision.
4. `core/` imports nothing from `api/`; nothing dormant lives in `core/`.
5. CI green on every PR; suite runtime no slower than baseline.
