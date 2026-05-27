# Phase 17 — CRM-Ergonomic UI Pass (PLAN)

**Status:** plan v2, reviewer-ratified per redline (3 P1 + 2 P2 patched, 5 answers folded in).
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

A named **cold legal-or-operator-adjacent evaluator** follows
`docs/DEMO.md` end-to-end on a fresh local fork. Acceptable
profiles (per reviewer answer 1):
- UK solicitor (best fit — closest to the actual evaluator audience)
- Legal-ops practitioner
- CRM-heavy SaaS operator (Salesforce / HubSpot / Linear power user)
- YC-style evaluator with no prior project context

Not Andy, not the maintainer, not a builder on the project, not
anyone who has been pre-briefed on the substrate. "Non-engineer"
alone was too loose; the evaluator must approximate the real
cold-evaluator audience.
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
catalog grid that — though Phase 14.5 added installed-state
badges — doesn't make installed vs available operationally
obvious, and the trust ceremony flow reads as bespoke. Cold evaluators will
expect this to look like the admin → integrations panel of any
SaaS they've used.

Candidate directions (the walkthrough decides which one, not the
plan — per reviewer P1 #2): two-column installed-vs-available
layout; badge states for ceremony progress; stepper-in-modal vs
keep the route-change ceremony — whichever direction the
walkthrough's friction data supports. The plan does **not**
prescribe modal-vs-route or which modules appear installed first;
those are downstream of the walkthrough's findings on what's
actually confusing.

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

**Non-negotiable on this screen (reviewer P1 #3):** grouping is
display-layer only. Raw rows must remain accessible — no row
hiding, no client-side reinterpretation that changes substrate
vocabulary, no synthesised rows that don't map 1:1 to a substrate
event. The shape is "**group by default, expand to raw rows**",
not "group instead of raw rows." A regulator who clicks expand
must see exactly the rows the substrate emitted, with the
substrate's own action strings and payload shapes.

### Why these three and not the others

The remaining routes (admin/users, matters list, artifacts,
modules detail, settings, jobs) all matter, but the walkthrough
will surface their priority. If the cold walkthrough finds that
`/admin/users` is more confusing than `/modules`, scope reshuffles.
The three above are the **starting** scope, not the locked scope.

## Acceptance bar — gate vs target (reviewer P1 #1)

Same-evaluator before/after has learning bias, and low baseline
counts make percentages weird. So the hard ratification gate and
the target metric are kept separate.

### Hard gate (Phase 17 cannot close without all four)

1. **Every P1 finding from the cold walkthrough is closed** — each
   one cited by number in the closing PR / sub-step commit.
2. **The acceptance walkthrough completes unaided** — the named
   evaluator runs the eight `docs/DEMO.md` steps end-to-end with
   no operator on the call. Stops on confusion are findings, not
   passes.
3. **Phase 15 e2e stays green** on the merge candidate.
4. **No substrate touches** in any sub-step PR (tripwire below).

### Target metric (evidence, not gate)

A 40% reduction in clicks, back-button presses, and "where's…?"
pauses on the three redesigned screens vs the cold-walkthrough
baseline. The numbers go in `PHASE_17_ACCEPTANCE.md` either way;
they are an honesty check on whether the redesign actually
improved comprehension, not the line that decides ratification.

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
   cold legal- or operator-adjacent evaluator (profiles per
   §Step 0); recording + writeup; produces
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

The discipline (reviewer P2 #5 — precise paths): any sub-step PR
that touches any of the following is automatically out of scope.

- `backend/app/**` (any backend Python source)
- `backend/alembic/**` (migrations)
- `schemas/**` (manifest + capability schemas)
- `examples/modules/**` (reference module manifests)

Frontend application code at `frontend/src/**` is fully in scope.
The tripwire is enforced by reviewer file-list scan on every
sub-step PR; a single matching path blocks ratification.

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

## Reviewer answers (resolved)

1. **Walkthrough recorder.** Cold legal- or operator-adjacent
   evaluator. UK solicitor best fit; legal-ops or CRM-heavy SaaS
   operator acceptable. Not Andy, not maintainer, not pre-briefed.
2. **Branch strategy.** Single long-running `phase-17-crm-pass`
   branch with sub-step commits.
3. **40% threshold.** Target metric, not hard gate. Hard gate is
   the four-item bar above.
4. **Walkthrough output format.** Markdown writeup with
   timestamped video link and screenshots for P1 findings. Full
   transcript optional.
5. **Scope flex.** Swap, don't expand by default. Three screens
   max unless reviewer explicitly approves a fourth in a
   sub-step ratify.

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
