# Phase 17 — CRM-Ergonomic UI Pass (PLAN)

**Status:** plan v1, awaiting reviewer redline.
**Branch:** `phase-17-crm-pass` off master @ `a364952`.
**Bar:** the existing routes feel like a familiar CRM/admin workspace
to a cold evaluator. Boring, dense, scannable, operational. No new
substrate, no new modules, no marketing surface.

## Why this is a phase, not a vibe-driven UI tweak

Phases 14 / 14.5 / 15 / 16 closed the operator layer at the
**functional** level — the surfaces exist, the audit trail is
honest, a fresh fork can clone-to-smoke. What we have not yet done
is verify that the surfaces feel **coherent and operational** when
a cold evaluator opens them with no verbal coaching.

Three forces push toward this being a phase now:

1. The substrate is stable. Substrate-level redesign would
   contaminate UX feedback with substrate churn.
2. The next thing we expose to evaluators (YC, SRA, design partners,
   forkers) is the UI, not the substrate. Substrate quality is
   irrelevant if the screens confuse them in the first 90 seconds.
3. Pattern drift is cheaper to fix before the next two reference
   modules land — every new module that adopts a bespoke layout
   creates a future migration cost.

The discipline: **familiar CRM ergonomics over bespoke UI**,
without compromising Legalise's bespoke governance substrate.

## Principle

> Boring is the feature. A user who has used Salesforce, Linear,
> Notion admin, or any standard SaaS admin should immediately
> recognise where they are and what to do. The audit substrate
> stays bespoke; the chrome around it should not be.

## Step 0 — Cold walkthrough is the spec

Phase 17 does not start with redesign. It starts with a documented
cold walkthrough. The walkthrough output **is** the design spec —
without it, the redesign becomes taste-driven inside the first three
screens.

### What lands

A named non-engineer (Reviewer's choice; not Andy, not the
maintainer) follows `docs/DEMO.md` end-to-end on a fresh local fork.
Recorded screen-share. No operator on the call to coach. Per-screen
the recorder captures:

- What they expected the screen to do.
- What confused them (specific copy, specific element, specific
  missing affordance).
- What they could not do without coaching.
- Click counts, back-button counts, "where's…?" pauses (count, with
  timestamps).

Output: `docs/handovers/PHASE_17_COLD_WALKTHROUGH.md`. Numbered
findings per screen. Each finding is the spec for one redesign sub-task.

### Why it cannot be skipped

Without it, "make it feel like a CRM" becomes 14 routes of taste.
With it, every redesign decision answers to an observed friction
point in the walkthrough doc. The Reviewer can hold the doc up
against any redesign and ask: "which numbered finding does this
close?"

## Scope — three screens, not fourteen

A "consistent loading/error/empty state" sweep across 14 routes is
a three-week project that ships nothing visible. Phase 17 names
**three screens** as the build scope — the ones that most affect
cold-evaluator trust based on the demo runbook's load-bearing path:

### Screen 1 — Matter detail (`/matters/$slug`)

The account/opportunity-style record page that anchors the demo.
This is the screen the cold evaluator stares at longest. Currently
its information density is uneven; the grants panel reads like a
config file, not an operations surface; document list / artifact
list / chronology feel like separate apps stitched together.

Target shape: a single dense record-page layout with the matter's
state legible at a glance (parties, posture, retention clock,
counsel, grants summary), and a tabbed-or-paneled body for
documents / chronology / grants / artifacts / audit. Modeled on
Salesforce / Linear / HubSpot record pages.

### Screen 2 — Modules page (`/modules`)

The integrations marketplace / admin page. Currently it's a
catalog grid that doesn't distinguish installed vs available, and
the trust ceremony flow reads as bespoke. Cold evaluators will
expect this to look like the admin → integrations panel of any
SaaS they've used.

Target shape: two-column layout (installed | available), badge
states for ceremony progress, install ceremony as a stepper inside
a modal (not a route change). Pre-Motion + Contract Review as the
first two installed.

### Screen 3 — Audit reconstruction (`/matters/$slug/audit` + `/admin/audit`)

The regulator-facing record. This is the surface that proves
Legalise is what it says it is, but currently the timeline reads
as a developer dump — substrate vocabulary verbatim, no scannable
column structure, filter chips above an unstyled list.

Target shape: activity-timeline (Linear-style) with grouped rows
(invocation chains collapsed by default, expand to see the model
call + advice boundary + completion), source-pill chips, filter
chips that survive page reload, link-out to artifact viewer
where relevant. Substrate vocabulary stays — this is the
regulator surface — but the chrome makes it readable.

### Why these three and not the others

The remaining routes (admin/users, matters list, artifacts,
modules detail, settings, jobs) all matter, but the walkthrough
will surface their priority. If the cold walkthrough finds that
`/admin/users` is more confusing than `/modules`, scope reshuffles.
The three above are the **starting** scope, not the locked scope.

## Acceptance bar — measurable, not narrative

"Cold evaluator can do X without coaching" is the right shape but
unverifiable as written. The Reviewer's acceptance bar:

> A named non-engineer, in a recorded screen-share, completes the
> eight steps of `docs/DEMO.md` end-to-end with no operator on the
> call. We count clicks, back-button presses, and "where's…?"
> pauses for the three redesigned screens. The redesign is
> ratifiable when the numbers are at least 40% lower than the
> baseline walkthrough on each metric, and the same evaluator
> reports the screens "feel familiar" in their post-walkthrough
> debrief (recorded).

Two walkthroughs total: one before (the cold walkthrough that
produces the spec), one after (the acceptance run). Numbers
published in `PHASE_17_COLD_WALKTHROUGH.md` and
`PHASE_17_ACCEPTANCE.md`. The reviewer holds both docs against
the redesign.

## Pulse Talent reference rule

Pulse Talent's Base44 + shadcn stack and Legalise's TanStack Router
+ Tailwind stack share visual grammar but not primitive choices.
The constraint is one-way:

- Borrow: layout grammar, density choices, sidebar IA, table
  styling, modal usage patterns, empty-state shapes, status pill
  conventions.
- Do not borrow: components, libraries, hooks, state-machine
  patterns, anything that touches the rendering pipeline.

The reviewer's tripwire: any PR in Phase 17 that imports from
`@base44/*`, `shadcn`, or vendors components copied from Pulse
Talent without re-implementation is out of scope.

## Sub-step order

Mirroring the Phase 16 cadence: each sub-step is its own PR /
commit family; each ratifies independently.

1. **Step 0 — cold walkthrough.** Reviewer commissions a
   non-engineer; recording + writeup; produces
   `PHASE_17_COLD_WALKTHROUGH.md`. Phase 17 does not advance
   without this artifact.
2. **17A — matter detail redesign.** Targets the screen with
   the highest dwell time in the walkthrough.
3. **17B — modules page redesign.** Targets the installed-vs-
   available + ceremony confusion the walkthrough will surface.
4. **17C — audit reconstruction redesign.** Activity-timeline
   restructure; substrate vocabulary preserved.
5. **17D — acceptance walkthrough.** Same evaluator, fresh fork,
   record numbers; publish `PHASE_17_ACCEPTANCE.md`.

If the cold walkthrough reorders these three screens by priority,
the build order follows. Hard-coded order is wrong; walkthrough-
driven order is right.

## Substrate-gap discipline (load-bearing)

Some friction the cold walkthrough surfaces will not be UX gaps —
it will be the substrate exposing real holes (e.g. a grants panel
that's hard to scan because the substrate returns every grant
string without grouping; an audit timeline that's confusing
because some rows have no human-readable description).

Phase 17 **does not fix substrate**. Substrate findings get logged
in `docs/handovers/PHASE_17_SUBSTRATE_BACKLOG.md` with a one-line
description and the screen / finding number that surfaced them.
They become Phase 18 candidates.

The discipline: if a sub-step's PR touches a substrate file (`app/`
backend, `app/core/`, schemas, migrations), it's out of scope.
Reviewer's tripwire.

## Explicitly out of scope

- New substrate (no new endpoints, no new tables, no new migrations).
- New modules. Pre-Motion + Contract Review remain the references.
- Marketing / landing-page work.
- Decorative redesign (typography overhaul, illustration system,
  brand evolution). Phase 17 is operational chrome, not visual
  identity.
- Connectors, MCP servers, marketplace mechanics.
- Async refactors, queue work, durable-job hardening.
- The remaining 11 routes (admin users, matters list, artifacts,
  modules detail, settings, jobs, etc.) — they enter scope only
  if the walkthrough findings demand it.
- Re-tokening or design-system reshuffle.

## Open questions for the reviewer

1. **Walkthrough recorder.** Who is the named non-engineer?
   Pre-vetted candidates: a colleague of Andy's outside the
   project, a UK solicitor (better for cold-evaluator framing),
   a YC alum unfamiliar with the codebase. Reviewer picks; the
   walkthrough is the spec, so the recorder must not have any
   prior context.
2. **Branch strategy.** `phase-17-crm-pass` long-running branch
   (Phase 14-16 model) or sub-step branches against master?
   Plan defaults to a single long-running branch to keep the
   redesign coherent.
3. **Acceptance threshold.** 40% reduction in clicks /
   back-buttons / pauses on the three target screens is the
   plan's proposed bar. Reviewer can tighten or loosen.
4. **Walkthrough output format.** Markdown writeup + video link
   (plan default) or transcribed timestamps + screenshots?
5. **Scope flex.** If the walkthrough surfaces a fourth screen
   as higher priority than one of the three named here, does
   Phase 17 expand to four, or do we swap?

## Non-negotiables carried forward

- Substrate is stable; substrate stays untouched.
- Audit emissions never change semantics, payload shapes, or
  vocabulary. Substrate vocabulary on the audit timeline is the
  regulator surface; the chrome around it is what changes.
- No server-paid model keys in prod (untouched; UI doesn't
  surface them anyway).
- Redis never holds matter content (untouched).
- Module manifests on disk and their signatures are not touched.
- Real product/operator surfaces only — no test-only hooks, no
  private bypasses, no UX-only audit emissions.
- Phase 15 e2e remains green. Any redesign that breaks
  `e2e/first-run.spec.ts` is out of scope until the test is
  updated to match the new UI **with reviewer sign-off**.

## What this phase doesn't try to be

Phase 17 is not the visual design pass. It is not the brand
evolution. It is not the "make it pretty" phase. It is the
"make it feel familiar to someone who has used a CRM before"
phase. The bar is comprehension, not delight.

Delight is Phase 19+. Comprehension is Phase 17.
