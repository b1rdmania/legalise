# Phase 17 — Information Architecture redesign (PLAN)

**Status:** plan v1, awaiting reviewer redline. Supersedes the
screen-by-screen framing of `PHASE_17_CRM_ERGONOMIC_PLAN.md` — that
plan named three target screens (matter / modules / audit) but the
production walkthrough proved the problem is one level deeper: **the
shell that contains every screen is incoherent.** Fix the shell first;
the screens fall out of it.

## Why this, and why now

The real production walkthrough (2026-05-28, `legalise.dev`) surfaced
that we have **multiple competing navigation systems layered on top of
each other**, in Andy's words: "you've plugged the user stuff on top
and in other weird places rather than a coherent design choice… too
many competing links… everything really should be left bar… not have
a user mess above it."

Concretely, today there are at least four overlapping nav surfaces:

1. **Top nav** — `Matters · Modules · Settings · Admin · [user menu]`.
2. **Landing CTAs** — `Open demo matter · All matters · Modules` (a
   second set of links to the same places).
3. **Matter left-nav** — `Assistant · Documents · Chronology ·
   Workflows · Audit` (a third nav, scoped to a matter).
4. **Right-rail assistant** — competes with the main content.

Plus the user/account controls are scattered top-right and the signed-
in state still shows the marketing landing. There is no single answer
to "where am I, what can I do, where does my account live." Spot-fixing
any one screen (which is what we started doing — tag box, modules 401,
resend button) just tidies a corner of an incoherent whole.

**The discipline we briefly abandoned:** Phase 17 was always meant to
be walkthrough → coherent redesign → build. The walkthrough is done
(on production, real). This plan is the coherent redesign. No more
layering.

## Research basis (Mobbin, 2026-05-28)

Searched B2B SaaS web shells. Asana, Whop, Fibery, Replit all converge
on the same model; Webflow/Mixpanel use the weaker top-right account
menu (the thing we accidentally built). The convergent pattern:

- **One persistent left sidebar**, full height.
- **Top of sidebar:** brand / workspace identity.
- **Middle:** grouped primary surfaces (often with section labels).
- **Bottom of sidebar (pinned):** account / settings / help / sign out.
- **Main area:** the selected surface; records open here.
- **Right rail:** contextual, secondary, collapsible (Asana goals,
  Whop people) — never the default focus.

Reference screens (Mobbin): Asana, Whop, Fibery, Replit web shells.

**Legal / record-page + folder references** (second Mobbin pass —
Harvey/Legora weren't in the index, but close analogues were):

- **Origin** (estate-planning, the closest legal-adjacent match): a
  **record opens as its own homepage** with record-level tabs
  (Overview / Summary / Documents), and the Documents view groups
  files under labeled sub-headers ("ESTATE PLAN DOCUMENTS" /
  "SUPPORTING DOCUMENTS") with consistent status badges. The
  assistant is a small "Ask anything" pill bottom-left — contained,
  not a dominant rail. This is almost exactly the matter-as-homepage
  shape we want.
- **PandaDoc / ClickUp:** left sidebar with **Folders** (Proposals →
  subfolder) and Spaces — the "sub-sections / folders for organising"
  pattern.
- **Sana AI:** assistant with "Sources"/"Doc" chips as a contained
  surface, not the page focus.

## The target IA

### Two distinct shells, cleanly separated

1. **Marketing shell (logged-out):** landing, manifesto, docs, GitHub,
   `Sign in` / `Create account`. No app chrome. This is the public
   site. A logged-in user who hits `/` is redirected into the app
   shell (resolves the "signed-in user sees marketing landing"
   finding).

2. **App shell (logged-in):** the persistent left sidebar + main area.
   This is the product. One nav system, not four.

### The app-shell left sidebar (single source of navigation)

```
┌─────────────────────┐
│ ◧ legalise          │  brand (→ app home)
│                     │
│ WORKSPACE           │  section label
│  ▸ Matters          │  primary surfaces
│  ▸ Modules          │
│  ▸ Audit            │
│                     │
│ ───────────────     │
│  ⚙ Settings         │  (provider keys, default model, account)
│  ⛨ Admin            │  (superuser only — users, roles)
│                     │
│ (spacer)            │
│ ┌─────────────────┐ │
│ │ A  Andy        ⌄│ │  account menu pinned BOTTOM-LEFT
│ └─────────────────┘ │  (name, sign out, account) — NOT top-right
└─────────────────────┘
```

- **No top nav.** The current `Matters/Modules/Settings/Admin/user`
  top strip is removed; everything lives in the left sidebar. Kills
  the "competing links" problem (L-4 + the user-mess finding).
- **Account is bottom-left** (Asana/Whop pattern), not a scattered
  top-right menu.
- **Admin** only renders for superusers.

### Surfaces open in the main area

- **Matters** → list → click a matter → matter **record page** opens
  in main, **as its own homepage** (Origin pattern) — not squeezed
  into a header strip at the top of a generic page. The matter's
  sub-navigation (Overview / Documents / Chronology / Workflows /
  Audit / Assistant) is **record-level**, inside the main area — it
  does not compete with the global sidebar. Default landing sub-view
  is the matter **Overview/record**, NOT the assistant chat (MD-2).
  Documents are grouped under labeled sub-headers with consistent
  status badges (Origin's "ESTATE PLAN / SUPPORTING" → ours could be
  "PLEADINGS / DISCLOSURE / CORRESPONDENCE" etc.).
- **Modules** → the **marketplace home** (public catalog, loads
  without per-user auth — resolves MOD-1's 401). Installed vs available
  shown here. Click a module → detail / trust ceremony. **Module
  actions for a matter** (grant / run) live on the matter record's
  "Matter actions" panel, not here — clear separation of "browse the
  catalog" vs "act on this matter."
- **Audit** → workspace-level oversight timeline.
- **Settings** → provider keys, default model, account basics.
- **Admin** → users, roles (superuser).

### The assistant becomes contextual, not central

- Assistant is a **collapsible right rail** on the matter record, and
  a full view only when explicitly opened. It is never the default
  focus of a freshly-opened matter (MD-2). The record content leads.

## How the walkthrough findings resolve (consequences, not patches)

| Finding | Resolved by the IA, because… |
| --- | --- |
| Landing shown when signed in | Marketing/app shell separation → signed-in redirect to app shell. |
| L-4 + "user mess on top" | Single left sidebar; account pinned bottom-left; no top nav. |
| MD-2 assistant dominates | Record leads in main; assistant is a collapsible right rail, not the default tab. |
| MOD-1 modules 401 | Modules home uses the public catalog; it's a browse surface, not a per-user authed view. |
| MD-3 tag box / stale waitlist copy | Falls out of the matter-record redesign (the record page owns its own clean layout; waitlist-era copy removed in the pass). |
| "too many competing links" | One nav system replaces four. |

The point: these were never six fixes. They are six **symptoms of one
missing decision** — the shell. Make the shell, they resolve together.

## Organisation: sub-sections / folders

The walkthrough raised that flat lists won't scale — matters and
modules both need structure (PandaDoc/ClickUp folders pattern).

- **Matters:** a flat matters list is fine for v1 (one demo matter),
  but the IA should anticipate **folders / grouping** (by client, by
  status, by practice area) so the list view has a place to grow.
  Build the list with a grouping affordance even if v1 ships one
  group.
- **Modules:** the marketplace shouldn't be a flat grid. **Sub-section
  modules** by category (e.g. Employment / Litigation / Research,
  matching the `claude-for-uk-legal` suites) and by installed-state
  (Installed / Available). This also makes "what can I run on this
  matter" legible.
- **Within a matter:** documents grouped by tag/disclosure status
  (Origin pattern), not a flat table.

Folders as a *data* feature (persisted, user-created) is likely
post-v1 (it may touch substrate). For this IA pass, the requirement
is **the layout has labeled groups / sub-sections**, even if the
grouping key is fixed (category, tag, status) rather than
user-defined folders. User-defined folders → substrate backlog.

## Visual consistency: one density, Audit is the reference

A real finding from the walkthrough: **box sizing leaks across the
app** — some surfaces use small boxes, some big, with no rule. The
**Audit page has the right density** (per Andy) — it's the canonical
reference.

The IA pass must establish and apply a single density system:

- Pick the Audit page's box/row/padding scale as the baseline.
- Every surface (matters list, matter record, modules, settings)
  uses the same card/row/section primitives at the same scale.
- Extract shared layout primitives (section, card, row, stat) so a
  screen can't drift. No more bespoke per-screen box sizing.

This is structure + shared primitives, not a re-token — the colours
and type scale don't change, only their consistent application.

## Sub-step order (proposed)

1. **17-IA-A — the app shell + shared primitives.** Build the
   persistent left sidebar + main-area layout + bottom-left account
   menu. Remove the top nav. Marketing/app shell split + signed-in
   redirect. **Extract the shared layout primitives at the Audit
   page's density** (section / card / row / stat / page-header) so
   every later sub-step builds on one density system, not bespoke
   boxes. This is the foundation; every screen renders inside it.
2. **17-IA-B — matters in the shell.** Matters list + matter record
   page (record leads, sub-nav record-level, assistant as right rail).
3. **17-IA-C — modules in the shell.** Marketplace home (public
   catalog) + module detail; matter-level actions stay on the record.
4. **17-IA-D — audit + settings + admin in the shell.** Oversight
   timeline; settings (keys/model/account); admin (users/roles).
5. **17-IA-E — acceptance walkthrough.** Re-walk the eight DEMO.md
   steps on production; confirm one coherent nav, no orphan links.

Each sub-step ratifies independently. Routes stay working throughout
(no broken deep links).

## Explicitly out of scope

- **No substrate change.** `backend/app/**`, `backend/alembic/**`,
  `schemas/**`, `examples/modules/**` are untouched. This is pure
  frontend IA + layout. (If the shell needs an endpoint that doesn't
  exist — e.g. a public-modules shape mismatch — log it to the
  substrate backlog, don't fix it inline.)
- **No new visual system / re-token / brand change.** Reuse existing
  tokens (paper/ink/seal, the type scale). This is structure, not
  decoration.
- **No new features.** Same surfaces, same capabilities — just one
  coherent way to reach them.
- **No marketing-copy rewrite** beyond removing stale waitlist-era
  strings that leak into the app surface.

## Non-negotiables carried forward

- Audit raw rows stay accessible; substrate vocabulary unchanged.
- Phase 15 e2e stays green; deep-link routes keep working.
- The governance surfaces (posture, grants, audit) stay first-class —
  the IA must make them *more* legible, never hide them.

## Decisions (ratified by Andy 2026-05-28)

1. **App home:** light **dashboard** (recent matters + recent audit),
   not a bare matters list.
2. **Matter sub-nav:** **everything in the sidebar.** No main-area
   tabs. The global sidebar persists; opening a matter expands its
   sub-sections (Overview / Documents / Chronology / Workflows /
   Audit / Assistant) as a nested group in the sidebar. Main area
   shows only the selected section's content.
3. **Modules:** public-catalog render rewrite approved (frontend only).
4. **Scope:** **full shell**, all surfaces wired, before the
   acceptance walk.
5. **Mobile:** in scope; sidebar collapses to a drawer.

## Original open questions (now resolved above)

1. **App home.** When a signed-in user lands, what's the default
   surface — Matters list, or a light dashboard (recent matters +
   recent audit)? Plan leans **Matters list** (simplest, no new
   data) for v1; dashboard later.
2. **Matter sub-nav placement.** Record-level tabs *inside* the main
   area (proposed), or a nested second sidebar column (Fibery-style)?
   Plan proposes tabs-in-main to avoid a two-sidebar layout on a legal
   record. Reviewer call.
3. **Modules public-catalog shape.** `getPublicModules()` returns
   `{skills[], broken[]}`, a different shape than the authed
   `getModulesV2()` the page renders today. The marketplace home needs
   a small render rewrite to consume the public shape. Confirm that's
   acceptable (no backend change needed — the endpoint exists).
4. **Scope of v1 shell.** Ship the shell with all surfaces wired
   (17-IA-A..D) before the acceptance walk, or ship the shell + Matters
   first and iterate? Plan proposes the full shell, since a half-migrated
   shell reintroduces the "competing nav" problem.
5. **Mobile.** The current matter nav has a mobile drawer. Does the new
   sidebar collapse to a drawer on mobile (standard), or is mobile out
   of scope for v1? Plan: collapse-to-drawer, standard.

## What this is NOT

Not a visual redesign, not a rebrand, not new features. It is the
**one structural decision** the product has been missing: a single
coherent shell, so every screen has an obvious home and the user
always knows where they are and where their account lives. Everything
the walkthrough flagged is downstream of this.
