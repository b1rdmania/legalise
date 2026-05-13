# Build Plan — Legalise v1

3 weeks, solo. 4 weeks with realistic 25% buffer. Daily granularity to make slippage visible early.

## Pre-flight

Before Day 1:

- [x] Repo scaffolded with directory structure
- [x] Plan documents written and pushed for review
- [ ] Bird Legal MVP code located and audited — identify which modules port cleanly
- [ ] Pre-Motion code located and audited — identify the simplification path to single-turn
- [ ] `claude-for-uk-legal` plugin invocation pattern from a FastAPI backend resolved (direct subprocess? MCP server? SDK call?)
- [ ] Ollama installed locally, one local model pulled for privilege-mode testing (`llama3.1:70b` or `qwen2.5:72b`)
- [ ] Domain `legalise.dev` pointed (Vercel or CF for the live demo deploy)
- [ ] Azure UK South or AWS eu-west-2 account confirmed for deploy target

## Week 1 — Foundation + Matter workspace

### Day 1 — Skeleton boots
- FastAPI app boots locally: `docker compose up` → `localhost:8000/health` returns 200
- Postgres + pgvector container running, alembic initialised, first migration created
- React + Vite app boots: `localhost:3000` renders an empty shell
- Auth stub: hardcoded user, session via cookie. Production auth is v0.2.
- Model gateway scaffolded: `core/model_gateway.py` with `AnthropicProvider`, `OllamaProvider`. Switch via env var.
- **Done state:** clone, `docker compose up`, see a logged-in empty workspace.

### Day 2 — Matter model and CRUD
- SQLAlchemy models: `User`, `Matter`, `Document`, `Event`, `AuditEntry`, `Role`
- Alembic migration 002: matter tables
- API: `POST /matters`, `GET /matters`, `GET /matters/{slug}`, `POST /matters/{slug}/documents`
- Frontend: matter list page, matter detail page, "new matter" form
- Document upload to MinIO via signed URL
- **Done state:** can create a matter, upload a document, see it listed.

### Day 3 — Audit log
- `AuditEntry` model: actor, matter_id, action, resource_type, resource_id, payload_hash, timestamp
- Middleware that logs every API call touching a matter
- Hook in `model_gateway` that logs every LLM call (prompt hash, response hash, token count, model used, latency)
- Frontend: audit-trail tab on matter detail page
- **Done state:** every action visible in the audit log, hashable, exportable as CSV.

### Day 4 — Filesystem materialisation
- Background job that mirrors a matter to `matters/[slug]/` on disk
  - `matter.md` — facts, parties, case theory (markdown front-matter for structured fields)
  - `history.md` — append-only internal log
  - `documents/` — uploaded files (or symlinks to MinIO)
  - `chronology.md` — created when chronology module is used
- Schema matches Stella's matter folder convention (see `/schemas/matter.json`)
- Re-hydration: dropping a matter folder in re-imports it on next boot
- **Done state:** Postgres ↔ filesystem in sync; matter folder is the source of truth for portability.

### Day 5 — Plugin bridge
- `adapters/plugin_bridge.py` — invokes `claude-for-uk-legal` plugins via subprocess + Claude Code, or via direct MCP if cleaner
- First invocation: from a matter, call `/uk-research-legal:citation-verifier` on a test citation; return result; log it
- Privilege posture wired in — calling a plugin from a B-mixed matter passes the posture as context
- **Done state:** plugins callable from the workspace, output rendered, audit entry created.

### Weekend — Design pass + risk check
- UI polish on the matter detail page. Tailwind + Shadcn components. Solicitor-legible: clear hierarchy, real legal language, no AI-app aesthetic.
- Risk check: are any Day 1–5 deliverables yellow/red? If yes, re-plan week 2 now.

## Week 2 — Hero modules

### Day 6–7 — Pre-Motion
- Backend: `modules/pre_motion/`
  - Endpoint: `POST /matters/{slug}/pre-motion` with inputs (V, P_l, P_q, C_C, C_D, risk tolerance for each side)
  - Compute BATNA per side, ZOPA, Nash midpoint, sensitivity table (±20% on P_l, costs ±50%)
  - Translate to recommended Part 36 / Calderbank offer with deadline timing logic
- Frontend: `modules/pre_motion/`
  - Two-column form (claimant inputs / defendant inputs)
  - Output: ZOPA visualisation (range chart), Nash point highlighted, sensitivity table, recommended offer card
  - Export as PDF (Gotenberg) for client memo
- One full worked example seeded — unfair dismissal claim, mid-value, both sides at 60% confidence — renders end-to-end
- **Done state:** Pre-Motion runs against a real matter, output looks shareable on X.

### Day 8–9 — Chronology
- Backend: `modules/chronology/`
  - Endpoint: `POST /matters/{slug}/chronology/build` — accepts document IDs in scope
  - CPR 31.22 gate: matter must have privilege-posture set; documents must have `from_disclosure` flag set
  - Multi-agent extraction (uses BaseAgent): per-document event extraction → de-dupe → significance tagging
  - Outputs: working chronology (markdown), SoF variant (privileged entries filtered), witness-specific variant (filtered to a named witness)
- Frontend: `modules/chronology/`
  - Document picker (matter's docs, multi-select)
  - Privilege posture banner
  - Output: timeline view, table view, key-events callout
  - Diff view when rebuilt against new documents
- **Done state:** upload three sample disclosure docs, build a chronology, see 🔴/🟡/⚪ tags, get SoF prose output.

### Day 10–11 — Contract review (multi-agent)
- Backend: `modules/contract_review/`
  - Pipeline: `Parser` (extract clauses) → `Analyst` (risk flags per playbook) → `Redliner` (proposed edits) → `Summariser` (stakeholder summary)
  - Each stage logs to audit. Stages run sequentially with streamed status to frontend.
- Frontend: `modules/contract_review/`
  - Upload .docx
  - Live pipeline visualisation: four stage cards, current stage highlighted, intermediate outputs visible
  - Final output: redlined .docx download + plain-language summary + risk table
- **Done state:** upload a real-looking employment contract, watch the four agents run, get redline + summary out.

### Day 12 — CPR-letter drafter
- Backend: `modules/letters/`
  - Endpoint that calls the `cpr-letter-drafter` plugin with matter context
  - Auto-fills parties, facts, claim heads from `matter.md`
  - Returns letter as markdown + .docx
- Frontend: `modules/letters/`
  - Letter type selector (LBC under PACC, Debt Protocol, Prof Neg, etc.)
  - Inputs pre-populated from matter; user edits where needed
  - Output preview + .docx download
- **Done state:** from a matter with parties and facts set, generate a compliant LBC in 30 seconds.

### Weekend — Integration + sample matters
- Three sample matters seeded into the repo for demo:
  - Employment: unfair dismissal claim, three years' service, conduct dismissal
  - Civil: SME debt claim, £18k owing, debtor disputing partially
  - Civil: professional negligence against an accountant, latent damage
- Each matter has documents, an initial chronology, and a Pre-Motion output ready to display
- End-to-end smoke test against each sample

## Week 3 — Polish + Launch

### Day 13–14 — Demo flow
- Landing page at `/` — explains what Legalise is, links to three demo matters
- "Open demo matter" buttons — one-click load of pre-seeded matter into the workspace
- Module navigation cleaned up; consistent header across modules
- Loading states, error states, empty states all handled
- Tailwind theme pass — solicitor-legible (not AI-app gradient soup)

### Day 15 — Live deploy
- Azure UK South (preferred) or AWS eu-west-2
- HTTPS via the platform's managed cert
- Postgres managed instance, MinIO as a small VM, Ollama omitted from live demo (local-only feature)
- Domain `legalise.dev` pointed
- Health check, basic uptime monitoring

### Day 16 — Evals
- One eval per module — input fixtures, expected output shape, scoring against either an LLM judge or string-match heuristics
- `evals/` directory with runnable scripts
- README block explaining the eval approach
- Evals are not gating in v1 but they exist and are documented

### Day 17 — README + launch assets
- Top-level README with:
  - Hero one-liner and demo link
  - Architecture diagram (mermaid)
  - Five-module overview with screenshots
  - Plugin-and-workspace relationship explained
  - Stack rationale (one paragraph)
  - Quickstart (Docker Compose)
  - Self-host vs cloud demo
  - Status: v0.1.0, demo not production
  - Roadmap
  - Contributing
  - License
- One animated GIF of Pre-Motion (input → ZOPA → Nash → offer)
- One screenshot per module
- Mermaid diagrams in README: matter lifecycle, multi-agent contract pipeline, audit-log flow

### Day 18 — Launch
- Show HN Tuesday morning UK time
- X main post + reply with link
- LinkedIn main post + 4 replies (one per module)
- Cross-link from `claude-for-uk-legal` README
- Profile README updated
- Pre-warmed network: 5–10 trusted contacts pinged ahead for stars + comments
- Stella's maintainer DM'd ahead: "Shipping Legalise Tuesday. Matter schema is Stella-compatible. Worth a chat?"
- Be present on HN comments for first 4 hours; reply to everyone

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lawhive recruitment process gets active | M | H — distraction kills the build | Park Lawhive until launch; respond only on launch day or after |
| Bird Legal code is messier to port than expected | M | M — slips Days 6–11 | Day 5 evening, audit ported code; if rough, simplify Pre-Motion to "calculator only" and drop a week-2 stretch goal |
| Plugin bridge takes longer than Day 5 | L | H — blocks Days 8 and 12 | Fallback: skip MCP, call plugins via subprocess + Claude Code CLI |
| Live deploy hits Azure/AWS quota or DNS issue | L | M — slips Day 15 | Have Vercel + Railway as backup deploy targets (Postgres on Neon, app on Railway, domain on CF) |
| Solicitor-legible design takes longer than planned weekend | M | L — week 1 design slips into week 2 | Use a pre-built Shadcn theme and don't customise in v1 |
| Pre-Motion output isn't visually compelling on launch | M | H — kills the hero shot | Day 6 morning: spike one chart library (Recharts/Visx), confirm it can render the ZOPA range cleanly before going deeper |
| Eval framework eats Day 16 | L | L | Cap at one eval per module; integrate properly post-launch |

## Definition of done for v1

- Clone, `docker compose up`, see a working workspace.
- Three sample matters load.
- Each of the five modules runs end-to-end against a sample matter.
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
3. CPR-letter drafter UI — surface the plugin via a simple form, defer richness
4. Contract review redline output (.docx) — output markdown only, defer .docx
5. Chronology diff view — output v1 only, no incremental rebuild

What does **not** get cut: Pre-Motion (hero), matter workspace (spine), audit log (regulatory plumbing visibility), privilege posture (regulatory plumbing visibility), one working demo matter end-to-end.
