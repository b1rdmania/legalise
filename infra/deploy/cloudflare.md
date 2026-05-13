# Cloudflare deployment

The live demo at `legalise.dev` runs on Cloudflare for the edge layer plus a small backend host. Self-host instructions still run Docker Compose locally.

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
     [ Cloudflare Pages ]         [ Cloudflare Containers ]
        (Vite frontend)              or [ Fly.io UK ]
                                    (FastAPI backend)
                                          |
                            +-------------+-------------+
                            |             |             |
                            v             v             v
                       [ Neon ]      [ R2 ]      [ Anthropic API ]
                    (Postgres UK)  (Storage)   (or local model)
```

## Services

| Layer | Provider | Notes |
|---|---|---|
| DNS + proxy | Cloudflare | `legalise.dev` zone |
| Frontend hosting | Cloudflare Pages | Built from `frontend/` via the Pages build hook |
| Backend hosting | Cloudflare Containers (preferred) or Fly.io (`lhr` region) | FastAPI doesn't run on Workers — needs a container runtime |
| Database | Neon | Postgres 16 + pgvector, UK region (London) |
| Storage | Cloudflare R2 | S3-compatible, free egress, drop-in replacement for MinIO |
| AI | Anthropic API | Local-model toggle (Ollama) is documented as self-host-only — not in the live demo |
| Document conversion | Gotenberg as a separate container | Sidecar to the backend container |

## Setup steps

### 1. Cloudflare account
- Add `legalise.dev` to a Cloudflare account
- Generate an API token scoped to: Pages (read/write), DNS (read/write), R2 (read/write)

### 2. Neon Postgres
- Create a project in London region
- Add `pgvector` extension via SQL editor
- Capture the connection string

### 3. Cloudflare R2 bucket
- Create `legalise-docs` bucket
- Configure CORS for the frontend origin
- Capture S3-compatible credentials (R2 access key + secret)

### 4. Backend deploy

**Option A — Cloudflare Containers (preferred):**

```bash
# Configure wrangler with the Containers project
wrangler containers deploy backend/
```

**Option B — Fly.io (fallback):**

```bash
# From backend/
fly launch --region lhr --no-deploy
# Set secrets per the env vars in .env.example
fly secrets set POSTGRES_DSN="..." ANTHROPIC_API_KEY="..." S3_ACCESS_KEY="..."
fly deploy
```

### 5. Frontend deploy (Cloudflare Pages)

Connect the GitHub repo to Cloudflare Pages:

- **Build command:** `cd frontend && npm install && npm run build`
- **Build output directory:** `frontend/dist`
- **Environment variable:** `VITE_API_BASE_URL=https://api.legalise.dev`

### 6. DNS wiring

- `legalise.dev` → Cloudflare Pages project
- `api.legalise.dev` → Backend container / Fly.io app
- Both proxied through Cloudflare

### 7. Smoke test

- `https://legalise.dev/health` → 200 OK
- `https://api.legalise.dev/health` → `{"status":"ok","version":"0.1.0a0"}`
- One sample matter loads end-to-end

## Why Cloudflare

- UK data residency through Pages (global CDN with UK PoPs) + Neon London + R2 storage.
- R2 free egress materially affects total cost for a content-heavy workspace.
- Pages + Containers gives single-provider operational simplicity for the live demo.
- DNS proxying gives DDoS protection, WAF, and cache layer in front of the backend.

## Why not all-Cloudflare-Workers

Workers don't run Python natively (Pyodide is experimental and FastAPI doesn't fit). Cloudflare Containers (or Fly.io as a fallback) is required for the backend until that changes.

## Operator note

Self-hosters can run the same stack on any S3-compatible storage, any Postgres host, any container runtime. Cloudflare is the maintainer's choice for `legalise.dev`, not a project requirement.
