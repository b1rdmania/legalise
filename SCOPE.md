# Scope — Legalise v1

## In scope

### Five modules

1. Matter workspace (CRUD, documents, audit log tab, privilege posture toggle, local-model toggle)
2. Pre-Motion (settlement analysis — BATNA, ZOPA, Nash, Part 36 / Calderbank translation)
3. Chronology (multi-document event extraction, CPR 31.22 gate, significance tagging, SoF variant)
4. Contract review (4-agent pipeline: Parser → Analyst → Redliner → Summariser, redlined .docx output)
5. CPR-letter drafter (form on top of the `cpr-letter-drafter` plugin, matter-aware autofill)

### Regulatory plumbing (demo-grade, visible in UI)

- Audit log of every LLM call and matter action
- Privilege posture as a matter property (A / B / C)
- CPR 31.22 gate on document upload and chronology
- Local model toggle via Ollama
- Document SHA-256 on ingest
- Retention policy fields (not enforced in v1)
- UK data residency at deployment layer

### Infrastructure

- Docker Compose self-host
- Live demo at `legalise.dev` (Azure UK South or AWS eu-west-2)
- Postgres + pgvector + MinIO + Redis + Gotenberg + Ollama
- Three sample matters seeded for demo

### Documentation

- Top-level README with quickstart, architecture diagram, screenshots, demo link
- ARCHITECTURE.md (this directory)
- BUILD_PLAN.md
- ROADMAP.md
- REGULATORY_PLUMBING.md
- CONTRIBUTING.md
- One eval per module (documented, basic implementation)

### Launch assets

- Demo GIF of Pre-Motion end-to-end
- Screenshot per module
- Mermaid diagrams in README (matter lifecycle, contract pipeline, audit flow)
- X main post + reply link
- LinkedIn main post + 4 replies
- Show HN title and first comment

## Out of scope for v1

### Modules deferred

- Discrimination quantum analysis (Vento bands)
- Settlement agreement review (s.203 ERA) as a workspace module — the plugin exists
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

- Beyond the 5 modules, no new SKILL.md additions in the plugin repo
- No marketing site beyond `legalise.dev` landing
- No blog or thought-leadership content
- No video walk-through (demo GIF only)

## Decision log

| Decision | Choice | Alternative considered | Reason |
|---|---|---|---|
| Stack | Python + FastAPI + React | TypeScript + Bun + Next.js | Existing Bird Legal code, AI ecosystem maturity, talent pool, would be the choice for a real ABS backend |
| Database | Postgres + pgvector | SQLite + Pinecone | Production-ready from day one, one store for everything, audit-friendly |
| Auth in v1 | Stub | Real (WorkOS) | Demo positioning; auth is v0.2 work |
| Plugin bridge | Direct skill rendering | MCP servers | Faster to v1; MCP at v0.2 |
| Hero module | Pre-Motion | Contract review | Most novel, most X-shareable, simplest to demo |
| Module count | 5 | 12 (full Bird Legal MVP coverage) | Quality > breadth at v1 |
| Live demo | Yes | Self-host only | Investor / solicitor evaluation needs zero-friction click-through |
| Interop with Stella | Data schema match | Stack match (rewrite to Bun) | Faster to ship; protocol-level interop is enough |
| Audit log granularity | Every LLM call + every matter action | Sampled / aggregated | Regulatory credibility prop; demo *of* compliance, not just compliance |
| Privilege posture | First-class matter property | Module-level setting | Cross-cutting concern; needs to influence every module |
| Local model support | In v1 | v0.2 | Privilege story is the differentiator; toggle is cheap to wire |

## Success criteria

### Hard criteria (must be true to call v1 done)

- All 5 modules run end-to-end against at least one sample matter
- Audit log captures every LLM call and matter mutation
- Privilege posture changes module behaviour visibly
- Local model toggle works on at least one module
- Live demo at `legalise.dev` accessible
- README + screenshots + mermaid diagrams complete
- One eval per module documented (and ideally runnable)

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
