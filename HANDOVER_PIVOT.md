# Handover — v0.1 launch pivot (marketplace framing)

This is **not** a reviewer handover — it's a build brief for the agent
that picks up the v0.1 launch pivot. R5 and R6 reviewer rounds are
closed; the repo is at `dae8f1a` with Day 16 evals shipped. The pivot
came out of a strategy conversation post-evals: the platform claim
hadn't been earned in product terms, and rather than walk it back, we
sharpen it into the actual product wedge.

You're not auditing existing work. You're shipping the three small
pieces that turn v0.1 from "workspace with four built-in modules and a
plugin bridge" into "audited execution layer for a Git-distributed
catalogue of legal AI skills".

Read sections 1–3 to ground. Sections 4–7 are the work.

---

## 1. Context — where the project sits

**Repo:** `https://github.com/b1rdmania/legalise`, head `dae8f1a` on `master`.
**Local:** `/Users/andy/Cursor Projects 2026/legalise/`.

What's already shipped through Day 16:

- Matter spine (CRUD, documents, audit, privilege posture, filesystem
  materialisation) — Days 2–4
- Model gateway + plugin bridge + chronology + CPR 31.22 gate — Days 5, 9
- Pre-Motion (4-stage adversarial pipeline) — Day 6, polished Day 8
- Letters (matter-type-aware drafting) — Day 7
- Contract Review v0.2 placeholder — Day 10
- Integration polish (`ErrorCallout`, `LoadingLine`) — Days 11–12
- Landing page at `#/`, demo CTA, TopBar nav polish — Days 13–14
- Day 15 deploy *prep* (committed `backend/fly.toml`, image vendors
  plugins, Gotenberg sidecar plan locked, executable preflight + smoke)
- Day 16 evals (audit-row contract pinned, catalogue routing unit tests)

What's parked: Day 15 *actual deploy* needs Andy's Fly auth, Wrangler,
ANTHROPIC_API_KEY, and Neon setup. Don't unblock that — it's
interactive and Andy will run those steps when he's ready.

**Two reviewer agents have audited everything through Day 14.** Both
operate against the repo on a separate machine via a real Anthropic
key. They closed R5 (audit shapes, matter-type strings, envelope-POST
PDF) and R6 (ErrorCallout regex, Gotenberg sidecar — internal-only
always-on, landing narrative). Their canonical sign-offs live in
`HANDOVER_R5.md` and `HANDOVER_R6.md` at repo root.

---

## 2. The pivot

We were going to launch with copy that called Legalise a
"platform-shaped, module-extensible workspace" — carefully hedged to
match what the code actually does. Andy's gut, post-Day-16: the
phrase is doing too much work. The visceral test ("show me the list
of modules I can install") fails — there's no `/modules` page, the
four module surfaces are hardcoded in `App.tsx`, no signup, no
settings.

We worked through it. The honest reframe is **stronger** than the
hedged one:

> **Legalise is the audited execution layer between freely-built
> Claude legal skills and law-firm-compliant deployment.**

Three parties:

- **Skill creators** publish SKILL.md files (Andy's
  `claude-for-uk-legal` is the seed catalogue — 15 skills already
  shipped)
- **Internal tech teams at firms** scan, approve, and install on
  behalf of their solicitors
- **Solicitors** get workspace modules they can trust because the
  firm's tech team cleared them

The viral mechanic isn't a marketplace UI with ratings. It's
**Git-as-marketplace**: firms fork `claude-for-uk-legal` (or any
catalogue repo), review skills by PR diff, point
`PLUGINS_ROOT` at their fork. Approval is code review. Provenance
is git history. Firms already run this workflow for everything else.

Reframing what's already shipped against the 5-layer model that
unifies all of this:

| Layer | What it does | v0.1 status |
|---|---|---|
| **Catalogue** | SKILL.md files | `claude-for-uk-legal` shipped, 15 skills, public GitHub |
| **Bridge** | Load SKILL.md → matter-context prompt → audited execution | Shipped (Day 5, `backend/app/adapters/plugin_bridge.py`) |
| **Surfaces** | How a skill renders in the workspace | Three patterns proven: generic `/invoke`, multi-skill curated (Letters), bespoke hero (Pre-Motion) |
| **Discovery** | Browse what's installed | **Missing** — this batch builds it |
| **Install/approval** | Add/scan/approve skills | Documented as a Git workflow, not a UI |

What's missing for the viral launch is the Discovery layer and the
framing of everything else around that 5-layer model. **That's this
batch.**

---

## 3. Decisions already locked — do not relitigate

These came out of the strategy thread that produced this brief. The
new agent should accept them; if you disagree strongly, surface
through Andy, don't quietly re-architect.

- **The platform claim earns through Discovery + framing**, not
  through marketplace UI. v0.1 ships a *read-only* modules page
  pointed at `PLUGINS_ROOT` and a README that documents the
  Git-marketplace pattern in commands. No install button, no
  enable/disable, no rating, no per-workspace overlay, no preview UI
  for arbitrary URLs.
- **Brand stays paired, not merged.** `claude-for-uk-legal` remains
  its own product (already published as a Claude Code plugin pack).
  Legalise is the engine that renders it. Two HN posts on launch day,
  cross-linked. Don't rebrand the plugin suite.
- **Use the existing manifest schema and bridge.** `schemas/module.json`
  is the contract. `app/adapters/plugin_bridge.py` already parses
  SKILL.md frontmatter — reuse that parser; don't write a second one.
- **No new tables, no migrations.** The modules page is a thin
  scan-PLUGINS_ROOT-and-return-JSON endpoint. Module install state is
  whatever's on disk at `PLUGINS_ROOT` — no DB-backed `installed_modules`
  table.
- **Reviewer-locked invariants stay locked.** Audit-row contracts,
  privilege posture, CPR 31.22 gate, matter-type routing in Letters
  — none of these touch.
- **Oxide design tokens stay locked.** See `docs/DESIGN.md`. The
  modules page renders in the same register as MatterList and
  Landing — no new colours, no new fonts, no rounded cards.

---

## 4. The batch — three pieces, ~3.5 hours total

In order. Each piece has a done-state. Commit after each, don't bundle.

### 4a. Modules page — Discovery layer (~2 hours)

**Backend** — new file `backend/app/api/modules.py`:

- `GET /api/modules` — returns the installed skill catalogue.
  Scan `PLUGINS_ROOT` (from `settings.plugins_root`) for
  `*/skills/*/SKILL.md` files. For each, parse the YAML frontmatter
  using the existing parser at
  `backend/app/adapters/plugin_bridge.py::_parse_skill_md`.
- Response shape:
  ```json
  {
    "plugins_root": "/plugins",
    "source": {
      "repo": "https://github.com/b1rdmania/claude-for-uk-legal",
      "ref": "3fb0ea86ad49f92d90fbd9dcfbee70f5947ba31c"
    },
    "skills": [
      {
        "plugin": "uk-employment-legal",
        "skill": "lba-drafter",
        "name": "lba-drafter",
        "description": "Drafts a Letter Before Action (LBA) for an employment dispute…",
        "source_url": "https://github.com/b1rdmania/claude-for-uk-legal/blob/3fb0ea8/uk-employment-legal/skills/lba-drafter/SKILL.md",
        "argument_hint": "[claim-type] [--respondent=name]"
      },
      …
    ]
  }
  ```
- `source.repo` and `source.ref` come from new env vars
  `PLUGINS_REPO` / `PLUGINS_REPO_REF` mirroring the Dockerfile args
  (default to the same values).
- `source_url` is constructed from `repo` + `ref` + the relative
  SKILL.md path. If `repo`/`ref` are unset, return `source_url: null`
  per skill rather than fabricating a URL.
- `GET /api/modules/{plugin}/{skill}` — returns the full SKILL.md
  body (the prompt the tech team would scan to approve). Plain text,
  not JSON-wrapped.
- Register the router in `backend/app/main.py` alongside the others.
  No prefix-mismatch — sits at `/api/modules`, not under
  `/api/matters`. Wire `matters_router` is the existing pattern; copy
  the shape.
- Add audit row `modules.catalogue.viewed` on `GET /modules` — single
  http.post row from middleware is fine for v0.1; semantic row would
  be overkill. Don't bother adding `modules.skill.viewed` for the
  SKILL.md body view.

**Backend config** — `backend/app/core/config.py`:

- Add `plugins_repo: str | None = None`
- Add `plugins_repo_ref: str | None = None`
- `backend/fly.toml` `[env]` block sets both to the Dockerfile build
  args so the source URL works on the live deploy.

**Frontend** — new content in `frontend/src/lib/api.ts`:

- Types: `ModuleSkill`, `ModulesResponse`
- `getModules()` and `getSkillBody(plugin, skill)` fetchers

**Frontend** — extend `frontend/src/lib/route.ts`:

- Add `{ name: "modules" }` variant to `Route`
- Parse `#/modules` → `{ name: "modules" }`

**Frontend** — `frontend/src/App.tsx`:

- New `<Modules />` component, sits as a top-level page (not nested in
  matter detail).
- TopBar gains a `NavLink href="#/modules"` between Matters and New,
  highlighted when `route.name === "modules"`. Mirror the breadcrumb
  tail rule (`legalise / modules`).
- Page shape: hero with `§modules / source repo · pinned at <short-sha>`
  meta line, then a grouped list — group by plugin
  (`uk-employment-legal`, `uk-litigation-legal`, `uk-research-legal`),
  each group is a section with a heading, each skill is a row showing
  name + description + a `view source →` external link (if
  `source_url`) and a `view prompt →` button that expands an inline
  `<pre>` block with the SKILL.md body.
- "View prompt" is the scan view for an approving tech team. Use
  `LoadingLine` and `ErrorCallout` for state — they already exist.
- Landing's `SurfaceCard` for the four module surfaces stays. The
  `/modules` page adds the *skill catalogue* view, which is a
  different thing — surfaces are workspace UI patterns; skills are
  the executable units the bridge invokes.

**Done state:**
- Visit `#/modules` against local compose → see 15 skills grouped by
  three plugins, each with description + view-prompt expand. View
  prompt shows the actual SKILL.md body.
- `curl localhost:3000/api/modules | jq '.skills | length'` returns
  `15` (or whatever the pinned plugin commit ships).
- Source URL on each skill links to the right blob on GitHub at the
  pinned commit SHA.
- TopBar `Modules` link highlights green when on `#/modules`.
- TopBar brand crumb reads `legalise / modules`.

### 4b. Framing rewrite — Landing + README (~1 hour)

**`frontend/src/App.tsx` — `Landing` component:**

- Hero copy current: "Matter-first legal AI for England & Wales." +
  "Legalise is an open-source workspace counterpart to the
  claude-for-uk-legal plugin suite…"
- Rewrite to lead with the execution-layer claim. Suggested shape:
  > **The audited execution layer for Claude legal skills.**
  >
  > Legalise renders any catalogue of SKILL.md files into a
  > matter-first workspace where every call is audited, privilege
  > posture is a first-class property, and disclosure-tainted
  > chronology entries are gated behind a CPR 31.22 acknowledgement.
  > Skills come from `claude-for-uk-legal` by default; fork the
  > catalogue, review the skills, point `PLUGINS_ROOT` at your fork.
  > Approval is code review. Provenance is git history.
- Add a fifth `SurfaceCard` row above the existing four — or
  preferably, replace the four with a tighter five-card grid
  expressing the layer model:
  - Catalogue (links to GitHub for `claude-for-uk-legal`)
  - Bridge
  - Surfaces (Pre-Motion / Letters / Chronology three patterns)
  - Discovery (links to `#/modules`)
  - Install/approval (links to README section)
- "Open demo matter" CTA stays as-is. Don't re-engineer the demo path.

**`README.md`:**

- Replace the hero / positioning with the same execution-layer claim.
- Add a `## Installing skills` section that documents the
  Git-marketplace pattern as runnable commands:
  ```bash
  # Fork claude-for-uk-legal (or any SKILL.md catalogue)
  gh repo fork b1rdmania/claude-for-uk-legal

  # Review skills by PR diff. Approve via internal merge.
  # ...your firm's normal code-review process...

  # Point Legalise at your fork
  export PLUGINS_REPO=https://github.com/<your-org>/claude-for-uk-legal
  export PLUGINS_REPO_REF=<your-approved-sha>
  fly deploy   # or docker compose build, depending on stack
  ```
- Add a `## Module surfaces` subsection that explains the three
  surface patterns already shipped (generic `/invoke`, curated
  multi-skill like Letters, bespoke hero like Pre-Motion). This is
  where the "four built-in modules" framing dies — they're not
  modules, they're surface patterns over the skill catalogue.
- Link to `#/modules` (`https://legalise.dev/#/modules` on live
  deploy) as the canonical "see what's installed" view.

**Done state:**
- Hero and README lead with execution-layer claim, not "open-source
  workspace".
- README documents the Git-marketplace pattern with commands a tech
  team can run.
- Landing has a clear `view installed skills →` path to `#/modules`.

### 4c. TRUST.md — skill provenance (~30 min)

**`docs/TRUST.md`:**

Add a new `§9 — Skill provenance and approval` section after the
existing sections. Honest one-pager:

- SKILL.md is the spec. Every skill in the catalogue has a manifest
  (name, description, argument hint) and a prompt body. Both are
  reviewable plain text.
- Git is the approval trail. The PR review on the catalogue repo is
  the approval record. The merged SHA is the version that ships.
- `PLUGINS_REPO_REF` pins the catalogue version. Bumping it is
  visible in deploy logs and image SHA.
- The audit log records every skill invocation via
  `plugin.invoked` + `model.call`. The `plugin.invoked` payload
  carries `plugin` + `skill` + `skill_name` + `inputs` + `matter_slug`,
  so post-hoc "which skills ran against which matters" is a SQL query.
- What this does **not** cover in v0.1: prompt-injection scanning,
  automated SKILL.md linting, signed manifests, organisation-level
  skill allowlists. All v0.2.

**Done state:**
- TRUST.md has a `§9 Skill provenance` section that maps to the new
  Discovery layer and answers the "how do firms approve this?"
  question in one paragraph.

---

## 5. BUILD_PLAN amendments (do alongside the batch)

Edit `BUILD_PLAN.md` as part of this work. Specific changes:

- **Insert Day 17a** before existing Day 17, titled "Module discovery
  + catalogue framing". Reference this handover doc by name.
- **Retire Plain-English stretch goal** from Day 17. The original
  stretch was: "if Day 16 green, build a Plain-English module on
  `app.core.api` to prove the SDK". That's been superseded — the
  Discovery layer + framing rewrite is now the SDK proof, and it
  proves more.
- **Reshape Day 17** to: "README + launch assets" only, with the
  marketplace framing applied throughout.
- **Reshape Day 18** to: "Launch — paired HN post (Legalise +
  claude-for-uk-legal)". Note the cross-link, one launch motion, two
  repos.
- **Don't touch anything before Day 17.** Days 2–16 are historical
  record; the reviewer signed each off at its time.

---

## 6. Don't-do list

Things the strategy thread considered and explicitly rejected. Don't
re-introduce.

- **Don't build an install/enable UI.** Read-only modules page only.
  The install workflow is Git.
- **Don't add a per-workspace overlay** (e.g. "this skill is enabled
  for matters of type X but not Y"). That's v0.2.
- **Don't add multi-tenancy or per-firm anything.** Single-org assumption.
- **Don't add rating, popularity, or "X firms installed this".**
  v0.2 at earliest, probably never as a core feature.
- **Don't write a second SKILL.md parser.** Reuse the existing one in
  `plugin_bridge.py`.
- **Don't rename or rebrand `claude-for-uk-legal`.** It stays its own
  product, paired-launched with Legalise.
- **Don't touch the four module surfaces.** Pre-Motion, Letters,
  Chronology, Contract Review v0.2 placeholder are all locked. The
  modules page is *additive*.
- **Don't add module manifest files (`module.json`) for the four
  surfaces.** That conflates "skill in the catalogue" with "frontend
  surface pattern" — see the strategy thread for why. The modules
  page reads SKILL.md, not module.json.
- **Don't unblock Day 15 deploy.** Interactive, Andy's job.

---

## 7. Validation steps before handing back

Run all of these against local compose with a real `ANTHROPIC_API_KEY`
set, or note in the handover-back if you ran with stub-echo. The
audit-shape claims hold either way; the prompt-body view doesn't need
a key.

1. `npx tsc --noEmit` clean in `frontend/`
2. `python3 -c 'import ast; ast.parse(open("backend/app/api/modules.py").read())'` clean
3. `pytest backend/tests/` still passes (don't break the catalogue
   unit tests from Day 16)
4. `curl localhost:3000/api/modules | jq '.skills | length'` returns
   the expected count
5. Visit `#/modules` in a browser — 15 skills render grouped, view
   prompt expands, source URL resolves on GitHub
6. Landing copy reads as execution-layer-first, not
   workspace-first
7. README `Installing skills` section commands actually run (you can
   stop at `gh repo fork`, no need to actually deploy)
8. TRUST.md §9 exists and references the audit-row trail

When all eight pass, write a handover-back note (call it
`HANDOVER_PIVOT_DONE.md` at repo root, or just commit + push and
summarise in the commit message). Include:
- Final repo head SHA
- Any architectural calls you made that aren't in this brief
- Anything you skipped and why
- Anthropic key status during your smoke (real / stub-echo)

Then ping Andy — he'll spin up a reviewer agent against the pivot
batch (round R7) and we proceed to Day 18 launch.

---

## 8. Pointers — files you'll touch most

```
backend/
  app/
    main.py                                  # register new router
    core/config.py                           # PLUGINS_REPO / _REF env vars
    api/modules.py                           # NEW — modules + skill body endpoints
    adapters/plugin_bridge.py                # READ ONLY — reuse _parse_skill_md
  fly.toml                                   # [env] PLUGINS_REPO / _REF

frontend/
  src/
    App.tsx                                  # Modules page + Landing rewrite + TopBar NavLink
    lib/
      api.ts                                 # getModules + getSkillBody + types
      route.ts                               # modules route variant

docs/
  TRUST.md                                   # §9 Skill provenance

BUILD_PLAN.md                                # Day 17a insertion + Day 17/18 reshape
README.md                                    # Hero + Installing skills + Module surfaces
HANDOVER_PIVOT.md                            # this file — don't edit, reference it
```

---

Good luck. The repo is in good shape, the contract is clear, the work
is small. Don't gold-plate.
