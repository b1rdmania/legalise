# Cloudflare deployment

The live demo at `legalise.dev` runs on Cloudflare for the edge layer plus Fly.io `lhr` for the backend. Self-host instructions still run Docker Compose locally.

This guide is for the maintainer; operators can deploy anywhere.

## Architecture

```
                          User
                            |
                            v
                  [ Cloudflare DNS + proxy ]
                            |
              +-------------+-------------+
              |                           |
              v                           v
     [ Cloudflare Pages ]            [ Fly.io lhr ]
        (Vite frontend)             (FastAPI backend)
                                          |
                            +-------------+-------------+
                            |             |             |
                            v             v             v
                       [ Neon ]      [ R2 ]      [ Anthropic API ]
                  (Postgres London) (Storage)   (or local model)
```

## Services and honest data-residency

| Layer | Provider | Region | Residency claim |
|---|---|---|---|
| DNS + proxy | Cloudflare | Global edge with EU/UK PoPs | Edge proxying only — no client-data persistence |
| Frontend hosting | Cloudflare Pages | Global edge | Static assets; no client-data persistence |
| Backend hosting | Fly.io `lhr` (default) | London, UK | Backend compute in UK |
| Backend hosting (experimental) | Cloudflare Containers | `WEUR` placement constraint — EU / Western Europe | Strongest available Cloudflare Containers regional constraint; not UK-only. Use only after explicit downgrade of marketing language from UK to EU/WEUR. |
| Database | Neon | London (UK) | Postgres data in UK |
| Storage | Cloudflare R2 | Location hint `WEUR` + jurisdiction `eu` | Hint is best-effort. `eu` jurisdiction is the only contractual guarantee — not UK-only. |
| AI provider | Anthropic API | US-managed by default | Local-model toggle (Ollama) is documented as self-host-only — not in the live demo. |

**Marketing claim alignment.** With Fly.io `lhr` as backend + Neon London + R2 + Cloudflare Pages, the defensible claim is *"UK-region database and backend; edge CDN and object storage at EU / Western Europe placement."* Do not claim that every byte stays in the UK — R2's `eu` jurisdiction does not guarantee UK, and Cloudflare Containers is only `WEUR`.

## Preflight — verify before running any of the steps below

```bash
# 1. fly + wrangler CLIs installed and logged in.
fly version && fly auth whoami
wrangler --version && wrangler whoami

# 2. Secrets generators available. Used to mint SESSION_SECRET and
# LEGALISE_KEY_ENCRYPTION_SECRET in step 4. No server-paid model key
# needed: production posture is BYO user keys (see §server-key posture
# below).
command -v openssl >/dev/null && echo OK || echo "MISSING — install openssl"

# 3. legalise.dev domain present in the Cloudflare account.
wrangler domains list 2>/dev/null | grep -F legalise.dev || echo "MISSING — add legalise.dev to Cloudflare first"

# 4. Neon project exists in the London region with pgvector installed.
# (Manual — open the Neon dashboard, copy the connection string and rewrite
# its postgres:// prefix to postgresql+psycopg:// before storing in your
# password manager.)

# 5. Frontend lockfile is committed. Reproducible builds need it.
git ls-files frontend/package-lock.json | grep -q . && echo OK || echo "MISSING — commit frontend/package-lock.json"
```

If any of the above red, **stop** and fix it before continuing. The setup steps assume all five are green.

## Setup steps

### 1. Cloudflare account

- Add `legalise.dev` to a Cloudflare account
- Generate an API token scoped to: Pages (read/write), DNS (read/write), R2 (read/write)

### 2. Neon Postgres

- Create a project in **London (UK)** region
- Add `pgvector` extension via SQL editor
- Capture the connection string

### 3. Cloudflare R2 bucket

- Create `legalise-docs` bucket with jurisdiction `eu` and location hint `WEUR`
- Configure CORS for the frontend origin
- Capture S3-compatible credentials (R2 access key + secret)

### 4. Backend deploy — Fly.io `lhr` (default)

`backend/fly.toml` ships with the repo — `app = "legalise-backend"`, `primary_region = "lhr"`, public `http_service` on internal port 8000 with a 15s `/health` check, single shared-cpu-2x machine, `min_machines_running = 1`. Update `app` if you want a different Fly app name; everything else is dialled in for the demo.

```bash
# From backend/. --copy-config picks up the committed fly.toml so the
# interactive prompts don't override health-check / port / region.
fly launch --no-deploy --copy-config

fly secrets set \
  ENVIRONMENT="demo" \
  POSTGRES_DSN="postgresql+psycopg://user:pass@host.neon.tech/legalise?sslmode=require" \
  S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
  S3_ACCESS_KEY="..." \
  S3_SECRET_KEY="..." \
  S3_BUCKET="legalise-docs" \
  GOTENBERG_URL="http://legalise-gotenberg.internal:3000" \
  CORS_ORIGINS='["https://legalise.dev"]' \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  SESSION_COOKIE_SECURE="true" \
  LEGALISE_KEY_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
  RESEND_API_KEY="re_..." \
  EMAIL_FROM="Legalise <no-reply@legalise.dev>" \
  EMAIL_VERIFY_URL_BASE="https://legalise.dev/#/auth/verify" \
  PASSWORD_RESET_URL_BASE="https://legalise.dev/#/auth/reset" \
  GITHUB_SUBMISSION_TOKEN="github_pat_..." \
  TURNSTILE_SITE_KEY="0x4AAA..." \
  TURNSTILE_SECRET_KEY="0x4AAA..."

fly deploy
```

**Startup invariants will refuse to boot otherwise.** `main.lifespan` calls `assert_master_key_present` and `assert_auth_secrets_present` before binding the HTTP listener. In any non-dev `ENVIRONMENT`, the following are mandatory:

- `LEGALISE_KEY_ENCRYPTION_SECRET` — 32-byte hex; encrypts `user_api_keys` at rest. Generate once, store forever; rotation is a v0.2 ops task.
- `SESSION_SECRET` — must not be `change-me-in-deployment`. Signs verify + reset JWTs.
- `SESSION_COOKIE_SECURE=true` — session cookies ride only over HTTPS.
- `RESEND_API_KEY` — without it, signup creates an unverified account that can never log in; the boot guard refuses this configuration so registration never silently no-ops.

**Server-key posture.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are deliberately absent from prod secrets. The gateway resolves Anthropic / OpenAI keys per-user from `user_api_keys` (BYO key, AES-256-GCM at rest). The server-key fallback is dev-only — `model_gateway.py:392-394` requires `environment in _DEV_ENVIRONMENTS` AND `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true`, so the fallback cannot fire in production regardless of flag value. Setting a server key in prod adds cost exposure and "Legalise provides model access" positioning ambiguity for zero functional benefit. Their absence is self-documenting.

**Neon DSN driver prefix is load-bearing.** Neon hands out `postgres://`; the backend uses `psycopg` async and requires `postgresql+psycopg://`. SQLAlchemy will error out at boot if the prefix is wrong. Append `?sslmode=require` — Neon refuses unencrypted connections.

**CORS_ORIGINS is load-bearing on the split deploy.** Cloudflare Pages serves the frontend from `legalise.dev`; Fly serves the backend from `api.legalise.dev`. Every API call (including the SSE stream and the PDF POST) is cross-origin. The backend default already includes `https://legalise.dev` so the secret above is only required if you swap the demo origin. If the secret is unset and the default has been edited away, the browser will block the demo entirely — preflight 200, actual request blocked, no audit row.

**SESSION_SECRET** must be set on the live deploy. The dev default `change-me-in-deployment` is a tripwire — auth-stub cookies signed with it are forgeable.

**`GITHUB_READ_TOKEN` is optional.** Read-only PAT (no scopes needed for public repos) that raises the GitHub API rate limit for the skill importers. The legacy `GITHUB_SUBMISSION_TOKEN` env name still works.

UK region (`lhr` = London Heathrow). Single-region deployment for v0.1; HA / multi-region is v0.5+.

**Matter filesystem materialisation is ephemeral on Fly.** `MATTERS_ROOT=/data/matters` writes inside the machine; redeploys wipe it. The DB is the source of truth and the matter folders are derivable, so this is acceptable for the demo. If operators want the matter tree to survive redeploys, attach a Fly Volume and mount it at `/data/matters` — `fly volumes create matters_data --region lhr --size 1`.

### 4-alt. Backend deploy — Cloudflare Containers (experimental)

Only use this if you're comfortable with `WEUR` placement instead of UK-specific. See Cloudflare Containers placement and limits documentation. Configure regional constraint `WEUR` and instance size to taste. **Update marketing language to "EU / Western Europe placement" before deploying via this path.**

### 5. Frontend deploy (Cloudflare Pages)

Connect the GitHub repo to Cloudflare Pages:

- **Build command:** `cd frontend && npm ci && npm run build`
- **Build output directory:** `frontend/dist`
- **Environment variables:**
  - `VITE_API_BASE_URL=https://api.legalise.dev/api`
  - `VITE_TURNSTILE_SITE_KEY=<same value as TURNSTILE_SITE_KEY on the backend>` — required for the public module submission flow widget. If `submission_enabled=false` at launch, the page never renders the widget and this var is unused; provision it anyway so the flag flip is a config change, not a Pages re-deploy.

`npm ci` (not `npm install`) is deliberate: it builds against the committed `frontend/package-lock.json` exactly, refusing to mutate it. This is the right shape for a reproducible deploy. If you see "missing lockfile" errors on Cloudflare Pages, the lockfile is not committed — `git status` to confirm and `git add frontend/package-lock.json`.

The env var must carry both the backend origin **and** the `/api` path segment because backend routes are mounted under `/api/...` regardless of host. `frontend/src/lib/api.ts:API` reads this var at build time and falls back to the same-origin `/api` prefix when unset (which is what the local compose proxy and Vite dev server expect). The TopBar health probe derives the backend origin from `BACKEND_ROOT = API.replace(/\/api\/?$/, "")`, so `/health` lands on `https://api.legalise.dev/health` automatically — do NOT mount health under `/api` on the backend without updating that derivation.

### 5b. Gotenberg sidecar — Fly.io `lhr`

Document HTML→PDF rendering (document version exports) calls Gotenberg's Chromium converter. Self-host already gets this for free via `infra/docker-compose.yml`; the live demo needs a second Fly app in the same region so the backend can reach it over Fly's internal network.

**Why sidecar Fly app and not a hosted PDF API.** Hosted converters (Browserless, Doppio, etc.) add another vendor relationship, another egress path for matter content, and a second residency story to defend. Gotenberg as a sidecar keeps the PDF render inside the same Fly organisation, same `lhr` region, and same operator control. Cost is one always-on `shared-cpu-1x` machine — roughly $3/month.

**Why always-on and not autostop.** Fly's autostop/autostart is a service-proxy feature — it's triggered by traffic arriving at a `[[services]]` or `[http_service]` block, which we deliberately don't have (zero public ingress, see below). Stopped machines are also excluded from `*.internal` DNS, so even an in-cluster `.internal` HTTP call cannot wake one. The two coherent shapes are:

1. **Always-on, internal-only `.internal`** — what we ship for v0.1. One machine running 24/7, no public IP, reachable from the backend over 6PN. ~$3/month.
2. **Flycast + autostop** — private `[http_service]` block with a Flycast IP. Fly's proxy wakes the machine on a backend call to `legalise-gotenberg.flycast`. More config, more Fly-specific knowledge, harder to swap to a different runtime later.

We pick (1) for v0.1: simpler config, no cold-start latency on first PDF, trivial cost for a demo surface. If PDF becomes load-bearing in v0.2 and the cost matters, swap to (2).

```bash
# Deploy Gotenberg as its own Fly app in lhr
fly apps create legalise-gotenberg --org <your-org>

cat > /tmp/gotenberg.fly.toml <<'TOML'
app = "legalise-gotenberg"
primary_region = "lhr"

[build]
  image = "gotenberg/gotenberg:8"

# NO [[services]] / [http_service] block. The Gotenberg app must have
# ZERO public ingress — Fly's default with no services block is "no
# listener", which is the posture we want. The backend reaches the
# sidecar over Fly's *.internal 6PN network only. Adding a services
# block would expose an unauthenticated PDF converter that accepts
# arbitrary HTML — that's a public abuse surface and a leak vector for
# matter-derived markup.
#
# Consequence: autostop/autostart do NOT apply (those are service-proxy
# features). The machine runs 24/7. Use Flycast + [http_service] in v0.2
# if cost or scale make that the wrong trade.

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
TOML

fly deploy --config /tmp/gotenberg.fly.toml
```

The backend reaches it over Fly's `*.internal` 6PN network. The Gotenberg image listens on port 3000 inside the machine and is addressable as `legalise-gotenberg.internal:3000` from any other Fly app in the same organisation — no DNS publication, no public IP. The machine must be running for the `.internal` DNS lookup to resolve, which is why we hold the always-on posture above. Set on the **legalise backend** app, not the Gotenberg app:

```bash
fly secrets set GOTENBERG_URL="http://legalise-gotenberg.internal:3000"
```

`backend/app/core/config.py:gotenberg_url` reads this env var; no code change required.

**Verify no public ingress** after `fly deploy`:

```bash
fly ips list --app legalise-gotenberg   # expect: empty
fly status --app legalise-gotenberg     # expect: no public IPs, no services
```

If `fly ips list` shows any IP, the deploy picked up an unintended services block — `fly ips release` and re-deploy with the config above.

**Fallback if sidecar is yellow on demo day.** Strip the EXPORT PDF button via a frontend feature flag and ship without PDF. PDF is an experience nicety, not a correctness gap — the Pre-Motion brief is already fully rendered in-page and forensically captured in the audit log.

### 6. DNS wiring

- `legalise.dev` → Cloudflare Pages project
- `api.legalise.dev` → Fly.io app
- Both proxied through Cloudflare

### 7. Smoke test

The deploy is only green when **every line below** returns the expected output. Run them top-to-bottom — earlier failures usually mean the next ones are noise.

```bash
# 1. Backend liveness + DB connectivity. Expect status=ok, database=ok.
curl -s https://api.legalise.dev/health | jq .

# 2. Plugin suite shipped in the image. Expect a non-empty array including
# "lba-drafter" and "cpr-letter-drafter".
fly ssh console --app legalise-backend -C 'ls /plugins/uk-employment-legal/skills /plugins/uk-litigation-legal/skills'

# 3. Seeded Khan matter present. The committed fly.toml sets
# ENVIRONMENT=demo, which runs the idempotent seed on every boot. Expect
# one matter with slug "khan-v-acme-trading-2026".
curl -s https://api.legalise.dev/api/matters | jq '.[].slug'

# 4. Gotenberg sidecar has NO public IP. Expect empty output.
fly ips list --app legalise-gotenberg

# 5. Frontend serves and bundle inlines the right API base.
curl -sI https://legalise.dev/ | head -1
curl -s https://legalise.dev/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
# Then fetch that asset and grep for the API base — expect a match.
ASSET=$(curl -s https://legalise.dev/ | grep -oE 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://legalise.dev/$ASSET" | grep -o 'https://api.legalise.dev/api'

# 6. CORS preflight from the Pages origin. Expect 200 with
# Access-Control-Allow-Origin: https://legalise.dev.
curl -sI -X OPTIONS https://api.legalise.dev/api/matters \
  -H "Origin: https://legalise.dev" \
  -H "Access-Control-Request-Method: GET" | head -10
```

#### 7a. SSE-disconnect-during-Contract-Review smoke

The Contract Review pipeline streams stage frames over SSE and runs the
work as a `BackgroundTask` on the same request. v0.1 has no `arq` / Redis
job runner (locked for v0.2 in `docs/ROADMAP.md`). This
smoke step exists to surface job-runner brittleness — orphaned tasks,
leaked DB sessions, half-written audit rows — before launch instead of
during it.

Run against the seeded Khan matter:

```bash
# 1. Kick off an export durable job.
curl -s \
  -X POST \
  https://api.legalise.dev/api/matters/khan-v-acme-trading-2026/export

# 2. Poll GET /api/matters/{slug}/jobs/{job_id} until terminal.
sleep 30

# 3. Tail the backend logs for the matter slug. Expect to see no
# 'asyncio Task was destroyed but it is pending' warnings.
fly logs --app legalise-backend | grep -E "khan-v-acme-trading-2026|asyncio|Task was destroyed" | tail -40

# 4. Verify the audit log via the API. Expect at least one terminal row
# for the contract_review module for this matter.
curl -s https://api.legalise.dev/api/matters/khan-v-acme-trading-2026/audit \
  | jq '[.[] | select(.module == "contract_review")] | .[-3:]'
```

**Green state — all four must hold:**
- The job reaches a terminal state via `GET /api/matters/{slug}/jobs/{job_id}`.
- No `asyncio Task was destroyed but it is pending` warning in logs.
- No `SQLAlchemy DBAPIError` or `connection already closed` in logs
  (the worker DB session must close cleanly).
- Re-running the smoke from step 1 creates a fresh job.

**If any of the above fail, do not promote to launch.** This is the
signal that `arq` + Redis (the locked v0.2 direction) needs to land before
v0.1 ships, not after. Surface to Andy.

**Manual click-through after the curls pass:**
- Visit `https://legalise.dev/`.
- Open the demo matter.
- Confirm Chat, Documents, Skills, Record, Signed outputs, and Working pack
  are reachable.
- Run a ready skill. The output should render, offer Review & sign, and link to
  the Record for the invocation.
- Start a Working pack export and confirm the job reaches a terminal state.

If any of the curl steps red, **do not proceed** — debug before the click-through wastes Anthropic tokens.

## Why this combination

- Fly.io `lhr` gives an actual UK backend region — load-bearing for UK firms who may evaluate the demo.
- Neon London for Postgres aligns with the backend.
- Cloudflare R2 + Pages provides cheap egress, edge CDN, DDoS / WAF. The catch is that R2 jurisdiction `eu` is broader than UK; honest residency language reflects that.
- Cloudflare DNS + proxy in front of the Fly.io backend gives one consistent edge.

## Why not Cloudflare Workers / Containers as default

- Workers don't run Python natively (Pyodide is experimental; FastAPI doesn't fit).
- Cloudflare Containers' tightest regional constraint is `WEUR`, not UK-only. For UK marketing optics, Fly.io `lhr` is cleaner. Containers is the experimental fallback if Fly.io becomes unavailable or for future portability.

## Operator note

Self-hosters can run the same stack on any S3-compatible storage, any Postgres host, any container runtime. Cloudflare + Fly.io is the maintainer's choice for `legalise.dev`, not a project requirement.
