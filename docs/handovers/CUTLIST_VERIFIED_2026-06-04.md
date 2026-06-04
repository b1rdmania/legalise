# Verified Execution Cut-List — v0.5 cleanup

> **For the cleanup/build agent.** This is the dependency-verified successor to
> [`SIMPLIFY_CUTLIST_2026-06-04.md`](./SIMPLIFY_CUTLIST_2026-06-04.md). Every
> claim was re-traced against actual importers / routes / call-sites via a
> read-only multi-agent pass (8 target groups). Gated on **#160 merging** —
> the cuts touch matter-shell/tab code that conflicts with the unmerged design
> shell. Do not execute before #160 lands.

**North Star.** Legalise owns: project folder → documents → skills →
runner/chat → typed output → sign-off → record/export. Skills must not own app
surfaces. If a file exists only because an old first-party workflow had its own
UI, it is suspect; if it supports the generic loop or the regulated record,
keep it.

---

## Target recalibration (read first)

**The "89k → 20–30k via module collapse" thesis does not hold.** The original
cutlist assumed five bespoke first-party module stacks could be collapsed into
the generic runner for a large line-count drop. Verification found the opposite:

- **No `if (skill === "…")` branching exists anywhere.** The acceptance rule is
  already met across the codebase.
- **Four of the five modules are legitimate, load-bearing, and stay** —
  `pre_motion` (documented allowed orchestration), `letters` (plugin bridge),
  `case_law` (generic capability gate), `tabular_review` (clean, full audit
  chain). They are not bespoke-UI cruft; they route correctly.
- **Only `contract_review` is a real violation** (one bespoke `/run` path).

So the reachable cleanup is **modest**: a few shims, one staged module
migration, and the `lib/api.ts` split. **Getting to 20–30k would mean removing
features, not de-duplicating** — a product decision, not a cleanup. Recommend
resetting the target: this codebase is mostly load-bearing; plan line count to
stay ~80k unless functionality is deliberately cut.

---

## Bumper 1 — Delete/park legacy frontend surfaces

### 1.1 Re-export tab shims — DELETE (low risk)
Three one-line re-export shims. `DemoMatter.tsx` already imports the real
components direct; only `MatterDetail.tsx` still routes through the shims.

- Delete `frontend/src/matter/tabs/{ResearchTab,ReviewsTab,ContractReviewTab}.tsx`
- Repoint imports in `MatterDetail.tsx`:
  - `./tabs/ResearchTab` → `../modules/case_law/ResearchTab`
  - `./tabs/ReviewsTab` → `../modules/tabular_review/ReviewsTab`
  - `./tabs/ContractReviewTab` → `../modules/contract_review/ContractReviewTab`
- **Leave `LettersTab` / `PreMotionTab` alone** — real components, not shims.
- Gate: `tsc --noEmit` + `vitest run frontend/src/matter` + render smoke `/matters/:slug` and `/demo`.

### 1.2 Empty legacy module folders — DELETE (no risk)
`.gitkeep`-only, zero importers: `frontend/src/modules/{letters,pre_motion,matter,chronology}/`.
Gate: `tsc --noEmit`.

### 1.3 Chronology — PARK (defer)
Off the rail since the IA reset, but still deep-link routable and wired into
chat citations (`[chron:<id>]`). Removal is a ~15-edge surgical job and does not
break the loop or violate acceptance. Mark "removal candidate post-stabilization";
do not sever edges this pass.

### 1.4 Legacy `/modules/*` route + hash shims — KEEP
`router/index.tsx` redirects, `router/legacyHashRedirect.ts`, `lib/route.ts`
carry shipped marketing/email URLs into `/skills/*`. Severing breaks inbound
traffic, not the loop. Retire only after the confidence window (tracked follow-up).

---

## Bumper 2 — Collapse first-party modules (THE headline cut, now small)

### 2.1 `contract_review` — the only real violation (HIGH risk, staged)
`ContractReviewTab` formerly called a bespoke SSE route. Stage 1 shipped in
PR #165: the frontend now creates a durable contract-review job, polls
`GET /api/matters/{slug}/jobs/{job_id}`, and renders from `result_payload`.
The empty frontend API shim was deleted.

Stage 2 is backend cleanup:

- Delete `/run` and `/run-stream` from
  `backend/app/modules/contract_review/router.py`.
- Keep `/docx` until a generic artifact/export path explicitly replaces it.
  DOCX export still round-trips the job result envelope and must keep working.
- Keep `main.py`'s `contract_review_router` include while `/docx` lives there.
- **KEEP** `{schemas,pipeline,prompts,agents,export}.py` (shared by the worker)
  and `{ResultPanel,StageStrip}.tsx` (presentation-only).
- Gate: `pytest backend/tests -k "contract_review or jobs or worker"` +
  `vitest run frontend/src/modules/contract_review` + a manual golden-loop walk
  on Khan v Acme (open → select contract-review skill → run via job → typed
  output → sign-off → record → export); confirm DOCX export still works and no
  `/run-stream` request fires.

### 2.2–2.5 `pre_motion` / `letters` / `case_law` / `tabular_review` — KEEP
All legitimate, no edges to sever, low risk. Do **not** lump `pre_motion` in
with `contract_review` — it is the intended bespoke-orchestration pattern, not a
violation. If a later pass standardises any of these onto jobs, that is a
separate, deliberate initiative — not this cleanup.

---

## Refactor-after (only once Bumpers 1–2 are green)

- **Split `frontend/src/lib/api.ts` (2,785 lines)** per-domain — *after* 2.1
  removes `runContractReviewStream`/`exportContractReviewDocx`, so the split
  lands on the post-cut surface.
- **Provider/SSE dedupe** — only the remaining Pre-Motion stream should be
  considered after 2.1; contract-review no longer owns SSE.
- Gate: full `vitest run` + `tsc --noEmit` + `pytest backend/tests` + prod build.

---

## DO-NOT-TOUCH (regulated substrate + generic-loop core)

Load-bearing regardless of any map flag:

- **Generic runner core:** `matter/GenericSkillRunner.tsx`, `matter/skillRunnerModel.ts`
  (`InvocationRunner.tsx` is DEFER-only — still live in `GrantsPanel.tsx:621`; do
  not delete this pass).
- **Job/worker substrate:** `backend/app/api/jobs.py`, `backend/app/worker.py`.
- **Shared module internals used by the worker:**
  `contract_review/{schemas,pipeline,prompts,agents,export}.py`,
  `pre_motion/{pipeline,agents,schemas,pdf}.py`.
- **Audit / record / export:** core `audit_api.log`, `app.core.api.audit_failure`,
  `core/exports.py`, `/api/documents/generated/{uuid}`, object-storage abstraction.
- **Plugin bridge + model gateway** (letters / case_law / generic `/invoke` depend on it).
- **Matter shell entrypoints:** `matter/MatterDetail.tsx`, `demo/DemoMatter.tsx`,
  `backend/app/main.py`, `matter/tabs/types.ts` — edit only the specific lines
  called out above; never delete the files.
- **Demo data:** `demo/snapshot.ts` (`DEMO_SNAPSHOT`).
- **Compatibility shims carrying shipped URLs** (see 1.4).
