# Phase 17 — Virtual Operator-Proxy Walkthrough

**Status:** virtual pass complete enough to start Phase 17A/B/C.

This file is the spec for the Phase 17 redesign. It is not a
preamble — every redesign decision in 17A / 17B / 17C must cite a
numbered finding from this doc.

This is **not** a cold solicitor walkthrough. It is a deliberately
labelled virtual operator-proxy approximation, using the current UI
inventory, `docs/DEMO.md`, and the CRM-ergonomics principle from the
Phase 17 plan. A later cold operator or solicitor/legal-ops pass
overrides these findings if it contradicts them.

## Recorder identity

- **Name / role:** Codex builder acting as virtual CRM/operator proxy.
- **Profile category:** Virtual approximation (NOT COLD).
- **Cold or fallback?** [ ] Cold operator-proxy   [x] Virtual fallback
  (non-cold; surfaces obvious friction only; later cold findings
  override)
- **Pre-briefing on Legalise:** deep project context. This is the
  explicit limitation.
- **Session date / time:** 2026-05-28
- **Recording link:** none — virtual desk review, not recorded user research.
- **Local fork commit SHA used for the session:** `origin/master` after
  PR #11 merge; Phase 17 docs on `phase-17-crm-pass`.

> **Solicitor / legal-ops walkthrough is a separate later artifact**
> (`PHASE_17_LAUNCH_READINESS_WALKTHROUGH.md` when the time comes),
> gating public launch / design-partner outreach — not Phase 17
> implementation. Do not conflate the two in this file.

## Method

1. Read `docs/DEMO.md` as the evaluator path.
2. Read `PHASE_17_UI_INVENTORY_CONTEXT.md` for the current state of
   matter detail, modules, and audit reconstruction.
3. Apply three lenses: YC/open-source evaluator, CRM/SaaS operator,
   legal-governance reviewer.
4. Record only concrete UI/IA friction that can be fixed in
   `frontend/src/**` without substrate changes.
5. Do not quote imaginary users. Findings below are virtual findings,
   not user research.

## Per-screen findings

### Matter detail (`/matters/khan-v-acme-trading-2026`)

- Click count:
- Back-button count:
- "Where's…?" pause count (with timestamps):
- Expected vs observed:
  A CRM/operator expects a record page: summary header, key fields,
  related lists, available actions, and activity/audit links in one
  scannable frame. Current state is technically complete but split
  across left nav, tab body, posture banner, right rail, and a grants
  panel below all tabs.

#### Findings

| # | Priority | Finding | Timestamp |
| --- | --- | --- | --- |
| MD-1 | P1 | The matter page does not present a single record summary. Posture, slug, documents, grants, runnable modules, and artifacts are spread across different areas. A first-time evaluator cannot tell at a glance: "what is this matter, what can I run, what has already happened?" | virtual |
| MD-2 | P1 | The grants/invocation surface reads like capability plumbing rather than an action panel. A user has to understand module IDs, capability IDs, read/write grants, and installed state before seeing the simple action: run Contract Review or Pre-Motion. | virtual |
| MD-3 | P2 | The tab set mixes legal workspace concepts and module-specific workflows. Documents / Chronology / Audit sit beside Contract Review / Pre-Motion / Letters / Reviews / Research, making the page feel like separate apps stitched into one record. | virtual |
| MD-4 | P2 | Artifacts and audit are not visually tied to the actions that produced them from the matter page. The substrate links exist, but the page does not make the chain "run → artifact → audit trail" feel like one operational loop. | virtual |

### Modules page (`/modules`)

- Click count:
- Back-button count:
- "Where's…?" pause count (with timestamps):
- Expected vs observed:
  A SaaS operator expects an integrations page: installed modules
  first, available modules second, health/trust status visible, and
  an obvious install/update/revoke path. Current state is a catalog
  grid with installed badges, but operational state is not the main
  structure.

#### Findings

| # | Priority | Finding | Timestamp |
| --- | --- | --- | --- |
| MOD-1 | P1 | Installed vs available modules is not the primary layout. The installed badge is present, but the page still reads as a generic catalog rather than an admin integrations manager. | virtual |
| MOD-2 | P1 | Trust ceremony state is routed and functional, but the modules surface does not preview the operational implication: what permissions will this module need, what matters can it run on, and what will be audited. | virtual |
| MOD-3 | P2 | Module cards are visually light compared with the importance of module trust. Publisher, visibility, install state, capability count, and manifest validity should scan like integration health metadata, not small card details. | virtual |
| MOD-4 | P2 | There is no obvious "broken modules / manifest issues" operator view. Manifest invalid badges exist, but an operator cannot quickly triage installability across the catalog. | virtual |

### Audit reconstruction (`/matters/…/audit` + `/admin/audit`)

- Click count:
- Back-button count:
- "Where's…?" pause count (with timestamps):
- Expected vs observed:
  A governance reviewer expects an activity timeline with expandable
  detail: high-level chain first, raw rows on demand. Current state
  is honest and substrate-faithful, but it reads closer to a
  developer event dump than an oversight surface.

#### Findings

| # | Priority | Finding | Timestamp |
| --- | --- | --- | --- |
| AUD-1 | P1 | Timeline rows are not grouped into decision chains. A reviewer sees raw audit/state/advice rows but not the human story: install/grant/invoke/model/gate/artifact/completion. Raw rows must remain expandable, but the default view needs grouped chains. | virtual |
| AUD-2 | P1 | Filters expose substrate sources but not reviewer tasks. A regulator/operator likely wants "show this invocation", "show blocked attempts", "show role/grant changes", "show model calls", or "show artifacts"; current source chips are necessary but insufficient. | virtual |
| AUD-3 | P2 | Payload/refs JSON is available but visually dominates once expanded. The raw data is required, but the first expanded layer should show a small field summary before the raw JSON block. | virtual |
| AUD-4 | P2 | Matter audit and workspace audit are structurally similar but feel disconnected. Workspace-only source constraints are documented via disabled chips, but the product does not make scope clear enough at a glance. | virtual |

### Other screens encountered

If the virtual pass hits screens outside the three target screens
(admin/users, matters list, artifacts, settings, jobs, etc.),
log findings here. Per plan §Scope flex, these do not enter the
build scope unless reviewer swaps them in for one of the three
above.

| Screen | # | Priority | Finding | Timestamp |
| --- | --- | --- | --- | --- |
| Landing `/` | L-1 | P1 | No visible Sign in / Sign up affordance on landing page. Cold user must guess `/auth/signin`. Every comparable SaaS puts these in the top-right of the landing page. **CLOSED by PR #10 (`77e871f`)** — Sign in / Create account row added top-right of landing, auth-aware. | — |
| Sign up `/auth/signup` | L-2 | **P0 (product bug, not redesign)** | Submitting the signup form returns `Error · HTTP 404` and blocks account creation. Surfaced during Andy-fallback walkthrough attempt 2026-05-27 17:23 BST. **CLOSED by PR #10 (`77e871f`)** — Vite dev config now proxies `/auth/*` to backend:8000 (was only proxying `/api` + `/health`). Walkthrough can resume from `/`. | 17:23 |

## Post-walkthrough debrief (recorded)

Virtual debrief: the product has the right substrate and the right
routes, but the main screens still ask the evaluator to think like a
builder. The redesign should not add new features. It should make the
existing loop feel like a familiar admin workspace: record summary,
integration manager, action panel, artifact/result viewer, and
activity/audit timeline.

## Substrate findings (forwarded to backlog)

Any finding that's caused by substrate behaviour, not UI, gets
mirrored into [`PHASE_17_SUBSTRATE_BACKLOG.md`](./PHASE_17_SUBSTRATE_BACKLOG.md)
with the finding number from this doc as the source.

## Reviewer signoff

Reviewer reads this virtual pass, accepts the non-cold limitation,
and tags this file as enough to begin Phase 17. A later real
solicitor/legal-ops pass remains required before public launch or
design-partner outreach.

- **Reviewer signoff date:** pending
- **Phase 17 build order** (filled in by reviewer after signoff):
  1. 17A — Matter detail / action panel (MD-1, MD-2, MD-3, MD-4)
  2. 17B — Modules / integrations manager (MOD-1, MOD-2, MOD-3, MOD-4)
  3. 17C — Audit reconstruction / oversight timeline (AUD-1, AUD-2, AUD-3, AUD-4)
