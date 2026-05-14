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

**Marketing claim alignment.** With Fly.io `lhr` as backend + Neon London + R2 + Cloudflare Pages, the defensible claim is *"UK-region database and backend; edge CDN and object storage at EU / Western Europe placement."* Don't write "UK data residency end-to-end" — R2's `eu` jurisdiction does not guarantee UK, and Cloudflare Containers is only `WEUR`.

## Preflight — verify before running any of the steps below

```bash
# 1. fly + wrangler CLIs installed and logged in.
fly version && fly auth whoami
wrangler --version && wrangler whoami

# 2. Anthropic API key reachable from the shell that will run fly secrets set.
echo "${ANTHROPIC_API_KEY:?missing}" | head -c 12 ; echo

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
  POSTGRES_DSN="postgresql+psycopg://user:pass@host.neon.tech/legalise?sslmode=require" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
  S3_ACCESS_KEY="..." \
  S3_SECRET_KEY="..." \
  S3_BUCKET="legalise-docs" \
  GOTENBERG_URL="http://legalise-gotenberg.internal:3000" \
  CORS_ORIGINS='["https://legalise.dev"]' \
  SESSION_SECRET="$(openssl rand -hex 32)"

fly deploy
```

**Neon DSN driver prefix is load-bearing.** Neon hands out `postgres://`; the backend uses `psycopg` async and requires `postgresql+psycopg://`. SQLAlchemy will error out at boot if the prefix is wrong. Append `?sslmode=require` — Neon refuses unencrypted connections.

**CORS_ORIGINS is load-bearing on the split deploy.** Cloudflare Pages serves the frontend from `legalise.dev`; Fly serves the backend from `api.legalise.dev`. Every API call (including the SSE stream and the PDF POST) is cross-origin. The backend default already includes `https://legalise.dev` so the secret above is only required if you swap the demo origin. If the secret is unset and the default has been edited away, the browser will block the demo entirely — preflight 200, actual request blocked, no audit row.

**SESSION_SECRET** must be set on the live deploy. The dev default `change-me-in-deployment` is a tripwire — auth-stub cookies signed with it are forgeable.

UK region (`lhr` = London Heathrow). Single-region deployment for v0.1; HA / multi-region is v0.5+.

**Plugin suite vendoring.** `backend/Dockerfile` clones `claude-for-uk-legal` at a pinned commit SHA into `/plugins` during the image build. Bump `PLUGINS_REPO_REF` in the Dockerfile when a new plugin release is needed; the build fails loudly if the ref doesn't exist. Dev compose still bind-mounts a sibling checkout — both paths land at `PLUGINS_ROOT=/plugins`.

**Matter filesystem materialisation is ephemeral on Fly.** `MATTERS_ROOT=/data/matters` writes inside the machine; redeploys wipe it. The DB is the source of truth and the matter folders are derivable, so this is acceptable for the demo. If operators want the matter tree to survive redeploys, attach a Fly Volume and mount it at `/data/matters` — `fly volumes create matters_data --region lhr --size 1`.

### 4-alt. Backend deploy — Cloudflare Containers (experimental)

Only use this if you're comfortable with `WEUR` placement instead of UK-specific. See Cloudflare Containers placement and limits documentation. Configure regional constraint `WEUR` and instance size to taste. **Update marketing language to "EU / Western Europe placement" before deploying via this path.**

### 5. Frontend deploy (Cloudflare Pages)

Connect the GitHub repo to Cloudflare Pages:

- **Build command:** `cd frontend && npm ci && npm run build`
- **Build output directory:** `frontend/dist`
- **Environment variable:** `VITE_API_BASE_URL=https://api.legalise.dev/api`

`npm ci` (not `npm install`) is deliberate: it builds against the committed `frontend/package-lock.json` exactly, refusing to mutate it. This is the right shape for a reproducible deploy. If you see "missing lockfile" errors on Cloudflare Pages, the lockfile is not committed — `git status` to confirm and `git add frontend/package-lock.json`.

The env var must carry both the backend origin **and** the `/api` path segment because backend routes are mounted under `/api/...` regardless of host. `frontend/src/lib/api.ts:API` reads this var at build time and falls back to the same-origin `/api` prefix when unset (which is what the local compose proxy and Vite dev server expect). The TopBar health probe derives the backend origin from `BACKEND_ROOT = API.replace(/\/api\/?$/, "")`, so `/health` lands on `https://api.legalise.dev/health` automatically — do NOT mount health under `/api` on the backend without updating that derivation.

### 5b. Gotenberg sidecar — Fly.io `lhr`

The Pre-Motion PDF export route (`POST /api/matters/{slug}/pre-motion/pdf`) calls Gotenberg's Chromium converter. Self-host already gets this for free via `infra/docker-compose.yml`; the live demo needs a second Fly app in the same region so the backend can reach it over Fly's internal network.

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

**Manual click-through after the curls pass:**
- Visit `https://legalise.dev/`. Hero + four SurfaceCards render, TopBar shows `lhr1` green, `OPEN DEMO MATTER →` is enabled (assumes a seeded matter exists from step 3).
- Click the demo CTA. Matter detail loads, audit log non-empty.
- Click `RUN PREMORTEM →`. SSE stages tick through (4 stage strips, terminal-green "running" → platinum "done"). Final result card renders with verdict.
- Click `EXPORT PDF →`. PDF downloads. Open it — verdict + summary + stages table + failure scenarios all rendered.
- Open the Letters section. Catalogue lists 6 ET letter types (Khan is ET). Click `lba`, then `DRAFT LETTER →`. Draft renders.

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
