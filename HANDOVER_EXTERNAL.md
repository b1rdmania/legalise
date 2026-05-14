# Handover — external review

Different from prior reviewer rounds. R5, R6, R7 were internal — they
audited specific architectural calls against the spec we agreed on. This
is an outside-eye pass. You haven't been briefed on the strategy, the
pivot, or the internal review history, and that's the point. **Read the
repo as a cold first-time reader would**, then tell us whether the story
holds.

This brief is short on purpose. Most of the value of an external pass is
that you bring your own lens — we don't want to prescribe what to flag.

---

## What this project is, in two sentences

Legalise is an open-source UK legal AI workspace. The pitch: legal AI
work should be inspectable, composable, auditable, and run against
matter-shaped context instead of loose chat prompts — so we built the
audited execution layer between a Git-distributed catalogue of
`SKILL.md` files and a matter-first workspace solicitors can use.

Companion repo: `https://github.com/b1rdmania/claude-for-uk-legal` — the
seed catalogue of skills the workspace renders. The two ship as a paired
HN launch.

Live demo target: `legalise.dev` (Day 15 deploy is still pending —
Andy's interactive blockers — so when you do this review, the demo may
not be up yet; that's fine, you'll be looking at the repo).

## Repo state

- Head: `bbb745c` on `master`
- License: Apache 2.0
- Stack: Python 3.12 + FastAPI + Postgres + pgvector backend; React 19 + Vite + Tailwind frontend; Docker Compose self-host; Fly.io + Cloudflare for live demo
- ~5,500 lines of application code across ~50 files (excluding generated, vendored, config)
- Three internal review rounds completed (R5, R6, R7) with full signoffs

## How to orient yourself in 15 minutes

Read in this order:

1. `README.md` — the document that lands every cold reader. Should set the frame.
2. `MANIFESTO.md` — values + refusals
3. `docs/TRUST.md` — honest regulatory posture (especially §3 "What v0.1 does not yet do" and §9 "Skill provenance and approval")
4. `BUILD_PLAN.md` Day 17 + Day 17a + Day 18 — what's shipping in the launch
5. Browse `frontend/src/App.tsx` `Landing` component and the `Modules` component for the user-facing surfaces
6. `HANDOVER_LAUNCH.md` §3c HN post drafts — the actual prose going out on launch day

Optional deeper dives:

- `backend/app/adapters/plugin_bridge.py` — how a SKILL.md file gets executed
- `backend/app/api/modules.py` — how the catalogue is exposed
- `evals/smoke_sample_matter.py` — what the project asserts about itself
- `infra/deploy/cloudflare.md` — deploy plan, Gotenberg sidecar, CORS posture

## The three angles we'd most like an outside eye on

**1. Does the narrative match the code?**

`README.md` hero claims: "Legalise turns reviewable legal skills into
audited matter workflows." Then four load-bearing words: *reviewable*,
*legal skills*, *audited*, *matter workflows*. Does the v0.1 code
actually demonstrate all four? Or is one of them doing more work than
the implementation can defend? The launch post drafts in
`HANDOVER_LAUNCH.md` §3c make more specific claims (audit log per LLM
call, privilege posture as a first-class property, CPR 31.22 gating on
disclosed material, 15 skills, Git install). Do they hold under
inspection?

**2. Is this a thing developers would fork?**

For the developer audience (HN front page, open-source legal-tech,
Claude skill writers), the test is: would I clone this, read the code,
have an opinion about it, and consider forking the skill catalogue?
The project is positioning itself as the *execution substrate* — not
"another legal SaaS, but local". Does that positioning hold up against
how a sceptical developer reads the code? Particularly: is the module
SDK story credible, or does it look like four hardcoded sections with
a plugin loader bolted on?

**3. Would the load-bearing sentence survive an HN audience?**

"Legalise turns reviewable legal skills into audited matter workflows."
Read it cold. Then read the HN post draft at `HANDOVER_LAUNCH.md` §3c.
What would the top three sceptical comments be? Where would a hostile
reader poke first?

## Where competitors and adjacent projects sit

You don't need to do a competitor analysis, but useful reference points
if you're forming a positioning view:

- **Anthropic's `claude-for-legal`** — US-shaped, single-prompt legal
  workflows for Claude Code. ~1100+ stars in three weeks (April 2026).
  Legalise is the UK counterpart; `claude-for-uk-legal` is the UK
  skill catalogue. Different positioning: Anthropic ships the skills,
  Legalise ships the workspace + execution layer.
- **Stella** — open-source legal workspace, US-shaped. Has a manifesto,
  matter-folder convention. Legalise borrows the matter-folder schema
  for compatibility. Different focus: Stella is workspace-first;
  Legalise is execution-layer-first.
- **Mike** — open-source Harvey / Legora-style legal AI workspace with
  auth, projects, document assistant, tabular review, workflows, a hosted
  product shape, and strong OSS momentum. Legalise should not compete as a
  broad "open-source legal AI workspace". The narrower wedge is UK
  regulator-first execution of reviewable legal skills: matter context,
  audit, privilege posture, CPR gates, and Git-pinned skill provenance.
- **Commercial peers** — Spellbook (contracts), CaseText/Cocounsel
  (acquired by Thomson Reuters; research), Harvey (large-firm AI),
  Garden (matter-first AI workspace). Legalise is open-source +
  UK-jurisdictional, which is the wedge.

## What we'd like from you

A findings doc, your own format. Suggested sections:

- **Strongest things about this project** (be specific — vague praise isn't useful)
- **Where the narrative-vs-code gap exists, if any**
- **Sceptical first-reaction items** — the three things a hostile HN
  commenter would post within the first hour
- **Positioning view** — does the wedge hold, where might it slip
- **One sharper version of the launch sentence**, if you think the
  current one underperforms

Length: whatever serves. Internal rounds were 400-700 words; you can be
longer if you find more.

## What we'd ask you NOT to do

- Don't audit at the line level — the internal reviewers handled that.
  We're past the "does this commit hold" stage.
- Don't reopen R5/R6/R7 architectural calls (audit-row contracts,
  Gotenberg sidecar shape, parser extension, etc.) unless you think
  the *narrative* misrepresents them. The decisions themselves stand.
- Don't fix anything. Findings only.
- Don't grade against an internal spec — the spec is exactly the thing
  we want stress-tested by an outside eye.

## Constraints

This is an open-source project licensed Apache 2.0. There is no
commercial product behind it — at least not yet. Andy Bird is the sole
maintainer. The UK Solicitors Regulation Authority context is
important: a regulated firm couldn't deploy v0.1 as live infrastructure,
and v0.1 doesn't pretend it could.

When done, your findings can go anywhere — a comment on the repo, a
direct DM to Andy, a doc he can paste into the project. No fixed
format. The point is the lens you bring.

---

Cold-read. Tell us what we missed.
