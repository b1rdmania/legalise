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

```bash
# From backend/
fly launch --region lhr --no-deploy
fly secrets set \
  POSTGRES_DSN="..." \
  ANTHROPIC_API_KEY="..." \
  S3_ENDPOINT="..." \
  S3_ACCESS_KEY="..." \
  S3_SECRET_KEY="..."
fly deploy
```

UK region (`lhr` = London Heathrow). Single-region deployment for v0.1; HA / multi-region is v0.5+.

### 4-alt. Backend deploy — Cloudflare Containers (experimental)

Only use this if you're comfortable with `WEUR` placement instead of UK-specific. See Cloudflare Containers placement and limits documentation. Configure regional constraint `WEUR` and instance size to taste. **Update marketing language to "EU / Western Europe placement" before deploying via this path.**

### 5. Frontend deploy (Cloudflare Pages)

Connect the GitHub repo to Cloudflare Pages:

- **Build command:** `cd frontend && npm install && npm run build`
- **Build output directory:** `frontend/dist`
- **Environment variable:** `VITE_API_BASE_URL=https://api.legalise.dev`

### 5b. Gotenberg sidecar — Fly.io `lhr`

The Pre-Motion PDF export route (`POST /api/matters/{slug}/pre-motion/pdf`) calls Gotenberg's Chromium converter. Self-host already gets this for free via `infra/docker-compose.yml`; the live demo needs a second Fly app in the same region so the backend can reach it over Fly's internal network.

**Why sidecar Fly app and not a hosted PDF API.** Hosted converters (Browserless, Doppio, etc.) add another vendor relationship, another egress path for matter content, and a second residency story to defend. Gotenberg as a sidecar keeps the PDF render inside the same Fly organisation, same `lhr` region, and same operator control. Cost is roughly one shared-CPU-1x instance with auto-stop on idle — near-zero when nobody's exporting.

```bash
# Deploy Gotenberg as its own Fly app in lhr
fly apps create legalise-gotenberg --org <your-org>

cat > /tmp/gotenberg.fly.toml <<'TOML'
app = "legalise-gotenberg"
primary_region = "lhr"

[build]
image = "gotenberg/gotenberg:8"

[[services]]
internal_port = 3000
protocol = "tcp"
auto_stop_machines = true
auto_start_machines = true
min_machines_running = 0

[[services.ports]]
handlers = ["http"]
port = 80

[[vm]]
size = "shared-cpu-1x"
memory_mb = 512
TOML

fly deploy --config /tmp/gotenberg.fly.toml
```

The backend reaches it via Fly's `*.internal` 6PN network — no public ingress needed for the demo. Set on the **legalise backend** app, not the Gotenberg app:

```bash
fly secrets set GOTENBERG_URL="http://legalise-gotenberg.internal:3000"
```

`backend/app/core/config.py:gotenberg_url` reads this env var; no code change required. `auto_stop_machines = true` keeps cost near zero — Fly stops the machine when idle and cold-starts it on the next request (cold start adds a couple of seconds to the first PDF after idle, acceptable for a demo surface).

**Fallback if sidecar is yellow on demo day.** Strip the EXPORT PDF button via a frontend feature flag and ship without PDF. PDF is an experience nicety, not a correctness gap — the Pre-Motion brief is already fully rendered in-page and forensically captured in the audit log.

### 6. DNS wiring

- `legalise.dev` → Cloudflare Pages project
- `api.legalise.dev` → Fly.io app
- Both proxied through Cloudflare

### 7. Smoke test

- `https://legalise.dev/health` → 200 OK
- `https://api.legalise.dev/health` → `{"status":"ok","version":"0.1.0a0"}`
- One sample matter loads end-to-end

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
