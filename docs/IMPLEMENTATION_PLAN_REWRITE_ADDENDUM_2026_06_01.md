# Implementation Plan Rewrite — Addendum 2026-06-01

**Status:** factual reconciliation between the locked v2 architecture plan (`docs/IMPLEMENTATION_PLAN_REWRITE.md`, ratified 2026-05-25) and what has shipped on `master` since. Builder-authored. Interpretive calls (does V1 surface X *satisfy* phase Y?) are deferred to Reviewer.

This addendum does not modify the v2 plan. It records that the v2 plan is canonical direction but not start-here-tomorrow build state, and lists what changed underneath it.

## Premise

v2 plan was grounded at `5322e70` (24 May 2026). Plan §0 says *"Build not yet started"* and §0 specifies a dedicated `runtime-rewrite` branch cut from master at the start of Phase 0, with hosted-eval staying on master throughout the rewrite.

As of 2026-06-01:

- `runtime-rewrite` branch is not active. `origin/runtime-rewrite` exists but is an ancestor of `master`.
- `master` is at `c94d0ca` — 34 commits past `5322e70`.
- The thirteen Phase 0 architecture docs are present in `docs/architecture/` (one more than the twelve listed in plan §Phase 0: `ADVICE_BOUNDARY.md` is split out from `STATE_MACHINE_PRIMITIVE.md`).
- A substantial V1 product slice has shipped on `master` outside the rewrite branch.

The canonical V1 state summary lives at `docs/handovers/HANDOVER_V1_PRODUCT_STATE_2026_05_30.md`. This addendum cites it, does not duplicate it.

## V1 surfaces shipped since v2 plan (factual map)

Each row: surface → on-disk location(s) → which v2 phase(s) it may relate to. The *"may relate to"* column is descriptive, not a completion claim. Reviewer ratifies whether each surface is retained, ported, or rewritten during the runtime rewrite.

| V1 surface | Files / routes | May relate to |
|---|---|---|
| Professional Sign-Off | `backend/app/api/signoffs.py`, `backend/app/core/signoff.py`, `backend/app/models/matter_signoff.py`, `frontend/src/matter/SignOff.tsx`, `SignOffConfirmation.tsx`, migration `0022_professional_signoff.py` | Phase 1.3 (advice-boundary tier transitions), Phase 5 (audit reconstruction — sign-off events emit audit rows), Phase 12 (frontend gate UX) |
| Source Anchors | `backend/app/core/source_anchors.py`, `backend/app/core/prompt_runtime.py`, `tests/test_source_anchors.py`, `test_contract_review_source_anchors.py` | Phase 5 (output evidence in audit), Phase 7 (Contract Review reference port — already source-aware) |
| Export Gating v1.1 | `backend/app/core/exports.py`, `tests/test_export_signoff_gating.py`, `test_export_source_anchors.py` | Phase 5 (audit/evidence pack emission), Phase 16 (pre-launch hardening) |
| Module v2 manifest schema | `backend/schemas/module.v2.json` (293 lines) | Phase 2 (manifest v2 + capability registry) — schema artefact present; runtime registry/grammar work still to do per plan |
| Prompt Runtime v1 | `backend/app/core/prompt_runtime.py`, `tests/test_prompt_runtime*.py` | Phase 6 (sync/streaming runtime), Phase 7/8 (reference ports — module dispatch path) |
| Lawve Skill Importer | `frontend/src/modules-v2/LawveImport.tsx`, related handover | Phase 11 (connector proof set — distinct from first-party-signed reference connectors; importer is a different surface), Phase 12 (catalogue UX) |
| Guided Demo Loop v1 | `backend/app/api/demo.py` (`POST /api/demo/guided-loop`), `backend/app/core/demo_loop.py`, `frontend/src/demo/DemoLoop.tsx`, handover `HANDOVER_GUIDED_DEMO_LOOP_V1_DONE.md` | Phase 13 (Khan canonical demo) — Guided Demo Loop overlaps with Kramer carry-over #1 (guided exhibit); Reviewer to decide relationship |
| Document Workspace + Ingress | `frontend/src/matter/tabs/DocumentsTab.tsx`, `ArtifactDetail.tsx`, `ArtifactPreview.tsx`, `ArtifactsList.tsx` | Phase 12 (frontend capability runtime UX) — may reduce Phase 12 scope |
| Matter Desk UX compression | `frontend/src/matter/MatterNav.tsx`, `MatterPulse.tsx`, `MatterDetail.tsx` | Phase 12 |
| `legalise doctor` (Phase 16 C) | `backend/app/tools/doctor.py` — 8 checks including `khan.demo_present` | Phase 16 (pre-launch hardening) — partial scope; pen-test + audit-integrity work still per plan |
| Audit-centered matter UX | `frontend/src/matter/ReconstructionView.tsx`, related handover | Phase 5 (audit reconstruction view), Phase 12 |
| KISS V1 compression pass | `c94d0ca chore: apply KISS repo cleanup` on master; further partial work on `origin/repo-cleanup-pass` | Not a rewrite phase deliverable; separate hygiene track |

## Architectural primitives from v2 plan §1 — status

| Primitive | Plan location | On master |
|---|---|---|
| Generic state-machine primitive | Phase 1.1 | Not present as `backend/app/core/state_machine/`. Sign-off + review machinery uses bespoke state today. |
| Generic matter-context store | Phase 1.2 | Not present as `backend/app/core/matter_context/`. |
| Opinion/advice boundary | Phase 1.3 | Doctrine doc at `docs/architecture/ADVICE_BOUNDARY.md`. Runtime enforcement partially present via existing `phase1_runtime/advice_boundary` (predates v2 plan; Reviewer to confirm whether this is the v1.3 primitive or stub). |
| MCP host | Phase 3.1 | Not present as `backend/app/core/mcp_host/`. |
| Sandbox | Phase 3.2 | Not present as `backend/app/core/sandbox/`. |
| Signing (sigstore) | Phase 3.3 | Not present as `backend/app/core/signing.py`. |
| Trust ceremony | Phase 3.4 | UI shell present at `frontend/src/modules-v2/InstallCeremony.tsx`; backend `trust_ceremony.py` not present. Plan §3.4 specifies state machine + signature gating which is not implemented. |
| Grants lifecycle | Phase 4 | Not present as `backend/app/core/grants_lifecycle.py`. |
| Module CLI | Phase 14 | Not present as `cli/legalise.py`. |

## What is untouched relative to v2 plan

- `runtime-rewrite` branch strategy (plan §0).
- Phase 1 substrate primitives (state-machine, matter-context, advice-boundary as a new package).
- Phase 2 capability registry + grammar (schema file exists; registry runtime + grammar do not).
- Phase 3 MCP host + sandbox + signing + trust ceremony state machine.
- Phase 4 grant lifecycle.
- Phase 7/8/9 module ports as governed under the new runtime (Contract Review + Pre-Motion + Document Redliner) — existing modules run on the legacy bridge.
- Phase 10 `MIGRATION.md` files for the six migration-target workflows.
- Phase 11 first-party signed reference connectors (Companies House, legislation.gov.uk, local document reader, provider modules under v2 manifest).
- Phase 16 pen test + audit integrity review + cut-over.

## Reviewer to decide

These are the items the builder cannot ratify alone:

1. **Branch decision.** Cut `runtime-rewrite` from current `master` (`c94d0ca`)? If yes, freeze feature work on `master` to security/audit-only per plan §Branch strategy. If no, restate the branch strategy.
2. **Manifest v2 schema reuse.** `backend/schemas/module.v2.json` exists. Is this the Phase 2 schema, or does Phase 2 supersede it?
3. **Prompt runtime relationship to Phase 6.** Prompt Runtime v1 ships sync + streaming behaviour. Does Phase 6 still need to land, or is its scope reduced?
4. **Guided Demo Loop relationship to Phase 13.** Demo loop already produces a guided keyless flow on Khan. Does Phase 13 still need to land as planned, or is its scope reduced?
5. **`phase1_runtime/advice_boundary` relationship to Phase 1.3.** Is the existing package the Phase 1.3 advice-boundary primitive, or is it superseded?
6. **KISS cleanup.** `origin/repo-cleanup-pass` carries the partial PR-A redline (~366 phase markers across ~98 files). Merge as partial, finish, or close?

## Kramer carry-overs — scope check

Per `docs/handovers/KRAMER_DEMO_COMPREHENSION.md`, seven carry-overs are proposed. This addendum does not sequence them. It flags only:

- Carry-over #1 (guided exhibit for Khan) overlaps Guided Demo Loop v1 already on master. Any guided-exhibit PR should explicitly state whether it extends `DemoLoop.tsx` or replaces it.
- Carry-over #2 (Trust + Review card) is the smallest scope and does not appear duplicated by any V1 surface.
- Carry-overs #3–#7 do not appear duplicated by any V1 surface (verified by file inspection only; Reviewer to confirm).

## What this addendum is not

- Not a rewrite of the v2 plan.
- Not a phase-completion claim for any V1 surface.
- Not a build sequence.

Sequence + scope decisions sit with Reviewer.

## References

- v2 plan: `docs/IMPLEMENTATION_PLAN_REWRITE.md`
- V1 product state: `docs/handovers/HANDOVER_V1_PRODUCT_STATE_2026_05_30.md`
- Kramer carry-over brief: `docs/handovers/KRAMER_DEMO_COMPREHENSION.md`
- Khan demo health check: `docs/handovers/KHAN_HEALTH_CHECK.md`
- Phase 0 architecture docs: `docs/architecture/*.md`
- KISS cleanup state: branch `origin/repo-cleanup-pass`
