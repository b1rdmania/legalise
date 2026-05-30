# KISS Repo Review — 2026-05-30

Status: review only. No code or docs were deleted.
Branch reviewed: `master`

## Executive Take

The repo is not broken, but it has accumulated planning sediment.

The substrate is serious and the V1 loop is now coherent in code, but the repo
still reads like several older products at once:

- v0.4/v0.5 evaluation language;
- "supervisor gate lands later" language;
- old `Workflows`/`Artifacts`/`Chronology` taxonomy;
- phase-by-phase implementation plans mixed with current product docs;
- dead or nearly-dead frontend components left after the KISS UI compression.

KISS priority is not a large refactor. It is:

1. make the canonical docs match the current product;
2. archive old handovers behind one index;
3. delete obvious stranded frontend files;
4. clean stale source comments/names only where they confuse future work;
5. avoid re-expanding the UI around substrate concepts.

## Inventory

- Tracked files: `720`
- Handover files: `123`
- Handover text: about `24k` lines
- `docs/handovers`: about `1.4M`
- `frontend/src`: about `1.2M`
- `backend/app`: about `1.8M`

Generated dependency/build folders (`frontend/node_modules`, `frontend/dist`,
Python caches, pytest cache) are present locally but not tracked by git. This is
fine; `.gitignore` is doing its job.

## Findings

### P1 — Canonical Docs Are Behind The Product

Files that a new evaluator or contributor will read first still describe an
older product boundary:

- `README.md`
- `docs/SUPERVISED_AUTONOMY.md`
- `docs/DESIGN.md`
- `docs/ROADMAP.md`
- parts of `docs/outreach/*`
- older journey/page-map docs under `docs/spec/*`

Examples found:

- `docs/SUPERVISED_AUTONOMY.md` says Legalise v0.4 is substrate only and "the
  supervisor-gate primitive lands in v0.5".
- `README.md` still talks about `Workflows / modules`, a "qualified human",
  and a v0.6 trust layer as if Professional Sign-Off and source anchors have
  not landed.
- `docs/DESIGN.md` is explicitly `v0.4 FROZEN` and still explains the UI around
  `Workflows`, horizontal history, and older matter rail concepts.

This is now misleading. Professional Sign-Off, source anchors, export sign-off
integrity, Lawve import, prompt runtime, original-file retrieval, and Activity
Trail shaping are live.

Recommendation:

- Make `docs/handovers/HANDOVER_V1_PRODUCT_STATE_2026_05_30.md` the canonical
  truth source for the next doc pass.
- Rewrite `README.md`, `docs/SUPERVISED_AUTONOMY.md`, and `docs/ROADMAP.md`
  before more feature work.
- Mark `docs/DESIGN.md` as historical or replace it with a small current
  interface contract.

### P1 — Handover Sprawl Is Now A Navigation Problem

`docs/handovers` contains 123 files. Many are valuable history, but as a working
surface it is too noisy.

The problem is not disk size; it is cognitive load. A new agent can easily read
an old phase plan and think it is current.

Recommendation:

- Add `docs/handovers/INDEX.md` with:
  - **Current truth:** `HANDOVER_V1_PRODUCT_STATE_2026_05_30.md`
  - **Current open work:** one short list only
  - **Historical archive:** all phase plans and old handovers
- Optionally move old files into `docs/handovers/archive/` in one mechanical
  commit, but only after the index exists.
- Keep the recent product-state handover at top level.

### P1 — Public Claim Boundary Needs Re-Sync

Several docs still say "supervised autonomy is not implemented yet" while the
product now has:

- author Professional Sign-Off;
- optional Supervisor Review;
- source anchors;
- sign-off hash pinning;
- export sign-off metadata and integrity;
- Activity Trail decision shaping.

The honest claim is no longer "substrate only". It is closer to:

> Evaluation workspace for solicitor-owned AI preparation: documents in,
> governed actions, sourced outputs, professional sign-off, exportable record.

Still not legal advice, not a law firm, and not live-client-ready by default,
but the gate is now real enough to be described.

Recommendation:

- Update launch/claim docs to stop saying "gate lands next".
- Preserve caution around live client matters and source-anchor limitations.

### P2 — Stranded Frontend Components

Likely cleanup candidates:

- `frontend/src/router/PlaceholderPage.tsx`
  - No current route imports it.
  - Comments still mention Phase 14 placeholder routes.
- `frontend/src/matter/MatterRecordSummary.tsx`
  - Only referenced by its test after the matter summary was removed from the
    page body.
- `frontend/src/matter/RightRailAssistant.tsx`
  - No product path currently imports it; the right rail was removed from the
    matter/demo surfaces.
- `frontend/src/landing/SubmitModule.tsx`
  - Still mounted at `/modules/submit`, but the operator create path is now
    `/modules/create`.
  - Decide whether `/modules/submit` is still a marketing/outreach route. If
    not, remove or redirect.

Recommendation:

- Delete the first three if tests confirm no imports.
- Decide explicitly whether `/modules/submit` survives.
- Do not delete `Waitlist` yet unless hosted access mode is permanently open;
  it is still routed behind `HOSTED_ACCESS_WAITLIST`.

### P2 — Product Labels Changed, Internal Names Did Not

This is acceptable technically, but confusing:

- Product label: `Actions`
- Internal tab/route/file names: `workflows`
- Product label: `Outputs`
- Internal route/file names: `artifacts`
- Product label: `Export`
- Internal route/file names: `lifecycle`
- Product label: `Activity Trail`
- Internal route/file names: `audit`

Some of this is fine. Stable routes are useful. But comments still tell old
stories:

- `MatterDetail.tsx` says bare `/matters/:slug` lands on Assistant, but the code
  now lands on Documents.
- `tabs/types.ts` says bare `/matters/{slug}` redirects to assistant.
- `ArtifactDetail.tsx` and `InvocationRunner.tsx` still mention placeholder
  audit routes even though those routes are real.
- Several files still call the current product `v0.4`.

Recommendation:

- Do not rename routes before V1 unless necessary.
- Do a comment/copy cleanup pass so future agents do not follow stale comments.
- If renaming files later, do it mechanically and separately.

### P2 — `MatterDetail.tsx` Is A Monolith

`frontend/src/matter/MatterDetail.tsx` still owns many old surfaces and
workflows:

- documents;
- chronology;
- actions/workflows;
- audit;
- approvals;
- pre-motion;
- letters;
- contract review;
- tabular review;
- research;
- upload;
- posture changes;
- exports/downloads;
- letter drafting.

This is not a launch blocker, but it is where future accidental complexity will
go to grow.

Recommendation:

- Do not refactor it today just for purity.
- When touching any one old workflow surface, extract that surface's loading and
  side effects out of `MatterDetail`.
- Long-term target: `MatterDetail` should be shell + route/tab switch, not
  workflow orchestration.

### P2 — CI/E2E Runs On Docs-Only Pushes

The docs-only handover commit triggered CI and e2e. That is safe but slow and
feeds the "testing delays everything" problem.

Recommendation:

- Add `paths-ignore` or path-scoped triggers for docs-only changes where safe.
- Keep deploy workflows path-scoped as they are.
- Preserve full CI/e2e on source changes and before production merges.

### P2 — Root README Status Section Is Outdated

`README.md` still lists:

- "Five surfaces" although the product now has more;
- "155 passed, 53 skipped in backend CI" although backend counts are now much
  higher;
- live-matter readiness gates that have since shipped;
- v0.6 trust layer items where some source-grounding work has already landed.

Recommendation:

- Replace the detailed status list with a shorter "Current V1 state" section.
- Link to current docs for details instead of maintaining counts manually.

### P3 — Historical Design References Are Fine, But Should Be Labelled

`docs/design-refs/*` and `docs/mockups/*` are historical inputs. Keep them, but
they should not be mistaken for current UI contracts.

Recommendation:

- Add `docs/design-refs/README.md` or a short note in the handover index.

### P3 — Placeholder Comments In Backend Are Mostly Harmless

There are several `Pre-build placeholder` comments in `backend/app/__init__.py`,
`backend/app/core/__init__.py`, `backend/app/modules/__init__.py`, etc.

These do not affect runtime, but they make the backend look less mature than it
is.

Recommendation:

- Update the package docstrings opportunistically.
- Do not burn a separate build cycle on them unless doing the docs cleanup.

## Reviewer Refinements To Fold In

These refinements came after the first review and should be treated as part of
the execution plan, not optional commentary.

### 1. Handover Index Needs A Rule

The index/archive step should create an ongoing rule, not a one-time tidy.

Suggested rule:

- only the most recent `DONE` handover per active feature remains at top level;
- older per-feature handovers move to `docs/handovers/archive/` on the next
  consolidated state-doc commit;
- each consolidated state doc names the handovers it supersedes;
- future agents start at `docs/handovers/INDEX.md`, then the current state doc.

Pilot this with `HANDOVER_V1_PRODUCT_STATE_2026_05_30.md`: have it name the
recent feature handovers it consolidates, then archive those older handovers in
the same mechanical commit.

Without this rule, the handover directory will regrow immediately.

### 2. Canonical Docs Rewrite Is A Public-Claim Decision

The doc sync is not mechanical copy cleanup. Replacing "substrate only /
supervisor gate lands later" with a stronger V1 claim is a public positioning
change.

This wording affects:

- README;
- `docs/SUPERVISED_AUTONOMY.md`;
- launch/outreach docs;
- any future SRA/pre-application reader.

The target claim should be written/reviewed deliberately by the project owner.
A draft is fine, but it should not be merged as a routine hygiene patch.

Guardrail:

- stronger than "substrate only";
- still not legal advice;
- still not a law firm;
- still not live-client-ready by default;
- source anchors are cited-for-review, not proof;
- Professional Sign-Off is professional ownership in Legalise, not regulator
  certification.

### 3. Deletion Requires Explicit Grep Proof

Before deleting stranded frontend files, run explicit symbol searches, not just
route-import checks.

Minimum proof:

```bash
rg -n "PlaceholderPage|MatterRecordSummary|RightRailAssistant" frontend/src
```

Expected:

- remove source file and test together where the test is the only reference;
- check for lazy imports, comments, and dynamic references;
- run focused frontend tests, then full frontend gate.

### 4. `MatterDetail` Extraction Needs A Target Shape

"Extract on touch" is right, but needs a small contract to prevent three new
mini-monoliths.

Proposed extracted-surface contract:

- `MatterDetail` owns shell, matter identity, and tab routing only;
- each tab/surface owns its own data loading where possible;
- shared matter-level data is passed as props only if needed by two or more
  surfaces;
- route/deep-link behaviour stays in router/tabs taxonomy, not buried inside a
  surface;
- side effects that refresh audit/doc lists should be explicit callbacks, not
  hidden global reloads.

Write this contract before the first extraction.

### 5. CI Docs-Only Optimization Has Gotchas

`paths-ignore` is probably right, but remember:

- GitHub skips only when all changed files match the ignore patterns;
- one source-file change pulls docs along into the normal gate, which is
  usually desired;
- PR/fork settings can behave differently from push workflows;
- the only real verification is a docs-only push after the workflow change.

Alternative: a `[skip ci]` convention for docs-only commits. It is simpler and
observable, but easier to forget.

### 6. Memory Files Are The Same Class Of Problem

Project memory has also grown chronologically. It should point to the canonical
state handover and stay short:

- where we are now;
- what changed since last session;
- what is next.

Do not duplicate the full phase history in memory if
`HANDOVER_V1_PRODUCT_STATE_2026_05_30.md` is canonical.

### 7. Module READMEs May Be Stale Too

Step 1 should include module docs, especially:

- `examples/modules/contract_review/README.md`
- `examples/modules/pre_motion/README.md`
- any manifest/reference docs that describe output payloads, artifacts, or
  citation/source behaviour.

Contract Review now emits `source_anchors`; its docs may still describe only
plain citations.

## Suggested Cleanup Plan

### Step 1 — Canonical Docs Sync

Files:

- `README.md`
- `docs/SUPERVISED_AUTONOMY.md`
- `docs/ROADMAP.md`
- `docs/DESIGN.md` or replacement `docs/INTERFACE.md`
- relevant module READMEs under `examples/modules/*`

Goal:

- One current story.
- No "supervisor gate lands next" as the main claim.
- No v0.4/v0.5 roadmap framing unless explicitly historical.
- Preserve honest non-live-client and source-anchor limitations.

### Step 2 — Handover Index / Archive

Files:

- `docs/handovers/INDEX.md`
- optional `docs/handovers/archive/*`

Goal:

- Future agents start from one file.
- Old plans remain accessible but cannot masquerade as current instructions.

### Step 3 — Dead Frontend Removal

Candidates:

- `frontend/src/router/PlaceholderPage.tsx`
- `frontend/src/matter/MatterRecordSummary.tsx`
- `frontend/src/matter/MatterRecordSummary.test.tsx`
- `frontend/src/matter/RightRailAssistant.tsx`

Possibly:

- `frontend/src/landing/SubmitModule.tsx` and `/modules/submit`, if replaced by
  `/modules/create`.

Goal:

- Remove files that only preserve old design decisions.
- Run frontend tests after deletion.

### Step 4 — Stale Comment / Taxonomy Cleanup

Files:

- `frontend/src/matter/MatterDetail.tsx`
- `frontend/src/matter/tabs/types.ts`
- `frontend/src/matter/MatterNav.tsx`
- `frontend/src/matter/ArtifactDetail.tsx`
- `frontend/src/matter/InvocationRunner.tsx`
- `frontend/src/lib/route.ts`

Goal:

- Comments match current behaviour.
- Product label translations are documented once.

### Step 5 — CI Docs-Only Optimization

Files:

- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`

Goal:

- Docs-only pushes should not run the expensive gates unless manually requested.
- Source changes still run full gates.

## What Not To Do

- Do not rename all routes now. The current routes work and deep links matter.
- Do not remove backend role/posture/advice primitives; keep them dormant or
  behind firm-mode where appropriate.
- Do not delete old handovers without an index/archive strategy.
- Do not refactor `MatterDetail` as a standalone purity exercise.
- Do not expand the UI with admin/settings/module internals to "use" substrate.

## Bottom Line

The codebase needs a hygiene pass, not a rethink.

The current product loop is strong enough. The repo just needs to stop carrying
old public stories and old UI components in the foreground.

Best next action:

1. Canonical docs sync.
2. Handover index.
3. Remove obvious stranded frontend files.

That is the KISS cleanup with the highest signal-to-risk ratio.
