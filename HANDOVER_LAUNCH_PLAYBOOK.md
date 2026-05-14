# Legalise v0.1 Launch Playbook

Repo target: `b1rdmania/legalise`

Current build baseline: `f807b44` plus the R7 re-review cleanup that retires the remaining Plain-English stretch references in `EXECUTIVE_SUMMARY.md` and `SCOPE.md`.

Purpose: take v0.1 from signed-off repo state to public launch without rediscovering deploy, repo-polish, and launch-comms steps from scratch.

## 1. Launch invariant

Do not broaden the claim during launch.

Legalise is:

> the audited execution layer for Claude legal skills.

The public claim is not "legal platform", "production legal tool", or "module marketplace". v0.1 proves:

- matter spine
- audit log
- privilege posture
- model gateway
- installed skill discovery
- Git catalogue approval workflow
- one coherent sample matter
- curated module surfaces proving three patterns: generic invoke, curated multi-skill Letters, bespoke orchestration via Pre-Motion

Anything outside that is v0.2.

## 2. Preflight before deploy

Run from the repo root unless a command says otherwise.

```bash
git status --short
git rev-parse --short HEAD
npm --prefix frontend run typecheck
npm --prefix frontend run build
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up --build
```

In another terminal:

```bash
curl -sS http://localhost:3000/api/health | jq
curl -sS http://localhost:3000/api/modules | jq '{count: (.skills|length), plugins: ([.skills[].plugin] | unique)}'
EVAL_API_BASE=http://localhost:3000/api python3 evals/smoke_letter_routing.py
EVAL_API_BASE=http://localhost:3000/api python3 evals/smoke_sample_matter.py
```

Expected:

- health returns ok
- modules count is `15` with `uk-employment-legal`, `uk-litigation-legal`, `uk-research-legal`
- both eval scripts pass
- if no `ANTHROPIC_API_KEY` is configured, model output is `stub-echo`; that validates shape and audit, not legal quality

## 3. Interactive deploy sequence

The deploy is intentionally interactive because it needs real accounts, secrets, and dashboard actions.

### 3.1 Accounts and tooling

```bash
fly version
fly auth whoami
wrangler --version
```

If Fly is not authenticated:

```bash
fly auth login
```

If Wrangler is missing:

```bash
npm install -g wrangler
wrangler login
```

### 3.2 Neon

Create a Neon project in the London region.

Required database extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Use the SQLAlchemy-compatible URL prefix in Fly secrets:

```text
postgresql+psycopg://...
```

### 3.3 Backend on Fly

From `backend/`:

```bash
fly apps create legalise-api
fly secrets set DATABASE_URL='postgresql+psycopg://...' SESSION_SECRET='...' ANTHROPIC_API_KEY='...' CORS_ORIGINS='https://legalise.dev'
fly deploy
fly status -a legalise-api
fly logs -a legalise-api
```

Expected boot evidence:

- Alembic migrations run
- `legalise.startup.db_ok`
- `legalise.startup.seed_ok slug=khan-v-acme-trading-2026`
- plugin bridge startup log shows `/plugins` exists
- provider registration shows Anthropic if the key is present, otherwise `stub-echo`

### 3.4 Frontend on Cloudflare Pages

Build settings:

- root: `frontend`
- build command: `npm ci && npm run build`
- output directory: `dist`
- env: `VITE_API_BASE_URL=https://api.legalise.dev/api`

Set DNS:

- `legalise.dev` -> Pages
- `api.legalise.dev` -> Fly backend

After deploy:

```bash
curl -sS https://api.legalise.dev/health | jq
curl -sS https://api.legalise.dev/api/modules | jq '{count: (.skills|length), plugins: ([.skills[].plugin] | unique)}'
```

Manual browser pass:

- open `https://legalise.dev`
- click `OPEN DEMO MATTER`
- open `Modules`
- view one prompt body
- return to Khan matter
- run Letters draft
- run Pre-Motion
- open Chronology gate and confirm
- verify Audit shows the latest rows

## 4. Deploy smoke contract

Use this as the minimum green-bar before launch.

```bash
curl -sS https://api.legalise.dev/api/matters/khan-v-acme-trading-2026 | jq '{slug, name, privilege_posture}'
curl -sS https://api.legalise.dev/api/modules | jq '.skills | length'
curl -sS https://api.legalise.dev/api/modules/uk-employment-legal/lba-drafter | head -c 400
curl -sS -X POST https://api.legalise.dev/api/matters/khan-v-acme-trading-2026/letters/draft \
  -H 'content-type: application/json' \
  -d '{"letter_type_id":"lba","inputs":{"recipient":"Acme Trading Ltd"}}' | jq '{model_used, head: (.draft_text[:120])}'
curl -sS -X POST https://api.legalise.dev/api/matters/khan-v-acme-trading-2026/pre-motion/run \
  -H 'content-type: application/json' \
  -d '{"depth":"fast"}' | jq '{verdict: .synthesis.verdict, stages: [.stages[].name]}'
curl -sS 'https://api.legalise.dev/api/matters/khan-v-acme-trading-2026/audit?limit=20' \
  | jq '[.[] | .action] | group_by(.) | map({action: .[0], count: length})'
```

Expected:

- matter loads
- modules count is `15`
- prompt body is real prompt text, not an error
- Letters returns either Anthropic output or clearly marked `stub-echo`
- Pre-Motion returns four stages
- audit contains semantic rows plus middleware rows

## 5. Repo final polish

Before public posting:

```bash
gh repo edit b1rdmania/legalise \
  --description "Audited execution layer for Claude legal skills" \
  --homepage https://legalise.dev \
  --add-topic legal-ai \
  --add-topic legaltech \
  --add-topic claude \
  --add-topic fastapi \
  --add-topic react \
  --add-topic uk-law
```

Final sweeps:

```bash
rg -n "Legalise is a platform|production legal tool|module marketplace|Plain-English ships|launch-week stretch" README.md MANIFESTO.md SCOPE.md EXECUTIVE_SUMMARY.md ROADMAP.md BUILD_PLAN.md docs/TRUST.md
rg -n "TODO|FIXME|stub only|not wired|fake" README.md MANIFESTO.md SCOPE.md EXECUTIVE_SUMMARY.md ROADMAP.md BUILD_PLAN.md docs/TRUST.md frontend/src/App.tsx backend/app
```

Acceptable hits:

- "not a production legal tool"
- "not a module marketplace"
- deliberate `stub-echo` provider references
- roadmap/v0.2 gap lists

## 6. Paired launch structure

Launch both repos as a pair:

- `b1rdmania/legalise` — execution layer
- `b1rdmania/claude-for-uk-legal` — skill catalogue

The cross-link is the point: skills are useful independently, but Legalise shows what happens when legal skills run inside matter/audit/privilege context.

### Hacker News draft

Title:

```text
Show HN: Legalise – audited execution layer for Claude legal skills
```

Body:

```text
I built Legalise, an Apache-2.0 workspace for running legal AI skills inside matter context rather than loose chat.

The idea is simple: legal skills should be reviewable text files, but execution should happen inside a matter-first workspace with audit logs, privilege posture, model routing, and jurisdiction-aware surfaces.

v0.1 is a demo with substance, not production software. It includes:

- a FastAPI/Postgres/React matter workspace
- installed SKILL.md discovery from claude-for-uk-legal
- audited model gateway with Anthropic/OpenAI/Ollama/stub providers
- privilege posture controls
- CPR 31.22 chronology gate
- Letters bridge
- a Pre-Motion adversarial premortem pipeline

Repo: https://github.com/b1rdmania/legalise
Skills repo: https://github.com/b1rdmania/claude-for-uk-legal
Demo: https://legalise.dev

The broader question I'm testing: should legal AI tools be prompt-first apps, or audited execution layers over reviewable legal skills?
```

First comment:

```text
Important caveat: this is not legal advice software and not something a regulated practice should run on live matters yet.

The v0.1 target is developer-visible substance: matter spine, audit shape, privilege posture, model routing, and Git-distributed skills. Users/settings, per-workspace enablement, module permissions, signed manifests, and production trust controls are v0.2+.
```

### X / Twitter draft

```text
I built Legalise: an Apache-2.0 audited execution layer for Claude legal skills.

Legal skills live as reviewable SKILL.md files.
Legalise runs them inside matter context with audit logs, privilege posture, model routing, and UK legal workflow surfaces.

Repo: https://github.com/b1rdmania/legalise
Skills: https://github.com/b1rdmania/claude-for-uk-legal
Demo: https://legalise.dev
```

### LinkedIn draft

```text
I have open-sourced Legalise v0.1.

It is an audited execution layer for Claude legal skills: legal prompts live as reviewable markdown skills, while Legalise provides the matter workspace, audit log, privilege posture, model routing, and UK workflow surfaces around them.

v0.1 is a demo with substance rather than production software. The point is to make legal AI work more inspectable: what skill ran, against which matter, through which model, with what privilege posture, and with what audit trail.

Repository: https://github.com/b1rdmania/legalise
Skills catalogue: https://github.com/b1rdmania/claude-for-uk-legal
Demo: https://legalise.dev
```

## 7. First four hours

Reply discipline:

- Answer technical questions with links to files.
- Do not get dragged into "AI lawyer" framing. Repeat: drafts for solicitor review, not legal advice.
- If asked "is this production ready?", say no and point to `docs/TRUST.md` and README's v0.1 gap list.
- If asked "why not SaaS?", say the OSS core is for self-hosted inspection; managed hosting can come later without gating the spine.
- If asked "why no users/settings?", say v0.1 proves execution layer and catalogue shape; auth/settings are v0.2.
- If asked "why Claude skills?", say skills are a clean review unit, and Legalise adds governed execution rather than inventing another prompt format.

Keep a running notes file with:

- bug reports
- repeated questions
- module ideas people actually ask for
- trust/procurement questions
- installation friction

Those become the v0.2 issue set.

## 8. Warm contact pings

Send after the HN post is live, not before.

Short DM:

```text
I just launched Legalise v0.1: an Apache-2.0 audited execution layer for Claude legal skills.

It is not production legal software yet, but it shows the shape: reviewable legal skills, matter context, audit logs, privilege posture, model routing.

Would value your critical read if you have 5 minutes:
https://github.com/b1rdmania/legalise
https://legalise.dev
```

Targets:

- UK legaltech founders
- solicitors who have previously reacted to AI/legal ops work
- open-source AI tool builders
- legal engineers
- developer friends who will actually try Docker quickstart

## 9. Stella maintainer DM

Keep it friendly-parallel, not competitor-y.

```text
Hi — I launched Legalise v0.1, an Apache-2.0 UK-shaped legal AI workspace.

I referenced Stella as the friendly parallel in the planning docs: matter-first workspace, but different jurisdiction and stack. Legalise matches the matter-schema shape at the data layer rather than trying code-level interop.

Would welcome your critical read, especially on schema compatibility and whether the "audited execution layer for legal skills" framing is a useful adjacent direction.

Repo: https://github.com/b1rdmania/legalise
Demo: https://legalise.dev
```

## 10. Stop conditions

Do not launch if any of these are true:

- `docker compose up --build` fails from a clean clone
- live `https://api.legalise.dev/api/modules` does not return installed skills
- the demo matter does not load
- Letters or Pre-Motion hard-crash rather than returning either Anthropic output or `stub-echo`
- README or landing copy claims production readiness
- README or landing copy implies a module marketplace exists
- `docs/TRUST.md` contradicts the deploy region or provider setup

If one trips, fix it before posting.
