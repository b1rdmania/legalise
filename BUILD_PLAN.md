# Build Plan — Legalise v1

3 weeks, solo. 4 weeks with realistic 25% buffer. Daily granularity to make slippage visible early.

v0.1 is scoped around one coherent sample-matter narrative, not five end-to-end modules. The release commitment is: Docker quickstart works, the matter workspace is real, audit/privilege/model routing are visible, Pre-Motion is excellent, and the CPR-letter drafter proves the plugin bridge.

## Pre-flight

Before Day 1:

- [x] Repo scaffolded with directory structure
- [x] Plan documents written and pushed for review
- [x] Bird Legal MVP code located — at `/Users/andy/counsel-mvp/`. The MVP under its original name. Treated as **pattern reference**, not a wholesale port: takes the `BaseAgent` shape, the matter-first router pattern, the proven prompt designs for timeline / letter drafting / contract scanner / litigation advisor. Rebuilt against the new platform layer (audit, privilege posture, model gateway, module SDK) rather than dragging MVP debt forward. Useful seeds: `agents/base.py`, `agents/parser.py|analyst.py|redliner.py|summariser.py`, `routers/drafting.py`, `routers/timeline.py`, `routers/advisor.py`, `routers/documents.py`.
- [x] Pre-Motion code located and audited — adversarial premortem app at `/Users/andy/Documents/New project/premotion/`. Full FastAPI + React with 4-stage pipeline (Optimistic Analyst, Evidence Inspector w/ 3 parallel sub-agents, Premortem Adversary w/ 4 parallel Opus sub-agents, Synthesiser). Plan: port wholesale into `legalise/backend/app/modules/pre_motion/` rather than rewrite the simplified Nash version originally scoped.
- [ ] `claude-for-uk-legal` plugin invocation pattern from a FastAPI backend resolved (direct subprocess? MCP server? SDK call?)
- [ ] Ollama installed locally, one local model pulled for privilege-mode testing (`llama3.1:70b` or `qwen2.5:72b`)
- [ ] Domain `legalise.dev` pointed at Cloudflare (DNS managed by Cloudflare; Pages for frontend, Fly.io `lhr` for backend)
- [ ] Cloudflare account confirmed (Pages + R2 jurisdiction `eu` / location hint `WEUR`), Fly.io account in `lhr` region, Neon project in London region — per `infra/deploy/cloudflare.md`

## Week 1 — Foundation + Matter workspace

### Day 1 — Skeleton boots for real
- `docker compose -f infra/docker-compose.yml up` brings up Postgres + pgvector, Redis, MinIO, Gotenberg, backend, and frontend
- FastAPI app boots locally: `localhost:8000/health` returns 200
- React + Vite app boots: `localhost:3000` renders an empty workspace shell
- First migration created and runnable
- README quickstart matches the actual compose command
- **Done state:** clone, run one command, see a working shell and health check.

### Day 2 — Matter model, CRUD, and auth stub
- SQLAlchemy models: `User`, `Matter`, `Document`, `Event`, `AuditEntry`, `Role`
- Alembic migration for matter tables
- API: `POST /matters`, `GET /matters`, `GET /matters/{slug}`, `POST /matters/{slug}/documents`
- Frontend: matter list page, matter detail page, "new matter" form
- Auth stub: hardcoded user, session via cookie. Production auth is v0.2.
- Document upload path records document metadata and SHA-256. Signed MinIO upload is a stretch; local ingest is acceptable for v0.1.
- **Done state:** can create a matter, upload/register a document, see both listed.

### Day 3 — Audit log + privilege posture
- `AuditEntry` model: actor, matter_id, action, resource_type, resource_id, payload_hash, timestamp
- Middleware that logs every API call touching a matter
- Hook in `model_gateway` that logs every LLM call (prompt hash, response hash, token count, model used, latency)
- Frontend: audit-trail tab on matter detail page
- Matter-level privilege posture toggle: A_cleared, B_mixed, C_paused
- C_paused refuses LLM calls. B_mixed visibly warns or routes to local when configured.
- **Done state:** matter actions and model calls visibly accumulate in the audit log; posture changes behaviour.

### Day 4 — Sample matter narrative + filesystem materialisation
- One primary sample matter seeded: unfair dismissal claim, three years' service, conduct dismissal
- The matter includes facts, parties, documents, claim posture, costs assumptions, and a short chronology fixture
- Mirror the sample matter to `matters/[slug]/` on disk
  - `matter.md` — facts, parties, case theory (markdown front-matter for structured fields)
  - `history.md` — append-only internal log
  - `documents/` — uploaded files (or symlinks to MinIO)
  - `chronology.md` — seeded/read-only chronology fixture
- Schema matches Stella's matter folder convention (see `/schemas/matter.json`)
- Re-hydration is stretch, not a Day 4 blocker
- **Done state:** one sample matter tells a coherent story in the UI and on disk.

### Day 5 — Model gateway + plugin bridge proof
- Model gateway scaffolded: `core/model_gateway.py` with `AnthropicProvider`, `OllamaProvider`, and a deterministic stub provider for local/demo runs
- `adapters/plugin_bridge.py` — invokes `claude-for-uk-legal` plugins via subprocess + Claude Code, or via direct MCP if cleaner
- First invocation: from the sample matter, call the `cpr-letter-drafter` plugin with matter context; return draft markdown; log it
- Privilege posture wired in — calling a plugin from a B-mixed matter passes the posture as context
- **Done state:** one real plugin call works from the workspace, output renders, audit entry created.

### Weekend — Design pass + risk check
- UI polish on the matter detail page. Tailwind + Shadcn components. Solicitor-legible: clear hierarchy, real legal language, no AI-app aesthetic.
- Risk check: are any Day 1–5 deliverables yellow/red? If yes, re-plan week 2 now.

## Week 2 — Hero workflow

**Hard gate before Day 6.** Pre-Motion port does **not** begin until the Day 1-5 path is green: quickstart works, matter CRUD + document upload work, audit log captures every action, privilege posture changes module behaviour visibly, one plugin invocation from the sample matter has succeeded. If Day 5 is yellow or red on any of these, slip Day 6 by a day. Pre-Motion is the hero, but a hero on a weak spine ships nothing.

### Day 6 — Pre-Motion port (DONE at commit `94dc281`)
- Source: `/Users/andy/Documents/New project/premotion/` — adversarial premortem pipeline ported wholesale into `legalise/backend/app/modules/pre_motion/`.
- Backend shipped: pipeline (1 + 3 parallel + 4 parallel + 1 = 9 calls), four agent files, schemas, router. All routed through `app.core.api.model_gateway` with per-stage commit so model.call rows survive mid-pipeline crashes. `C_paused` fast-fail at the pipeline entry (no semantic rows for blocked attempts; middleware http.post 409 only).
- Frontend shipped: matter-detail Pre-Motion section renders verdict card with brutal-sentence callout, 4-column stage status strip, grouped failure scenarios, blind spots, evidence inconsistencies.
- **SSE streaming and PDF export deferred to Day 8** — see below for rationale.
- **Done state:** Pre-Motion runs against Khan v Acme end-to-end. With Anthropic key: real synthesis. Without: stub-echo path returns the same 12 audit rows + a graceful "borderline" envelope explaining synthesis was unstructured.

### Day 7 — Letters (CPR-letter bridge surface)
- **Reorder approved R4 (`2774a3f`):** Letters moved up from Day 8 to Day 7. Rationale: breadth before depth — Pre-Motion already works end-to-end at Day 6; shipping a second module surface widens the workflow story before polishing the hero. SSE/PDF are experience polish with a natural fallback into the Day 11–12 polish window.
- Pattern reference: `counsel-mvp/backend/app/routers/drafting.py` for the proven letter-drafting prompt shape and CPR-compliance scaffolding. Rebuild on the platform — call the `cpr-letter-drafter` plugin through `app.core.api.plugin_bridge`, not direct Anthropic SDK.
- Backend: `modules/letters/`
  - Endpoint `POST /api/matters/{slug}/letters/draft` that calls the `cpr-letter-drafter` plugin with matter context
  - Auto-fills parties, facts, claim heads from `matter.md`
  - Returns letter as markdown; .docx is stretch
- Frontend: `modules/letters/`
  - Letter type selector (one launch path only, e.g. ACAS/settlement correspondence or LBC depending on sample matter)
  - Inputs pre-populated from matter; user edits where needed
  - Output preview rendered in the matter-detail Oxide register
- **Pre-Day-7 smoke action:** dry-run the `cpr-letter-drafter` prompt against Khan via the generic `/invoke` endpoint before building the wrapper — if the prompt needs a matter-context shim, that surfaces immediately rather than after the UI lands.
- **Done state:** from the sample matter, generate a draft letter in 30 seconds and show the plugin invocation in the audit trail (`plugin.invoked` + `model.call` + `http.post` = 3 rows per draft).

### Day 8 — Pre-Motion polish (SSE streaming + PDF export)
- **Was Day 7 in the original plan; moved down per R4 reorder.** Polish on a module that already works.
- SSE stream of stage status to frontend:
  - Server-Sent Events from the pipeline, one event per stage transition + one per sub-agent completion. EventSource on the client.
  - Audit/cost reconciliation on disconnect: if the client drops, the pipeline keeps running and the audit rows still land — the SSE channel is UI-only, never load-bearing for audit.
- PDF export via Gotenberg (already in `infra/docker-compose.yml`):
  - Endpoint: `POST /api/matters/{slug}/pre-motion/runs/{run_id}/pdf`
  - Renders the synthesis output to an HTML template in the Oxide register, pipes through Gotenberg, returns bytes
- **Cut-rule:** if SSE costs more than half a day to land cleanly on Fly's HTTP/2 stack, PDF goes first (smaller surface, higher demo-share value) and SSE slips into Day 11–12 polish or v0.2.
- **Done state:** Pre-Motion runs visibly stage-by-stage in the UI; the brief output exports as a clean PDF the solicitor can attach to a client email.

### Day 9 — Chronology read-only demo + CPR 31.22 gate (DONE at commit `231c79c`, pulled forward)
- Pattern reference: `counsel-mvp/backend/app/routers/timeline.py` for the date-extraction approach that proved out in the MVP. v0.1 doesn't run live extraction (scope discipline) but uses the same fixture shape so v0.2 graduation is a straight port.
- Seeded the sample chronology from fixture data (seven Khan events; one disclosure-tainted via the seeded dismissal letter)
- Timeline rendered with significance tags, source documents, and `[DISCLOSURE 31.22]` / `[PRIV]` flags
- **CPR 31.22 gate is a server-side access boundary:** tainted events return with `description="[withheld pending CPR 31.22 acknowledgement]"`, empty source filenames, empty proceedings refs — until the user POSTs to `/api/matters/{slug}/chronology/gate`. Audit row `chronology.gate.confirmed` records the acknowledgement.
- SoF variant filters flagged privileged entries from the seeded chronology
- **Done state:** chronology demonstrates the regulatory shape without promising v0.1 extraction.

### Day 10 — Roadmap module tabs
- Contract review tab is visible but labelled v0.2. The four-agent pipeline (Parser → Analyst → Redliner → Summariser) lives proven in `counsel-mvp/backend/app/agents/` and `routers/documents.py` — graduates in v0.2 via straight port + platform-SDK wiring.
- Chronology extraction/diff controls are labelled v0.2 if present
- Copy is transparent: v0.1 proves the matter spine, Pre-Motion, audit, privilege posture, local model toggle, and plugin bridge
- **Done state:** navigation shows ambition without pretending unfinished modules are done.

### Day 11–12 — Integration + sample matter polish
- Thread one sample matter through the full demo path:
  - facts and documents loaded
  - Pre-Motion run saved
  - audit entries visibly accumulate
  - privilege posture changed and reflected in model-routing UI
  - CPR-letter generated through the plugin bridge
  - seeded chronology visible as context
- Loading states, error states, empty states handled on the core path
- End-to-end smoke test against the sample matter
- **Done state:** a reviewer can click one matter and understand the workspace without touring feature tabs.

### Weekend — Design pass + risk check
- Solicitor-legible UI polish on the matter detail page, Pre-Motion output, audit trail, and letter preview
- Retention appears in schema/docs only; no prominent matter UI until enforcement exists
- Risk check: are the core path and quickstart green? If not, cut deploy/evals before cutting quality on the primary sample matter.

## Week 3 — Polish + Launch

### Day 13–14 — Demo flow
- Landing page at `/` — explains Legalise and opens the primary sample matter
- "Open demo matter" button — one-click load of the seeded matter into the workspace
- Module navigation cleaned up; consistent header across modules
- Loading states, error states, empty states all handled
- Tailwind theme pass — solicitor-legible (not AI-app gradient soup)

### Day 15 — Live deploy
- Cloudflare Pages (frontend), Fly.io `lhr` (backend, default), Neon Postgres London, Cloudflare R2 (storage). See `infra/deploy/cloudflare.md`.
- Cloudflare Containers in `WEUR` placement is the experimental alternative for the backend; Fly.io `lhr` is the default because it is the actual UK region.
- HTTPS via Cloudflare-managed certs and Fly.io managed certs.
- Ollama omitted from live demo (local-only feature; documented in README).
- Domain `legalise.dev` pointed at Cloudflare.
- Health check, basic uptime monitoring.

### Day 16 — Evals
- Smoke/eval coverage for the primary sample matter and Pre-Motion output shape
- One plugin-bridge eval: matter context in, letter markdown shape out
- `evals/` directory with runnable scripts
- README block explaining the eval approach
- Evals are not gating in v1 but they exist and are documented

### Day 17a — Module discovery + catalogue framing

Pivot batch from `HANDOVER_PIVOT.md`: ship the read-only Discovery layer and
rewrite public framing around Legalise as the audited execution layer for a
Git-distributed catalogue of Claude legal skills.

- Backend: `GET /api/modules` scans `PLUGINS_ROOT` for installed `SKILL.md`
  files; `GET /api/modules/{plugin}/{skill}` exposes the prompt body for
  review.
- Frontend: `#/modules` lists installed skills grouped by plugin, with source
  links to the pinned catalogue SHA and inline prompt-body expansion.
- README + landing: lead with the execution-layer claim and document the
  Git-as-marketplace install/approval workflow.
- Trust docs: add skill provenance and approval section.

This retires the earlier Plain-English stretch. The Discovery layer is the
v0.1 SDK proof: it shows external skills on disk becoming audited workspace
capability without pretending there is an install marketplace UI.

### Day 17 — README + launch assets

- Top-level README with:
  - Hero one-liner and demo link
  - Architecture diagram (mermaid)
  - Primary sample matter walkthrough with screenshots
  - Plugin-and-workspace relationship explained
  - Installed skills / Git catalogue workflow with link to `#/modules`
  - Module SDK pointer with link to `docs/MODULE_DEVELOPMENT.md`
  - Stack rationale (one paragraph)
  - Quickstart (Docker Compose)
  - Self-host vs Cloudflare deploy
  - Status: v0.1.0, demo not production
  - Roadmap
  - Contributing
  - License
- One animated GIF of Pre-Motion end-to-end (matter context → four-stage adversarial pipeline running with parallel sub-agents → final brief with the one brutal sentence)
- Screenshots for matter workspace, Pre-Motion brief, audit/privilege posture, letter bridge, plain-English tab
- Mermaid diagrams in README: matter lifecycle, plugin bridge, audit-log flow, Pre-Motion adversarial pipeline

### Day 18 — Launch
- Paired Show HN Tuesday morning UK time: Legalise + `claude-for-uk-legal`
- Cross-link the two repos and launch posts. One launch motion, two products:
  the skill catalogue and the audited execution layer that renders it.
- X main post + reply with link
- LinkedIn main post + replies for the sample matter, Pre-Motion, regulatory plumbing, and plugin bridge
- Cross-link from `claude-for-uk-legal` README
- Profile README updated
- Pre-warmed network: 5–10 trusted contacts pinged ahead for stars + comments
- Stella's maintainer DM'd ahead: "Shipping Legalise Tuesday. Matter schema is Stella-compatible. Worth a chat?"
- Be present on HN comments for first 4 hours; reply to everyone

## Cross-cutting: trust & security workstream

The trust posture is the single biggest credibility lever after the workflow
modules. Source of truth is `docs/TRUST.md` (v0.1 draft committed). It
covers privilege architecture, sub-processor list, CPR 31.22 access gate,
audit shape, encryption posture, compliance order (Cyber Essentials Plus →
ISO 27001 → SOC 2 only on US GTM), open questions, and a vulnerability
disclosure path. **Not a v1-launch deliverable as a published page.**
Updated alongside every architectural change in v0.1; published as
`legalise.dev/trust` in v0.2.

If a soundbite at launch references trust ("matter-first, privilege-aware,
audit-logged, CPR 31.22 gate on disclosure"), link to the GitHub raw of
`docs/TRUST.md` from the post. Public route ships v0.2.

Sox-style comparison: Soxton.ai (US) published an aspirational "Building
trust" post listing a Vanta-supported SOC 2 in progress. The posture
(public trust page as a first-class surface) is worth copying. The order
is not — UK GTM should target **Cyber Essentials Plus first** (firm floor),
**ISO 27001 next** (firm ceiling), **SOC 2 Type II** only when expanding
into US or US-owned UK firms.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lawhive recruitment process gets active | M | H — distraction kills the build | Park Lawhive until launch; respond only on launch day or after |
| Bird Legal code is messier to port than expected | M | M — slips Days 6–12 | Simplify Pre-Motion to calculator + deterministic narrative; keep the UI excellent |
| Plugin bridge takes longer than Day 5 | M | H — blocks the letter bridge | Fallback: direct skill rendering through the model gateway; if still blocked, use a deterministic demo provider but keep the audit shape honest |
| Live deploy hits Azure/AWS quota or DNS issue | L | M — slips Day 15 | Have Vercel + Railway as backup deploy targets (Postgres on Neon, app on Railway, domain on CF) |
| Solicitor-legible design takes longer than planned weekend | M | L — week 1 design slips into week 2 | Use a pre-built Shadcn theme and don't customise in v1 |
| Pre-Motion output isn't visually compelling on launch | M | H — kills the hero shot | Day 6 morning: spike one chart library (Recharts/Visx), confirm it can render the ZOPA range cleanly before going deeper |
| Retention UI looks like compliance theatre | M | M | Keep retention in schema/docs only until enforcement exists |
| Procurement / SRA reviewers ask for trust documentation we don't have | M | M — slips first firm pilot | `docs/TRUST.md` is the v0.1 holding doc. Link to it from any procurement conversation. v0.2 publishes `legalise.dev/trust` and starts Cyber Essentials Plus. |
| Eval framework eats Day 16 | L | L | Cap at sample-matter smoke tests; integrate module evals properly post-launch |

## Definition of done for v1

- Clone, `docker compose -f infra/docker-compose.yml up`, see a working workspace.
- One primary sample matter loads and tells a coherent workflow story.
- Matter workspace, audit log, privilege posture, model routing, Pre-Motion, and CPR-letter plugin bridge run end-to-end.
- Audit log shows every action.
- Privilege posture toggle changes module behaviour visibly.
- Local model toggle works on at least one module (Pre-Motion is simplest).
- Live demo at `legalise.dev` runs the same code with no extra setup.
- README, screenshots, mermaid diagrams, eval docs all in place.
- Launch posts written and queued.

## What gets cut if behind schedule

Cut in order:

1. Live deploy (`legalise.dev`) — ship with self-host only, deploy in week 4
2. Evals — write the docs but skip the implementation
3. Additional sample matters — keep one excellent sample
4. Letter .docx export — markdown preview is enough
5. Live chronology extraction — keep seeded/read-only chronology
6. Contract review implementation — keep roadmap tab only

What does **not** get cut: Pre-Motion (hero), matter workspace (spine), audit log (regulatory plumbing visibility), privilege posture (regulatory plumbing visibility), one plugin invocation through the letter bridge, one working demo matter end-to-end.

## Week 4 stretch goals

Only after the v0.1 core path is green:

1. Add two more sample matters.
2. Add live chronology extraction for a small document set.
3. Add `.docx` export for the CPR-letter bridge.
4. Add contract-review markdown output without redline generation.
