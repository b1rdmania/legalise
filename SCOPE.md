# Scope — Legalise v1

## In scope

### v0.1 product surface

v0.1 is a demo with substance, not a complete five-module workspace. The release should prove one coherent matter workflow end-to-end:

1. Matter workspace (CRUD, documents, audit log tab, privilege posture toggle, local-model toggle)
2. Pre-Motion (adversarial premortem — OptimisticAnalyst → EvidenceInspector (3 parallel sub-agents) → PremortemAdversary (4 parallel Opus sub-agents) → Synthesiser; returns ranked failure scenarios and the one brutal one-sentence verdict; ported from the existing premotion app)
3. CPR-letter drafter as the plugin-bridge proof (matter-aware autofill on top of the existing `cpr-letter-drafter` plugin)
4. Chronology as a seeded/read-only demo surface showing the CPR 31.22 gate and privilege filtering shape
5. Contract review as a credible roadmap tab, not an end-to-end v0.1 workflow

The primary demo is one seeded sample matter that threads facts → Pre-Motion → audit entries visibly accumulating → privilege posture change → letter generation. Breadth exists in navigation, but the launch commitment is one excellent workflow.

**Plain-English is launch-week stretch, not a v0.1 surface.** Built on the documented `app.core.api` as an SDK-extensibility proof point. Ships only after the core path is green at end of Day 16. If skipped, the README still links `examples/modules/example-tab/` as the SDK example.

### Regulatory plumbing (demo-grade, visible in UI)

- Audit log of every LLM call and matter action
- Privilege posture as a matter property (A / B / C)
- CPR 31.22 gate on document upload and chronology
- Local model toggle via Ollama
- Document SHA-256 on ingest
- Retention policy fields in the schema only; no prominent UI until enforcement exists
- UK data residency at deployment layer

### Infrastructure

- Docker Compose self-host
- Live demo at `legalise.dev`: Cloudflare Pages (frontend) + Fly.io `lhr` (backend) + Neon Postgres London + Cloudflare R2 (storage)
- Postgres + pgvector + MinIO + Redis + Gotenberg + Ollama (local stack)
- One primary sample matter seeded for the launch narrative, with optional additional sample matters if ahead of plan

### Documentation

- Top-level README with quickstart, architecture diagram, screenshots, demo link
- ARCHITECTURE.md (this directory)
- BUILD_PLAN.md
- ROADMAP.md
- REGULATORY_PLUMBING.md
- CONTRIBUTING.md
- Basic smoke/eval coverage for the primary sample matter and Pre-Motion output shape

### Launch assets

- Demo GIF of Pre-Motion end-to-end
- Screenshots for the matter workspace, Pre-Motion, audit/privilege posture, and letter bridge
- Mermaid diagrams in README (matter lifecycle, plugin bridge, audit flow)
- X main post + reply link
- LinkedIn main post + 4 replies
- Show HN title and first comment

## Out of scope for v1

### Modules deferred

- Discrimination quantum analysis (Vento bands)
- Settlement agreement review (s.203 ERA) as a workspace module — the plugin exists
- End-to-end chronology extraction and chronology diff view
- End-to-end multi-agent contract review and redlined .docx output
- Full CPR-letter module richness beyond the plugin-bridge proof
- Interim relief / freezing orders
- Possession claims
- ET1 quantum tables (pension loss, statutory cap calculator) — basic only, not full
- Conveyancing, corporate, IP, family verticals

### Infrastructure deferred

- Multi-tenant isolation
- Production auth (WorkOS / Stytch / Clerk)
- Background-job worker (Celery / RQ — Redis simple queue only in v1)
- Observability stack (Sentry, OpenTelemetry)
- CI/CD beyond GitHub Actions for lint and test
- Vector search over documents
- E-signature integration (DocuSign)
- E-billing integration (Xero, Clio)
- Case management ETL (Clio, LEAP, ActionStep)

### Compliance scaffolding deferred

- Real audit-log export with hash chain (currently just timestamped entries)
- Encryption-at-rest with customer-managed keys
- SOC 2 / ISO 27001 controls
- Real role-based access control (basic role field exists, not fully enforced)
- Retention enforcement (fields exist, no background job)
- Client portal
- Document watermarking

### UI deferred

- Mobile responsive optimisation (works on mobile, not designed for it)
- Internationalisation
- Dark mode
- Accessibility beyond Shadcn defaults (WCAG audit at v0.2)
- Print stylesheets

### Content deferred

- No new SKILL.md additions in the plugin repo for v0.1
- No marketing site beyond `legalise.dev` landing
- No blog or thought-leadership content
- No video walk-through (demo GIF only)

## Decision log

| Decision | Choice | Alternative considered | Reason |
|---|---|---|---|
| Stack | Python + FastAPI + React | TypeScript + Bun + Next.js | Existing counsel-mvp (Bird Legal) code as pattern reference, AI ecosystem maturity, talent pool, would be the choice for a real ABS backend |
| Counsel-mvp treatment | Pattern reference + prompt seeds | Wholesale port | Counsel-mvp was an MVP not a battle-tested product; carrying MVP debt forward would compromise the platform layer. Reuse what works (BaseAgent, matter-first routers, proven prompts); rebuild on `app.core.api` with audit + privilege + model gateway primitives. |
| Database | Postgres + pgvector | SQLite + Pinecone | Production-ready from day one, one store for everything, audit-friendly |
| Auth in v1 | Stub | Real (WorkOS) | Demo positioning; auth is v0.2 work |
| Plugin bridge | Direct skill rendering | MCP servers | Faster to v1; MCP at v0.2 |
| Demo headliner | Pre-Motion | Contract review | Most novel, most X-shareable, simplest to demo. (Post-pivot framing: Pre-Motion is the canonical demonstration of the bespoke-orchestration surface pattern, not the project's identity — the project is the audited execution layer for legal skills.) |
| Module count | One coherent workflow, with roadmap tabs | 5 end-to-end modules / 12 full Bird Legal MVP surfaces | Quality > breadth at v1; v0.1 should tell one matter story rather than show five isolated demos |
| Live demo | Yes | Self-host only | Investor / solicitor evaluation needs zero-friction click-through |
| Interop with Stella | Data schema match | Stack match (rewrite to Bun) | Faster to ship; protocol-level interop is enough |
| Audit log granularity | Every LLM call + every matter action | Sampled / aggregated | Regulatory credibility prop; demo *of* compliance, not just compliance |
| Privilege posture | First-class matter property | Module-level setting | Cross-cutting concern; needs to influence every module |
| Local model support | In v1 | v0.2 | Privilege story is the differentiator; toggle is cheap to wire |

## Success criteria

### Hard criteria (must be true to call v1 done)

- Docker quickstart works and opens a usable workspace
- One seeded sample matter tells a coherent story from facts to Pre-Motion to audit trail to privilege posture change to letter generation
- Matter workspace, audit log, privilege posture, and model routing are real, not static mockups
- Pre-Motion runs end-to-end and is polished enough to be the headline demo screenshot/GIF
- The CPR-letter drafter proves one real `claude-for-uk-legal` plugin invocation from the workspace
- Audit log captures every LLM call and matter mutation
- Privilege posture changes module behaviour visibly
- Local model toggle works on at least one module
- Live demo at `legalise.dev` accessible
- README + screenshots + mermaid diagrams complete
- Chronology and contract review are clearly labelled as v0.2 roadmap surfaces if they are visible in navigation

### Soft criteria (good outcomes, not gating)

- 100+ stars in first week
- One solicitor inbound
- Stella's maintainer engagement
- 3+ forks
- One PR or issue from someone other than the maintainer
- Front page of Hacker News for 1+ hour

## Anti-scope creep guardrails

The following requests, if they arrive during build week, get a "v0.2" stamp and a date for that:

- "Could you also add [vertical]"
- "What about [integration with X]"
- "We should support [non-UK jurisdiction]"
- "It needs [enterprise feature]"
- "Could we have a mobile app"

The exception: a critical bug or a security issue. Those get fixed immediately and the fix triggers a re-plan of the day's tasks.
