# Handover — Round 4 (post Day-6, pre-launch sequencing)

R3 covered Days 2-4 plus the cream→Oxide design switch. This round covers
Days 5, 9 (pulled forward), 6, plus the trust documentation workstream.
All of the above carry reviewer sign-off from the corresponding rounds.

**Repo head:** `94dc281` on `master`. 24 commits total. 4,856 lines of
application code across 44 source files (excluding generated, vendored,
and config).

---

## What I want from this round

1. **Plan-reorder approval.** I want to do Day 8 (Letters) before Day 7
   (Pre-Motion polish — SSE + PDF). Rationale below in §5. Not committed
   to BUILD_PLAN.md until you confirm.
2. **Risk-register refresh.** Several originally-flagged risks are now
   resolved; some new ones surfaced. Sketch in §6.
3. **Audit posture stress-test.** With three module surfaces in scope
   (Matter / Chronology / Pre-Motion + soon Letters), is the
   row-per-mutation invariant holding cleanly? Spot-check anything that
   smells.

---

## 1. Commits in scope this round

| Hash | Day (BUILD_PLAN) | Contents | Smoked by reviewer |
|---|---|---|---|
| `8db3af6` | 5 | Real providers (Anthropic, OpenAI, Ollama) + plugin bridge + `/invoke` endpoint | yes (red — Ollama race) |
| `3d3fabe` | 5 fix | Probe Ollama at boot before registration | yes (green) |
| `986e0ca` | 9 (pulled forward) | Chronology module + CPR 31.22 gate | yes (red — UI-only gate) |
| `231c79c` | 9 fix | Gate is now a server-side access boundary, redaction at the API | yes (green) |
| `cf606f0` | — | `docs/TRUST.md` v0.1 source-of-truth + wiring into README/ROADMAP/BUILD_PLAN | — |
| `b1ffafa` | — | Trust-doc honesty sweep ("Compliant by design" → planned sequencing) | — |
| `e8b5453` | 6 | Pre-Motion 4-stage pipeline (1+3+4+1 = 9 calls per run) ported from standalone repo | yes (red — C_paused fall-through) |
| `94dc281` | 6 fix | C_paused fast-fail before any audit row is written | yes (green, sign-off) |

Two days of build (5 + 6) — but with Day 9 pulled forward, three actual
module surfaces shipped this round: plugin bridge, chronology+gate,
Pre-Motion.

---

## 2. Source surface — what exists today

### Backend (`backend/app/`)

```
main.py                  — lifespan: db ok, provider registration (probe),
                          plugin bridge wiring, dev seed, four routers mounted

core/
  api.py                 — module SDK proxy: get_matter, audit, model_gateway,
                          plugin_bridge (real); require_matter, storage (placeholder)
  audit.py               — middleware: every mutation on /api/matters/* → audit row,
                          including collection-level POST /api/matters and failed 4xx
  auth.py                — hardcoded solicitor user (jasmine.k); v0.2 swap point
  config.py              — pydantic-settings; PLUGINS_ROOT, MATTERS_ROOT, provider keys
  db.py                  — async session dep
  matter_fs.py           — sole writer of files under matters_root; path-traversal
                          guard on document filename; YAML frontmatter mirrors Stella
  model_gateway.py       — ModelGateway singleton; posture re-read from DB in same
                          session; stub-echo always available; provider routing
  seed.py                — Khan v Acme demo matter + 2 docs (1 disclosure) + 7 events

providers/
  __init__.py            — register_providers() with Ollama reachability probe
  anthropic_provider.py  — AsyncAnthropic
  openai_provider.py     — AsyncOpenAI chat completions
  ollama_provider.py     — httpx /api/chat (stream=false in v0.1)

adapters/
  plugin_bridge.py       — SKILL.md parser + matter-context prompt build + gateway
                          dispatch. Plugin/skill id guard

models/                  — User, Matter, Document, Event, AuditEntry. Privilege
                          constants + tag constants exported

api/
  matters.py             — POST/GET /matters, GET /matters/{slug}, doc upload, audit,
                          privilege PATCH, generic plugin /invoke endpoint

modules/
  chronology/router.py   — GET chronology (with server-side redaction when gate
                          required + unconfirmed); POST gate confirmation
  pre_motion/
    schemas.py           — pydantic types for inputs, per-stage outputs, envelope
    agents.py            — 9 agent classes: 1 + 3 + 4 + 1; JSON extractor handles
                          fenced/bare/prose-wrapped responses; AgentCall telemetry
    pipeline.py          — orchestrator: posture fast-fail, sequential stages with
                          asyncio.gather for parallel sub-agents, per-stage commits
                          so model.call rows survive mid-pipeline crashes
    router.py            — POST /matters/{slug}/pre-motion/run

alembic/versions/
  0001_init.py           — pgvector
  0002_matter_tables.py  — users / matters / documents / events / audit_entries
```

### Frontend (`frontend/src/`)

```
App.tsx                  — hash-routed list / new / detail. Detail renders:
                          theory, bundle, pre-motion section (verdict card +
                          stages strip + failure scenarios), chronology
                          (with banner + redacted-row treatment + SoF toggle),
                          audit log, colophon
lib/api.ts               — typed fetch client: matters, documents, audit,
                          chronology + gate, plugin invoke, runPreMotion
lib/route.ts             — minimal hash router
index.css                — Inter + Fira Code import; body defaults
tailwind.config.js       — full Oxide palette per docs/DESIGN.md
```

### Infra / docs

```
docs/
  DESIGN.md              — Oxide-derived token contract (v0.1 design law)
  TRUST.md               — v0.1 source of truth: data flow, sub-processors,
                          LPP architecture, CPR 31.22 access gate, audit
                          shape, compliance order, gaps promoted to §3
  MODULE_DEVELOPMENT.md  — module dev guide
  mockups/matter-detail.html  — visual contract for the detail page

infra/
  docker-compose.yml     — db + redis + minio + gotenberg + ollama (profile
                          off by default) + backend (alembic-on-boot
                          entrypoint, plugins mounted ro) + frontend

backend/
  entrypoint.sh          — alembic upgrade head, then exec uvicorn
  Dockerfile             — entrypoint-driven boot
  pyproject.toml         — anthropic, openai, httpx, structlog all on the path

HANDOVER_R3.md           — Round 3 brief (still relevant for audit-row invariants)
HANDOVER_R4.md           — this file
BUILD_PLAN.md            — remaining days 7-18; cross-cutting trust workstream
ROADMAP.md               — v0.1-v0.5 horizon with trust posture sub-workstream
```

---

## 3. Validation status

Live `docker compose up --build` smoke is **green at `94dc281`**, last
verified by reviewer in the previous round:

```
legalise.providers.ollama_unreachable url=… (expected without --profile local-models)
legalise.providers.registered providers=['stub-echo']
legalise.startup.plugin_bridge exists=True plugins_root=/plugins
legalise.startup.seed_ok slug=khan-v-acme-trading-2026
```

Endpoint matrix that's been smoked end-to-end:

| Endpoint | Behaviour confirmed |
|---|---|
| `GET /health` | DB ok |
| `GET /api/matters` | Khan listed |
| `GET /api/matters/{slug}` | full record |
| `POST /api/matters` | new matter created, slug auto-generated |
| `POST /api/matters/{slug}/documents` | sha256 captured, doc registered |
| `PATCH /api/matters/{slug}/privilege` | posture change + 2 audit rows |
| `GET /api/matters/{slug}/audit` | rows in reverse chronological order |
| `POST /api/matters/{slug}/invoke` | generic plugin call; 3 audit rows on success |
| `GET /api/matters/{slug}/chronology` | redacts disclosure-tainted entries pre-gate |
| `POST /api/matters/{slug}/chronology/gate` | unredacts subsequent fetches |
| `POST /api/matters/{slug}/pre-motion/run` | 9 model calls, verdict envelope, 12 audit rows |
| `POST .../pre-motion/run` under C_paused | 409, 0 model calls, 1 audit row |

The audit-row count invariant is now documented in HANDOVER_R3 §5 and
matches observed behaviour across all three module surfaces.

---

## 4. Known gaps / open items

This list lives canonically in `docs/TRUST.md` §3 ("What v0.1 does not yet
do — read this first"). The build-time picture as of `94dc281`:

| Gap | Lands |
|---|---|
| Single hardcoded user | v0.2 (WorkOS/Stytch) |
| Retention recorded, not enforced | v0.2 |
| Audit log append-only by convention, not Postgres grant | v0.2 (WORM grants) |
| No app-layer encryption of stored prompts/responses | v0.2 evaluate |
| UK residency is partial (Anthropic/OpenAI US, R2 EU) | Acknowledged in TRUST.md; no fix planned in v0.1 |
| Anthropic/OpenAI UK addenda not yet signed | v0.2 |
| DPIA owed, not published | v0.2 |
| No published vuln disclosure programme | v0.2 |
| Insurance gap (firm-side AI exclusions) | Out of scope |
| Pre-Motion has no SSE streaming yet — 30-180s blank wait | Day 7 |
| Pre-Motion has no PDF export | Day 7 / v0.2 stretch |
| Plugin bridge is direct skill rendering, not MCP | v0.2 |
| Binary document storage (vs metadata-only register) | Day 8+ or v0.2 |
| No tests committed | Day 16 evals; minimal Pytest scaffold at Day 11-12 polish |

---

## 5. Proposed reorder: Day 8 (Letters) before Day 7 (Pre-Motion polish)

### Original order
- Day 6-7: Pre-Motion port + Pre-Motion polish (SSE, PDF)
- Day 8: Letters
- Day 9: Chronology (already done out-of-order)
- Day 10+: module tabs, polish, deploy, launch

### Proposed order
- Day 6: Pre-Motion port — **done** at `94dc281`
- **Day 7 → Day 8**: Letters (CPR-letter bridge surface)
- **Day 8 → Day 7**: Pre-Motion polish (SSE streaming, PDF export)
- Day 10+ unchanged

### Why

1. **Breadth before depth.** Pre-Motion already works end-to-end. Polishing
   it before the second module ships means the demo for the next week is
   "one hero module + one well-behaved chronology" rather than "two real
   modules + one hero module that streams nicely". Two real modules makes
   the workspace claim load-bearing.

2. **Lower-variance work first.** Letters is small and follows the proven
   `/invoke` pattern — wrap the `cpr-letter-drafter` skill in a module
   router, drop a UI section on the matter detail. SSE for Pre-Motion is
   non-trivial: needs progress events at sub-agent granularity, Fly's
   HTTP/2 handling, browser EventSource quirks, audit/cost reconciliation
   on disconnect. Lower-variance work earlier reduces tail risk.

3. **Polish window stays naturally**. Day 11-12 is "Integration + sample
   matter polish" in the original plan. SSE + PDF can land in that window
   if they're not done at Day 7. Letters cannot — it adds a module
   surface.

4. **Demo composition improves.** Three-section matter detail (Theory →
   **Pre-Motion + Letters** → Chronology → Audit) reads as a workflow.
   Two-section reads as "we shipped one thing well."

### What I'd cut if the order causes slip

If Day 8 (Letters) overruns: keep Pre-Motion as-is for v0.1; polish (SSE
+ PDF) becomes a v0.2 deliverable. Output is still readable, brutal
sentence renders, structured failure scenarios render. SSE makes it
*feel* live; absence is an experience downgrade, not a correctness gap.

If Day 7 (Pre-Motion polish) overruns: SSE is the higher-impact
deliverable. PDF first to v0.2 stretch, SSE shipped as the launch polish.

---

## 6. Risk register refresh

### Resolved since BUILD_PLAN was written
- ~~Plugin bridge takes longer than Day 5~~ — shipped `8db3af6`, proven end-to-end
- ~~Bird Legal code messier to port than expected~~ — Pre-Motion ported cleanly to `e8b5453`
- ~~Pre-Motion output isn't visually compelling on launch~~ — structured output + brutal sentence callout in place; SSE is the polish layer
- ~~Live deploy hits Azure/AWS quota~~ — stack is Fly + Neon + Cloudflare per docs; no AWS quota risk

### Still live
- **Demo without ANTHROPIC_API_KEY shows borderline-only output.** Stub-echo can't produce JSON, so synthesis falls through to "we do not yet know". Launch posture needs a real key on the live deploy or a recorded video for the demo. **Action:** secure Anthropic billing before Day 15 deploy.
- **SSE complexity is the new tail risk** (replacing the plugin-bridge risk). Mitigation: postpone to Day 11-12 polish window if Day 7 is yellow at the half-day.

### Newly identified
- **Letters skill prompt might need adaptation.** The `cpr-letter-drafter` skill is written for the broader claude-for-uk-legal surface. May need a matter-context shim. **Action:** smoke the prompt against Khan in the bridge first thing on Day 8 morning before building UI.
- **Retention field surfaces in matter footer were already removed (R3 nit)** — verify a UI grep for `retention_until` doesn't regress when Letters lands.
- **Insurance exclusions are firm-side risk** — out of scope but the trust doc surfaces it. Likely the first procurement question from any AI-aware firm.

---

## 7. Remaining days, re-estimated

Original BUILD_PLAN cadence was 18 days. After the reorder and given Day 9
came forward into the Day 5–6 window, current state is:

| Day | Workstream | Estimate |
|---|---|---|
| **7** (new) | Letters — module surface + cpr-letter-drafter wiring | 1 day |
| **8** (new) | Pre-Motion polish — SSE streaming, PDF via Gotenberg | 1–2 days |
| 10 | Module tabs (Contract Review v0.2 label, nav polish) | 0.5 day |
| 11-12 | Integration polish (loading/error/empty states) | 1–2 days |
| 13-14 | Demo flow video + dry runs | 1 day |
| 15 | Live deploy to legalise.dev (Fly + Neon + CF) | 0.5–1 day |
| 16 | Evals (sample-matter smoke tests) | 0.5 day |
| 17 | README + launch assets | 0.5 day |
| 18 | Launch (HN/X/LinkedIn) | live day |

Realistic window: **8-10 working days from now to launch**, assuming no
firefighting needed on Day 5/6 surfaces and the SSE risk doesn't bite.

---

## 8. What to attack before Day 8 begins

1. **Cross-module audit invariant.** With three module surfaces and a
   fourth (Letters) imminent, is the row-count contract clean? Spot check
   the gate-confirmation audit (`chronology.gate.confirmed`) against the
   middleware row — both should land on a single POST to
   `/api/matters/{slug}/chronology/gate`. Anything else is a leak.

2. **Plugin bridge identifier guard.** I rejected `..` and `/` in plugin
   and skill names. Spot-check with adversarial inputs:
   `curl -X POST .../invoke -d '{"plugin":"../../etc","skill":"passwd","inputs":{}}'`.
   Expect 400, not a path read.

3. **Pre-Motion crash provenance.** Force a crash mid-Stage-3 (e.g.
   patch the gateway temporarily to raise after the 5th call) and
   confirm the audit log retains Stage 1-2 rows. The pipeline commits
   per-stage exactly to preserve this.

4. **The frontend `lib/` directory tracking** — gitignore previously
   nuked this folder; verify a fresh clone still has `frontend/src/lib/`.
   `git ls-files frontend/src/lib/` should show `api.ts` and `route.ts`.

5. **Trust-doc currency.** Compare `docs/TRUST.md` §3 (gaps) and §5
   (sub-processors) against the codebase. Anything we built since the
   sweep that contradicts the doc?

---

## 9. Sign-off ask

Two yes/nos:

- **Approve Day 7/8 reorder** (Letters → Pre-Motion polish, per §5)?
- **Audit invariant clean** across the three module surfaces, per the
  §8 attacks?

If both yes, I commit the reorder to BUILD_PLAN.md and roll into Letters.
If either is no, name the change and I'll address before code lands.
