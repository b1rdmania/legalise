# Phase 18 — Logged-In Route Inventory (Step A)

**Status:** Step A deliverable per `PHASE_18_LOGGED_IN_OPERATOR_COHERENCE_BUILD_PLAN.md`. For Reviewer review before screen work (Steps B–F).
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Method:** grounded in the live router (`frontend/src/router/index.tsx`), the backend API surface, and direct reads of every component below. No screens changed yet. Backend gaps are logged as findings, not implemented.

## Classification key

`keep` · `copy-only` · `layout fix` · `missing endpoint` (file gap, don't build) · `defer`

## Inventory

| Route | Component | Access | API calls | UI problem | Class | Step |
|---|---|---|---|---|---|---|
| `/app` | AppHome | authed* | getBootstrapState, listMatters, listAudit | Rebuilt 17-IA-D; coherent. Minor copy only. | keep / copy-only | — |
| `/matters` | MatterList | authed | listMatters | Functional list; header/empty-state could match operator grammar. | copy-only | D/F |
| `/matters/{slug}` | MatterDetail (+ tabs, GrantsPanel, PostureBanner) | matter | getMatter, listGrants, getModulesV2, listInstalledModules, getBootstrapState, tab calls | Actions/grants/artifacts/audit read as independent widgets; record-page coherence missing. | layout fix | D |
| `/matters/{slug}/artifacts` | ArtifactsList | matter | GET /matters/{slug}/artifacts | Reads like storage records; not "outputs of this matter"; weak post-run discoverability. | layout fix | D |
| `/matters/{slug}/artifacts/{id}` | ArtifactDetail / ArtifactPreview | matter | GET …/artifacts/{id}; deep-links to audit via `?invocation_id` | Mostly fine; label the audit deep-link as "reconstruction". | copy-only | D |
| `/matters/{slug}/audit` | ReconstructionView | matter | reconstruction GET | Functional; label as audit trail / reconstruction, not raw rows. | copy-only | D |
| `/modules` | ModulesCatalog | **public** | getPublicModules | Browse-only of public *skills*; no install-state labels; "manifest issues" count unexplained; install-is-per-matter not stated. | layout fix | B |
| `/modules/{module_id}` | ModuleDetail | authed | getModuleV2, startInstall, updateModuleV2, revokeModuleV2 | Capabilities rendered as raw manifest table (Id/Kind/Scope/Advice/Network) — the "substrate panel with buttons" smell; no installed/disabled badge. | layout fix | B |
| `/modules/install/{ceremony_id}` | InstallCeremony | authed | getCeremony, advanceCeremony | Stepper uses substrate state names as the headline; enabled-state copy leaks internals ("InstalledModule row is persisted… `module.enabled` audit row was written"). | copy-only / layout | B |
| `/settings/profile` | Settings(profile) | authed | profile update, password reset, default model/posture | Coherent. | keep | — |
| `/settings/keys` | Settings(keys) | authed | listApiKeys, upsertApiKey, deleteApiKey | BYO-key mechanics exist but story is buried; no "can I run real calls?" signal; no status. | layout fix + copy | C |
| `/settings/preferences` | Settings(preferences) | authed | none | Empty v0.2 placeholder. | defer (hide tab until it has content) | — |
| `/admin/users` | AdminUsersList | admin | GET /admin/users | Read-only table; no mutation; fine. Improve empty/filter states only. | copy-only | E |
| `/admin/users/{id}` | AdminUserDetail | admin | getAdminUser, POST /admin/users/{id}/role | Role-mutation form present; framing must read as deployment/firm controls, not evaluator setup. | copy-only | E |
| `/admin/audit` | AdminAuditView | admin | workspace reconstruction GET | Functional; labels/tooltips only; no export/grouping this phase. | copy-only | E |

`*` `/app` is intentionally reachable logged-out (renders a marketing-ish home), but its authed branch is the operator dashboard.

**Out of phase:** `/demo`, `/demo/{tab}` (DemoMatter) — already shares the *real* matter shell (MatterNav/MatterBreadcrumb/RightRailAssistant + real tabs, static `DEMO_SNAPSHOT`, zero backend). No divergent legacy shell to reconcile; copy hygiene only, per build-plan Q6.

## Findings (gaps — logged, not built)

**F1 — No provider key status/test-call endpoint.** `backend/app/api/settings.py` exposes only `GET/POST/DELETE /settings/keys` (CRUD). `UserApiKeyRead` = `provider / created_at / last_used_at`; no `configured`/`valid`/`tested` field, no provider round-trip. **Resolution (ratified):** Step C shows honest labels only — `No key configured` / `Key configured, not tested` / `Using keyless demo model` — derived frontend-side from `listApiKeys()`. `POST /settings/keys/{provider}/test` filed as a **deferred** backend gap; not built in Phase 18 unless Step C proves users cannot proceed.

**F2 — ModuleDetail installed/disabled badge is NOT a substrate gap.** The header comment in `ModuleDetail.tsx` cites "BACKEND_GAP_AUDIT 14-B-#1 (no installed-vs-not badge)", but `listInstalledModules()` already exists and returns per-module `enabled` state — `GrantsPanel.tsx` consumes it today. So Step B can add an `Installed` / `Installed · disabled` / `Not installed` badge to ModuleDetail **frontend-only**, no backend. (Update the stale comment when we touch the file.)

**F3 — Catalog and detail/install are different data models with no cross-link.** `/modules` lists public *skills* (`getPublicModules` → plugin/skill), while `/modules/{id}` + install operate on *v2 modules* (`getModuleV2` → module_id). There is no skill→module_id link, and the mapping may not be 1:1. **Do not force a link in Step B.** Open question for Reviewer: is a catalog-card → detail link in scope, or do these stay deliberately separate (browse vs manage)? Recommendation: keep separate for now; revisit only if it confuses the evaluator path.

**F4 — `/settings/preferences` is empty.** Recommend hiding the tab until it has real content rather than shipping an empty section. Frontend-only; no data loss.

## Reviewer decision points before Step B

1. Confirm step order A→B→C→D→E→F (B/C reorder already adopts the Builder-response divergence: modules then provider clarity).
2. F3: catalog↔detail link in scope, or keep browse and manage separate?
3. F4: hide the empty preferences tab, or leave it?

Everything else in the table is unambiguous. On confirmation (or silence on the three points above, taking the recommendations), Step B begins with ModuleDetail + ModulesCatalog + InstallCeremony + GrantsPanel, each substep leaving typecheck/test/build green.
