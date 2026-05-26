# Phase 13 Build Plan v2 — Product Surface Specification

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `f03de48` (Phase 12 follow-ups; sweep 676/8)
**Supersedes:** Phase 13 v1 (in this same file, pre-redline).
**Goal:** Produce the blueprint for the finished app. No frontend code. The deliverable is a written spec dense enough that Phase 14 (foundation) and Phase 15+ (feature surfaces) can build against it without re-deciding any user-journey, page, or contract question.

The spec is **the source of truth** Phase 14+ implements. Reviewer red-lines the spec the same way every prior phase has been red-lined — before Phase 14 touches a tsx file.

---

## What "no implementation" means

The phase ships **markdown only**:

- Journey documents (one per major user journey)
- Page map + route table
- API contract per page
- Audit-emission map
- Posture-gate UX matrix
- Backend gap audit (READ-only — verifies existing endpoints; does NOT add any)
- Frontend stack appendix
- Acceptance criteria

**No backend code is touched.** Not even TODO comments. Gap-audit findings are recorded as structured entries in `docs/spec/BACKEND_GAP_AUDIT.md`; if a gap requires a real endpoint to land, it becomes a Phase 13b plan (a small bridging substrate phase between 13 and 14). The Phase 13 spec itself names but does not implement, and does not annotate.

(Reviewer Phase 13 v1 P1 — earlier draft said "only allowed code-side change is gap-audit annotations" which contradicted the acceptance criteria. v2 drops the carve-out entirely; the gap audit is markdown-only.)

---

## Scope

**In:**
- All 12 user journeys listed below, written end-to-end
- Page map covering 9 surface categories
- API contract per page (endpoint, request, response, errors, empty/loading)
- Page-level audit emission map (every user action → audit row or explicit "none")
- Posture-gate UX matrix (3 postures × 3 roles)
- First-run / empty-state journey
- Reconstruction deep-link policy
- Backend gap audit — verify 5 endpoint categories exist; any miss becomes a finding
- Frontend stack tradeoffs appendix
- Design inheritance reference (no new visual system)
- Acceptance criteria for the whole product loop

**Out (KISS / deferred):**
- Pixel-perfect mocks — written wireframes only
- Component library — Phase 14 inherits existing brand seal
- Performance / accessibility targets — Phase 15+ per surface
- Internationalisation — out
- Mobile / responsive specifics — desktop-first; Phase 15+ adds responsive where it matters
- Animation / motion design — out
- Phase 13 does not name a stack (the appendix is tradeoffs, not a decision)
- Marketing site copy / manifesto page — `legalise.dev` already shipped with the brand seal + Warp grid; this spec is the **authenticated app surface**, not the public landing. The two never overlap in Phase 13.

---

## Pre-build findings

The substrate is dense; the spec leans heavily on what exists. Quick map:

| Surface | Phase | Public path | Status |
| --- | --- | --- | --- |
| Auth (register/login) | pre-rewrite | `POST /auth/register`, `POST /auth/login` | exists |
| Module install ceremony | 3 + 4 | `POST /api/modules/install`, `.../advance` | exists |
| Per-user matter-scoped grants | 7 | `POST/DELETE/GET /api/matters/{slug}/grants` | exists |
| Posture gate | 8 | substrate primitive | exists |
| Invocation | 10 | `POST /api/matters/{slug}/invocations` | exists |
| Reconstruction view | 5 | `GET /api/matters/{slug}/audit/reconstruction` | exists |
| Admin role mutation | 11 | `POST /api/admin/users/{user_id}/role` | exists |
| First-admin bootstrap | 12 | `python -m app.tools.bootstrap_admin` | exists |

The known-likely-gaps the spec will probe:

| Surface the UI needs | Endpoint expected | Phase 13 verifies |
| --- | --- | --- |
| BYO model key management | `POST/DELETE/GET /api/settings/keys` | TBD |
| Module catalog / discovery | `GET /api/modules/catalog` or `/api/modules/installed` | TBD |
| Artifact listing per matter | `GET /api/matters/{slug}/artifacts` | TBD |
| Artifact read | `GET /api/matters/{slug}/artifacts/{id}` | TBD |
| Matter listing | `GET /api/matters` | exists (Phase pre-rewrite) |
| Matter create | `POST /api/matters` | exists |
| User self-info | `GET /auth/users/me` or similar | TBD |

Any TBD that turns out missing becomes a Phase 13 finding — named in the spec, fixed in a small Phase 13b substrate phase, then Phase 14 starts.

### Architectural decisions taken pre-spec

**Decision #1 — Single-page app, not server-rendered.**

The substrate is a JSON API. A SPA consuming it is the path of least friction. Server-rendered HTML would couple the frontend lifecycle to the FastAPI app's render concerns; the substrate stays clean if the frontend is a separate static-served artifact.

This is a stack-shape decision the spec confirms but doesn't pick the SPA framework. Phase 14 picks (the appendix narrows it).

**Decision #2 — Desktop-first.**

The substrate is admin/legal-workflow shaped; the user-base is solicitors at desks. Phase 15+ adds responsive treatments only where they matter (probably the reconstruction view + the matter list, which need to be glanceable on a phone). Other surfaces stay desktop.

**Decision #3 — One spec per journey, not per page.**

Pages are derived from journeys; spec primary unit is the journey. Each journey doc names its pages, its API calls, its state changes, its audit emissions, and its acceptance criteria together. Page map exists as an index, not the source of truth.

**Decision #4 — Audit emissions are part of the UI contract.**

Every user action documents the audit row it causes (or explicitly says "none"). This binds the frontend to the audit story. A button that emits no audit row is a deliberate choice the spec records; a button that *should* emit one but doesn't is a finding.

This is the rule that keeps the "supervised autonomy" claim load-bearing in the UI, not just the backend.

**Decision #5 — Backend gap audit is structured.**

Verify existence by reading the code. For each expected endpoint, name the file + line. If present, link it. If absent, file a finding with the endpoint shape proposed. Findings become a Phase 13b backlog Reviewer decides between (close now / defer / merge into Phase 14).

**Decision #6 — Design inheritance referenced, not redefined.**

Existing brand seal tokens (#8B0000 accent, signature Lottie, Warp 6-card grid, Inter + Newsreader stack per `~/.claude/projects/-Users-andy/memory/legalise-brand-seal.md`) are the visual baseline. Phase 13 references; Phase 14 inherits; Phase 15+ extends only where a real product need surfaces.

**Decision #7 — Spec is the red-line surface.**

Same discipline every prior phase used: Reviewer reads the spec, names findings, builder patches. Phase 14 starts only on a ratified spec. The cost of redirect on a markdown doc is zero; the cost of redirect on a half-built shell is days.

---

## Critical path

```
Step 1: Page map + route table (the index)
   ↓
Step 2: All 12 journey docs (one MD file each)
   ↓
Step 3: Audit emission map (cross-references journey actions)
   ↓
Step 4: Posture-gate UX matrix
   ↓
Step 5: First-run / empty-state journey (special — the eval-mode story)
   ↓
Step 6: Backend gap audit (READ existing code; name findings)
   ↓
Step 7: Frontend stack appendix
   ↓
Step 8: Acceptance criteria (whole-product loop)
   ↓
Step 9: Phase 13 handover for Reviewer red-line
```

~3-4 days of writing. No code.

---

## Step 1 — Page map + route table

**File:** `docs/spec/PAGE_MAP.md` (new)

Nine surface categories. Each row:
- route
- intended journey(s) it serves
- API calls it makes
- per-surface state model
- which other pages link to it

The nine categories:

| Category | Sample routes | Primary journey |
| --- | --- | --- |
| App home (authenticated entry / first-run) | `/app` (or `/` of the SPA build) | first-run / post-login redirect target |
| Auth | `/auth/register`, `/auth/login` | login/signup |
| Settings | `/settings`, `/settings/keys`, `/settings/profile` | BYO key setup |
| Matters | `/matters` | matter list / open Khan |
| Matter workspace | `/matters/{slug}` | the central work surface |
| Modules | `/modules`, `/modules/install`, `/modules/{module_id}` | install + grant flow |
| Artifacts | `/matters/{slug}/artifacts`, `/matters/{slug}/artifacts/{id}` | inspect outputs |
| Reconstruction / oversight | `/matters/{slug}/audit` | inspect audit trail |
| Admin | `/admin/users`, `/admin/users/{id}/role` | role promotion |

The matter workspace `/matters/{slug}` is the load-bearing surface — most journeys pass through it. The spec treats it as a hub with installed-modules + artifacts + reconstruction-link panels.

**App home vs marketing landing.** The "App home" row above is the **authenticated entry / first-run screen** inside the SPA — the page a logged-in user sees by default, and where a fresh-fork evaluator lands after the first-admin bootstrap. The public marketing site at `legalise.dev` (with the manifesto / brand seal / Warp 6-card grid copy) is already shipped and is **not** Phase 13's concern. Phase 13 specs the app only; if a Phase 15+ feature needs an in-app link out to the marketing page, that's a single anchor, not a spec deliverable.

~80 lines.

---

## Step 2 — Journey docs

**Directory:** `docs/spec/journeys/` (new, ~12 files)

One file per journey. Each follows a fixed template:

```markdown
# Journey: <name>

## Preconditions
What must be true before the journey starts (e.g. user is authenticated, matter exists)

## Goal
The single outcome the user is trying to achieve

## Trigger
What action begins the journey

## Steps
Numbered list. Each step:
- WHAT the user sees (page, component, state)
- WHAT the user does (click, type, etc.)
- WHAT the system does (API call, state transition, audit row)
- ERROR / EMPTY / LOADING variants

## Audit emissions
Cross-ref to the audit map (Step 3)

## Acceptance criteria
The journey is complete when:
- [ ] criterion 1
- [ ] criterion 2

## Not covered (out of scope this phase)
Explicit list — Phase 15+ may revisit
```

The 12 journeys:

1. **Fresh fork / first run** — evaluator clones, runs `docker compose up`, opens the landing, sees the "register first admin" prompt, walks through bootstrap CLI invocation (with copy-paste), lands on a first-admin dashboard.
2. **First admin bootstrap** — register → run CLI → log in → see empty workspace.
3. **Login / signup** — register an additional user; log in; password reset (?).
4. **BYO key setup** — settings → add Anthropic key → confirm stored. The "you cannot use modules until you set this" guard.
5. **Open Khan matter** — matter list → click "Khan v Acme" → land on matter workspace.
6. **Install module** — modules page → "Install Contract Review" → trust ceremony walkthrough → 3 trusts + 1 grant → installed state.
7. **Trust ceremony** — the in-ceremony detail (the 4 advance clicks, the permission card, the signed-by display).
8. **Grant permissions** — matter workspace → "Enable Contract Review on this matter" → confirms → grants land matter-scoped.
9. **Invoke Contract Review** — pick a document → click Review → progress / loading state → results + artifact links.
10. **Invoke Pre-Motion** — pick claim type + documents → click Draft → results + two artifacts.
11. **Inspect artifacts** — artifact list per matter → click → render the JSON pack as a readable structure.
12. **Inspect audit reconstruction** — matter workspace → "See audit trail" → reconstruction table with filters → drill into a row.

Plus one special journey covered separately at Step 5 (first-run / empty-state, which overlaps with journey 1+2).

~150 lines per journey × 12 = ~1,800 lines total. Long but each is self-contained.

---

## Step 3 — Audit emission map

**File:** `docs/spec/AUDIT_EMISSION_MAP.md` (new)

A table keyed by user action. Each row:

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| Click "Register" | /auth/register | POST /auth/register | `auth.user.registered` | substrate already emits |
| Click "Install Contract Review" | /modules | POST /api/modules/install | `module.installed` | trust ceremony progress audited per step |
| ... | ... | ... | ... | ... |

For each entry, either:
- name the substrate audit action that lands (cross-ref to `app.core.api.audit.log` call sites)
- explicitly say `none` with a justification

Decision #4 said audit emissions are part of the UI contract. A button that emits no audit row is a deliberate decision the spec records.

~150 lines.

---

## Step 4 — Posture-gate UX matrix

**File:** `docs/spec/POSTURE_GATE_UX.md` (new)

A 3-posture × 3-role matrix. For each cell:
- what the user sees in the matter workspace (full UI / partial / banner / blocked)
- what happens when they try to invoke a capability (allowed / 403 with posture body)
- where the denial deep-links to (reconstruction filter? settings? "request role" form?)

| | `A_cleared` | `B_mixed` | `C_paused` |
| --- | --- | --- | --- |
| `any_authenticated` | full UI | banner "B_mixed — solicitor required to invoke"; modules grey but visible | banner "matter paused — read-only" |
| `qualified_solicitor` | full UI | full UI | banner "matter paused — read-only" |
| `workspace_admin` | full UI | full UI | banner "matter paused — read-only" |

Plus the denial deep-link policy: on a posture block from `POST /invocations` (HTTP 403 `posture_gate_blocked`), the UI renders a structured banner with the `required_role`, `actor_role`, and a link to `/matters/{slug}/audit` filtered to `posture_gate.check.blocked` so the user can see their own denial in the trail.

~60 lines.

---

## Step 5 — First-run / empty-state journey

**File:** `docs/spec/journeys/00_first_run.md` (new)

Cross-references journey 1 + 2 above but treats the **fork experience** as a first-class deliverable. The narrative for someone who:
- clones the repo
- runs `docker compose up`
- opens the landing page
- sees ZERO modules, ZERO matters, NO admin yet

What does the landing look like? Probably:

- A "Welcome" panel that detects (via `GET /auth/users/count` or similar — possible gap) that no users exist yet
- Instructions for the first registration + bootstrap CLI invocation
- Once first admin lands: empty matters list with a "Create your first matter" CTA + an "Install your first module" CTA
- After Khan v Acme is seeded (current behaviour): matters list shows Khan as the entry point

The "hosted-eval mode" path covers the same shape but pre-seeded. Spec describes the flag (env var or DB row) that distinguishes them.

This journey is the open-core release narrative made concrete.

~100 lines.

---

## Step 6 — Backend gap audit

**File:** `docs/spec/BACKEND_GAP_AUDIT.md` (new)

For each endpoint category the spec needs, verify by reading code. Format:

```markdown
### BYO model key management

Expected endpoints:
- POST /api/settings/keys — store an encrypted user provider key
- GET /api/settings/keys — list configured providers (no plaintext)
- DELETE /api/settings/keys/{provider} — revoke

**Verification result:**
- [ ] `POST /api/settings/keys` — found at `backend/app/api/settings.py:LINE` / NOT FOUND
- [ ] `GET /api/settings/keys` — found at ... / NOT FOUND
- [ ] `DELETE /api/settings/keys/{provider}` — found at ... / NOT FOUND

**Finding (if any):**
- Phase 13b: implement missing endpoints OR confirm a separate phase
```

Five categories to audit:
1. BYO key management (`UserApiKey` model exists; HTTP surface TBD)
2. Module catalog / discovery
3. Artifact listing / read per matter
4. User self-info (`GET /auth/users/me` for the frontend's "who am I" call)
5. Workspace-broad user listing for admin page (`GET /api/admin/users`?)

Each verified endpoint links to its file:line. Each gap becomes a structured finding the spec carries forward.

~100 lines.

---

## Step 7 — Frontend stack appendix

**File:** `docs/spec/STACK_APPENDIX.md` (new)

Comparative table. Four candidates:

| Stack | Bundle | Maturity | Ecosystem | Project fit |
| --- | --- | --- | --- | --- |
| Plain HTML + `fetch` | smallest | n/a | n/a | works for <5 pages; this app has >9 |
| Vite + React | small | high | huge | consistent with Decipher / Firestar / Visible |
| SvelteKit | smaller bundle | medium | medium | less library reach |
| Next.js | largest | high | huge | SSR / RSC features unused; overkill for SPA |

Recommendation language: "Phase 14 likely picks **Vite + React** for stack consistency across Andy's projects, but the appendix doesn't lock it; Phase 14's first task is to confirm or override." This keeps the decision deferred but pre-analysed.

~40 lines.

---

## Step 8 — Acceptance criteria

**File:** `docs/spec/ACCEPTANCE.md` (new)

The whole-product loop. Andy's words, verbatim where possible:

- A fresh evaluator can go from registered user to running a module and viewing its reconstruction trail
- No direct DB manipulation
- No curl-only step except first-admin bootstrap CLI
- No unsupported marketing claim

Plus criteria the journey docs accumulated:

- Every documented journey is achievable through the implemented UI without dropping to DB or curl
- Every documented user action lands the documented audit row
- Posture gate denial is visible + actionable in the UI
- Reconstruction is deep-linkable from every relevant page

~40 lines.

---

## Step 9 — Phase 13 handover

`HANDOVER_PHASE_13_PRODUCT_SURFACE_SPEC_DONE.md` covers:
- The seven architectural decisions for Reviewer ratification
- Total file count + line count delivered
- Findings from the backend gap audit (Phase 13b backlog)
- Phase 14 entry-point: which file is the source of truth for which question
- Hand-off line for Reviewer

---

## Out of scope (intentional)

- Pixel-perfect Figma mocks — written wireframes only
- Bespoke component library — Phase 14 picks based on stack
- Animation / motion design — out
- Internationalisation — out
- Accessibility audit deep-dive — Phase 15+ per surface
- Mobile-first — desktop-first; Phase 15+ adds responsive where it matters
- Performance budgets — Phase 15+
- Marketing site copy — `legalise.dev` shipped; this spec is the app
- Frontend testing strategy — Phase 14 picks (Playwright vs Vitest vs Cypress)
- Storybook / component dev environment — Phase 14 picks
- New substrate endpoints — found gaps go to Phase 13b
- Stack pick — Phase 14 confirms or overrides the appendix's lead

---

## Acceptance criteria for Phase 13 itself

- [ ] All 12 journey docs written end-to-end
- [ ] Page map covers all 9 surface categories
- [ ] API contract attached to every page row
- [ ] Audit emission map covers every documented user action
- [ ] Posture-gate UX matrix complete for 3 postures × 3 roles
- [ ] First-run journey describes the fork experience explicitly
- [ ] Backend gap audit verified by file:line links; gaps listed
- [ ] Stack appendix names 4 candidates + tradeoffs
- [ ] Acceptance criteria written
- [ ] Handover doc for Reviewer
- [ ] Zero backend code changes (gap findings are markdown only)

---

## Reviewer redlines applied (v2)

1. **P1 — Markdown-only, no code annotations.** v1 carved out "gap-audit annotations" as an allowed code touch, which contradicted the acceptance criterion of "Zero backend code changes". v2 drops the carve-out entirely. Gap-audit findings are recorded in `docs/spec/BACKEND_GAP_AUDIT.md`; no TODO comments, no annotations, no backend file is touched.

2. **P2 — App home vs marketing landing separated.** v1 page map row read "Landing / manifesto entry" which collided with the scope rule "marketing site copy is out". v2 renames the row to "App home (authenticated entry / first-run)" and adds a clarifying paragraph: Phase 13 specs the **authenticated app surface**, not the public `legalise.dev` landing. The two never overlap in Phase 13; if a Phase 15+ feature needs an in-app anchor out to the marketing page, that's a single link, not a spec deliverable.

---

*End of Phase 13 build plan v2. Builder commits this, then starts Step 1 on Reviewer's greenlight.*
