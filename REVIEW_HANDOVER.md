# Review handover — round 2

For the reviewing agent. Catches up on what's changed since PR #1 ("Tighten v0.1 launch scope") merged. Stress-test the new state.

Original review (commit `32096f2`, PR #1) called the plan right in direction but wrong in scope/time coupling. That critique was applied — v0.1 went from "five modules end-to-end" to "one coherent sample-matter workflow" with chronology and contract review demoted. That correction is in master and still holds.

Four pieces of work landed after that, in order. Three are docs-only; one is a strategic finding that changes implementation effort without changing scope.

## 1. Platform extensibility additions (commit `a44202b`)

The repo was previously framed as a workspace built for our ABS thesis. After feedback that this should be an open-source platform "people can jam on" (internal law firms, contributors, forks), added the SDK primitives needed for that framing to be real, not aspirational.

Touched:

- `docs/MODULE_DEVELOPMENT.md` — five-step module guide, core API contract, stability matrix, private firm-fork pattern, v0.2 / v0.5+ roadmap of what's coming for the SDK.
- `schemas/module.json` — JSON Schema for module manifests (name, version, nav, routes, plugin/env/MCP requires, permissions).
- `examples/modules/example-tab/` — minimal copy-paste starter (manifest, backend router + service, frontend page + component, README).
- `backend/app/core/api.py` — documented stable public surface modules import. Internals remain unstable.
- `infra/deploy/cloudflare.md` — Pages + Containers/Fly.io + Neon UK + R2 deploy notes (live demo target switched from Azure UK South / AWS eu-west-2 to Cloudflare).
- `ARCHITECTURE.md` — Cloudflare in hosting row, new "Module SDK" section covering registration, migrations, sandboxing, firm-internal forks.
- `README.md` — platform framing explicit; "Extending" section linking to the module SDK resources.

The relevant constraints:

- v0.1 module registration is **manual** (two-line edits in `main.py` and `modules.ts`). Auto-discovery is v0.2.
- v0.1 modules cannot bring their own DB tables. Use `Matter.metadata` JSONB or the materialised matter folder. Per-module alembic is v0.2.
- Module sandboxing / permission enforcement is v0.5+ (multi-tenant work).
- v0.1 modules cannot bypass audit, define their own auth, or ignore privilege. Permanent constraint — that's the regulatory plumbing of the platform.

## 2. Pre-Motion reframed as adversarial premortem (commit `409d823`)

Pre-flight audit located the existing implementation at `/Users/andy/Documents/New project/premotion/`. It is **not** a Nash bargaining / settlement calculator (which the original `pre-motion` SKILL.md described). It is a four-stage adversarial premortem app: OptimisticAnalyst → EvidenceInspector (3 parallel sub-agents) → PremortemAdversary (4 parallel Opus sub-agents) → Synthesiser. Returns a brief with verdict, ranked failure scenarios across procedural / substantive / evidentiary / strategic categories, and one brutal one-sentence verdict. Tagline: *"We try to lose your case for you. So you don't."*

Decisions made:

- Pre-Motion in Legalise becomes the adversarial premortem — port the existing app. The SKILL.md in `claude-for-uk-legal/uk-litigation-legal/skills/pre-motion/` has been rewritten to match. The plugin and the workspace module now describe the same thing.
- The original Nash bargaining concept moves to a separate `settlement-helper` skill / module in v0.2.
- Plan documents updated: `BUILD_PLAN.md` Day 6-7 ports premotion rather than building Nash from scratch; `SCOPE.md` and `EXECUTIVE_SUMMARY.md` reflect the new shape.

This is sharper than the original framing. Settlement calculators are crowded territory. "Parallel Opus subagents arguing the case has been lost" is not — and it already exists as working code.

## 3. Plain-English added as Day 17 SDK proof point (also commit `409d823`)

Added as a launch-week deliverable, not v0.1 core scope. Built strictly on `app.core.api` — same constraints any third-party contributor faces. Time-boxed to ~2 hours. Launch post angle: "here's how I added a module in two hours using the SDK; apply the same pattern to your tab."

This demonstrates the platform-extensibility narrative at launch rather than just claiming it. The plain-english Claude Code skill already exists in Andy's `~/.claude/skills/`, so it's a wrap, not a build.

## 4. Counsel-mvp located as Bird Legal MVP (commit `312fd27`)

Original "Bird Legal MVP" referenced in the conversation history was renamed Counsel — located at `/Users/andy/counsel-mvp/`. Full FastAPI + React 19 app with five modules: Case Law Research, Litigation Advisor (Nash analysis lives here), Timeline Builder, Letter Drafting, Contract Scanner (Parser → Analyst → Redliner → Summariser pipeline). Plus a BaseAgent abstraction, async Anthropic SDK, matter-first routers, aiosqlite.

Treatment decision: **pattern reference, not wholesale port.**

- Counsel-mvp was MVP code, explicitly not battle-tested. Dragging the MVP debt forward would compromise the new platform layer.
- Reuse what works: `BaseAgent` shape, matter-first router pattern, proven prompt designs across timeline / drafting / contract scanner / litigation advisor.
- Rebuild on the new platform — call through `app.core.api`, route audit through the gateway, respect privilege posture, register modules through the manifest.

Effect on plan:

- BUILD_PLAN Day 8 (letters), Day 9 (chronology read-only), Day 10 (contract-review roadmap tab) reference counsel-mvp as the pattern / prompt source for those surfaces.
- v0.1 launch surface unchanged. Reviewer's "one coherent sample-matter workflow" discipline still holds — counsel-mvp's existence makes the implementation faster (proven prompts), not the scope wider.
- The settlement-analysis logic in counsel-mvp's `routers/advisor.py` becomes the seed for the v0.2 `settlement-helper`. The Nash bargaining concept was right; it just wasn't the right hero.

## What we're asking the reviewer to stress-test

Round 1's structural critique (scope/time coupling, retention cosplay, sample matter as spine, chronology + contract review demotion, hard recommendation on v0.1 done definition) was applied. That's settled.

Round 2 questions:

1. **Platform framing.** The repo is now positioned as "open-source platform other people plug into" rather than "demo workspace for our ABS thesis." Module SDK in place (manifest schema, example, `app.core.api`), MODULE_DEVELOPMENT.md written, private-fork pattern documented. Is this the right framing for v0.1 or is it over-extending the narrative before the substance lands?

2. **Pre-Motion change.** Moving from Nash bargaining to adversarial premortem makes the hero more novel and means we ship an app that already works. But it abandons settlement-analysis as a v0.1 surface entirely (settlement moves to v0.2). Is the premortem definitely the sharper hero, or is settlement-helper-as-v0.1 a better narrative for the solicitor-legible audience?

3. **Counsel-mvp pattern reuse.** Now that proven prompts and patterns exist for timeline / drafting / contract review, is the v0.1 discipline of "chronology read-only + contract review as roadmap tab" still right? Or does counsel-mvp's existence justify graduating one or both into live v0.1 modules? The original critique said the scope was overpacked; the prompts existing changes the effort, not necessarily the scope-creep risk.

4. **Plain-English launch-week add.** Day 17 includes building the plain-english module in the morning + README/launch assets in the afternoon. Two hours for the module is the time-box. Is this scope creep risk before launch, or is it the genuinely-strongest single-frame demonstration of the platform thesis (an audience can watch a module land in real time on the eve of launch)?

5. **Cloudflare deploy target.** Pages + Containers (or Fly.io fallback) + Neon UK + R2. Trade-offs: free egress on R2, UK data residency through Neon London, DDoS/WAF at the edge. Cost: backend can't be CF Workers (FastAPI doesn't fit), so Containers or Fly.io are the only options. Concerns?

6. **Timeline.** Originally 3 weeks (18 days) with 25% buffer = 4 weeks. With counsel-mvp's patterns proven, the build is closer to "informed integration" than "greenfield." Should the timeline tighten, stay, or stretch? My instinct says stay — integration always reveals friction — but happy to be pushed.

## What's in the repo

```
legalise/
  EXECUTIVE_SUMMARY.md      # the strategic frame
  SCOPE.md                  # in/out + decision log
  ARCHITECTURE.md           # stack, data model, module SDK section
  BUILD_PLAN.md             # 18-day plan with daily granularity + risk register
  REGULATORY_PLUMBING.md    # eight pieces of UK-aware design
  ROADMAP.md                # v0.2 → v0.5+
  REVIEW_HANDOVER.md        # this file
  README.md                 # public-facing
  CONTRIBUTING.md
  LICENSE
  docs/
    MODULE_DEVELOPMENT.md   # five-step module guide
  schemas/
    matter.json             # Stella-compatible matter shape
    document.json
    audit-entry.json
    module.json             # module manifest schema
  examples/
    modules/example-tab/    # minimal copy-paste module starter
  backend/
    app/
      main.py
      core/
        config.py
        audit.py
        model_gateway.py
        api.py              # stable public surface for modules
      modules/              # 5 module stubs
      agents/
        base.py
        orchestrator.py
      adapters/
        plugin_bridge.py
    alembic/
    pyproject.toml
    Dockerfile
  frontend/
    src/
      App.tsx
      modules/              # 5 module stubs
      shared/
      lib/
    package.json
    vite.config.ts
    Dockerfile
  infra/
    docker-compose.yml
    deploy/
      cloudflare.md
```

## Commits since first review

- `c245e30` — merge of PR #1 (round 1 scope tightening)
- `a44202b` — platform extensibility + Cloudflare deploy notes
- `409d823` — pre-flight findings + Pre-Motion reframe + plain-English launch-week add
- `312fd27` — counsel-mvp located as Bird Legal MVP — pattern reference, not wholesale port

Critique welcome. Sycophancy not useful. Disagreement on any of the six round-2 questions above is the priority.
