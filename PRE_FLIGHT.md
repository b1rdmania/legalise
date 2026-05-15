# Pre-flight — interactive checklist before Day 15 deploy

What Andy needs to do on his Mac before `infra/deploy/cloudflare.md`
becomes runnable. Each section ends in a checkable green state. The
deploy runbook assumes every box here is ticked.

Treat this as one sitting — ~45 min if the accounts are clean,
longer if any provider needs ID verification.

---

## 1. Ollama + local model (optional but tested for self-host story)

The "local-model toggle" pitch needs a working `ollama` pointed at a
real model. Production demo runs Anthropic; this is for the self-host
section of TRUST.md and AUTH.md to be more than aspirational.

```bash
# Install
brew install ollama

# Pull a local model — choose one (size in parens is on-disk)
ollama pull llama3.1:8b           # 4.7 GB, fast, solid general baseline
# or
ollama pull deepseek-r1:8b        # 5.0 GB, reasoning-tuned, slower
# or
ollama pull qwen2.5:7b            # 4.4 GB, good balance

# Start the server (background)
ollama serve &

# Verify
curl -s http://localhost:11434/api/tags | jq '.models[].name'
```

**Done state.** `curl http://localhost:11434/api/tags` lists at least
one model. Pointing Legalise at it via `OLLAMA_BASE_URL` is documented
in TRUST.md §10 / AUTH.md self-host section.

You don't need this for the live demo. Skip if you want — log it as
"deferred, self-host docs reference Ollama by URL, operator drives".

---

## 2. Cloudflare — DNS + Pages + R2

### 2a. Add `legalise.dev` to Cloudflare

1. Cloudflare dashboard → **Add a Site** → `legalise.dev`
2. Pick the **Free** plan
3. Cloudflare scans existing DNS — note the records, you'll re-create
   only the ones you want
4. Cloudflare gives you two nameservers (e.g. `gabe.ns.cloudflare.com`,
   `lola.ns.cloudflare.com`)
5. **Update nameservers at your registrar** (Namecheap, per memory).
   Namecheap dashboard → Domain List → `legalise.dev` → Manage →
   Nameservers → Custom DNS → paste both
6. Propagation: usually minutes; can take up to 24 hours. Verify:
   ```bash
   dig +short NS legalise.dev
   ```
   Both Cloudflare nameservers should appear.

### 2b. Generate scoped API token

Cloudflare dashboard → My Profile → **API Tokens** → Create Token →
**Custom token** with the following permissions:

| Type | Scope | Permission |
|---|---|---|
| Account | Cloudflare Pages | Edit |
| Account | Cloudflare R2 | Edit |
| Zone (legalise.dev) | DNS | Edit |

- Account Resources: include this specific account only
- Zone Resources: include `legalise.dev` only
- IP Address Filtering: leave open for now
- TTL: 1 year

Copy the token. Stash it in 1Password under "Legalise Cloudflare API
token". You'll feed it to `wrangler` on the deploy box.

### 2c. R2 bucket — EU jurisdiction

Cloudflare dashboard → **R2** → Create bucket:

- Name: `legalise-prod-matters` (or whatever you'll reference in env)
- Location: **EU (eu)** jurisdiction — required for the residency
  claim in `infra/deploy/cloudflare.md`
- Storage class: Standard

R2 generates an Access Key + Secret Key — capture both. They'll go into
the backend env as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.

### 2d. Verify wrangler

```bash
# Install if not already
brew install cloudflare-wrangler

# Authenticate (opens browser)
wrangler login

# Confirm
wrangler whoami
wrangler r2 bucket list   # should show legalise-prod-matters
```

**Done state.**
- `dig +short NS legalise.dev` returns both Cloudflare nameservers
- 1Password has the scoped API token
- `wrangler r2 bucket list` shows the bucket
- R2 access keys saved in 1Password

---

## 3. Fly.io — backend in `lhr`

### 3a. Account + CLI

```bash
brew install flyctl
fly auth signup            # if no account
fly auth login             # if existing account
fly auth whoami
```

Add a payment method (Hobby tier is fine for v0.1: shared-cpu-1x runs
single-region for under $10/mo plus DB egress).

### 3b. Choose `lhr` region

```bash
fly platform regions | grep lhr
# lhr  London, United Kingdom
```

The repo's `fly.toml` already pins `primary_region = "lhr"` —
double-check before launching:

```bash
grep "primary_region" backend/fly.toml
```

Should print `primary_region = "lhr"`.

### 3c. Create the apps (don't deploy yet)

```bash
# Main backend app
fly apps create legalise

# Gotenberg PDF sidecar (per cloudflare.md §5b)
fly apps create legalise-gotenberg
```

If "name unavailable", append a short suffix and update `fly.toml`
accordingly.

**Done state.**
- `fly apps list` shows both apps
- Payment method on file
- `lhr` is your default region

---

## 4. Neon — Postgres in London

1. Visit https://console.neon.tech → Sign up / log in
2. **Create project**:
   - Name: `legalise-prod`
   - Region: **AWS Europe (London) `eu-west-2`** (Neon's London PoP)
   - Postgres version: latest stable (16+)
3. Inside the project → **Branches** → ensure you're on the default
   `production` branch (rename `main` if Neon defaults that)
4. **Connection string**: dashboard shows `postgres://...` — copy it.
   The repo expects `postgresql+psycopg://...` (the SQLAlchemy driver
   form), so rewrite the prefix before storing.
5. **Enable pgvector**:
   - Neon dashboard → SQL Editor → run `CREATE EXTENSION IF NOT EXISTS vector;`
   - Verify: `SELECT extversion FROM pg_extension WHERE extname='vector';`
6. Stash the connection string in 1Password under "Legalise Neon prod".

**Done state.**
- `psql "$NEON_CONN" -c "SELECT version();"` succeeds
- `pgvector` is installed
- Connection string in 1Password in the `postgresql+psycopg://...` form

---

## 5. Secrets — Anthropic, Resend, master key, session secret

These all live as **Fly secrets** in production. They never go into
the repo, never into the local `.env`, never into a screenshot.

### 5a. Anthropic API key

You already have one (per memory). Confirm it's reachable:

```bash
echo "${ANTHROPIC_API_KEY:?missing}" | head -c 12 ; echo
```

Should print the first 12 characters then a newline. If not, export
it from your password manager:

```bash
export ANTHROPIC_API_KEY="$(op read 'op://Personal/Anthropic API key/credential')"
```

(or however your op vault is shaped). If you don't have one yet:
https://console.anthropic.com/settings/keys → Create key.

### 5b. Resend API key

For verification + reset emails. Production refuses to boot without it.

1. Sign up at https://resend.com → free tier
2. Add and verify a sending domain (e.g. `mail.legalise.dev`) — DNS
   records for SPF + DKIM go into Cloudflare DNS, takes ~10 min
3. Create API key → "Send only" scope → name "legalise-prod"
4. Stash in 1Password

### 5c. Session secret

```bash
# Generate once, never rotate without invalidating live sessions
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Stash. Used by fastapi-users to sign verify + reset tokens.

### 5d. Master encryption key for per-user provider keys

```bash
# 32-byte hex = 64 hex chars
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Stash. Lose this and every user's stored Anthropic/OpenAI key becomes
unrecoverable (user data is fine; they re-paste keys via Settings).
See `docs/AUTH.md` §4 for the full story.

### 5e. Set Fly secrets (after apps exist, before deploy)

```bash
fly secrets set \
  ANTHROPIC_API_KEY="..." \
  RESEND_API_KEY="..." \
  SESSION_SECRET="..." \
  SESSION_COOKIE_SECURE=true \
  LEGALISE_KEY_ENCRYPTION_SECRET="..." \
  POSTGRES_DSN="postgresql+psycopg://..." \
  EMAIL_FROM="legalise@mail.legalise.dev" \
  EMAIL_VERIFY_URL_BASE="https://legalise.dev/#/auth/verify" \
  PASSWORD_RESET_URL_BASE="https://legalise.dev/#/auth/reset" \
  S3_ACCESS_KEY="..." \
  S3_SECRET_KEY="..." \
  S3_BUCKET="legalise-prod-matters" \
  S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
  ENVIRONMENT=production \
  --app legalise

# Gotenberg sidecar — no secrets needed; reachable on internal network only
```

**Done state.**
- `fly secrets list --app legalise` shows all 13 secrets above
- Plaintext values exist only in 1Password
- Local shell history sanitised (`history -c` if you pasted in clear)

### 5f. Phase D W3 secrets — public module submission flow

The public submission endpoint (`POST /api/submissions`) opens a draft PR
against `b1rdmania/claude-for-uk-legal` and is bot-gated by Cloudflare
Turnstile. These secrets are required only if `submission_enabled=true` —
the feature ships behind a config gate. If the gate is off at Day 15,
provision them anyway so the flag flip is one command, not a re-deploy.

| Env var | Source | Notes |
|---|---|---|
| `GITHUB_SUBMISSION_TOKEN` | GitHub → Settings → Developer settings → Fine-grained PAT | **`b1rdmania`-scoped only. Not `ziggythebot`.** Repo access: `b1rdmania/claude-for-uk-legal` only. Permissions: `contents:write` + `pull_requests:write`. Expiry: 90 days; set a calendar reminder. |
| `TURNSTILE_SITE_KEY` | Cloudflare dashboard → Turnstile → widgets → site key | Public — also injected into the frontend build as `VITE_TURNSTILE_SITE_KEY`. |
| `TURNSTILE_SECRET_KEY` | Cloudflare dashboard → Turnstile → widgets → secret | Backend-only; never exposed to the browser. |

```bash
fly secrets set \
  GITHUB_SUBMISSION_TOKEN="github_pat_..." \
  TURNSTILE_SITE_KEY="0x4AAA..." \
  TURNSTILE_SECRET_KEY="0x4AAA..." \
  --app legalise
```

The Cloudflare Pages build also needs `VITE_TURNSTILE_SITE_KEY` set on the
Pages project (Settings → Environment variables). Same value as the
backend's `TURNSTILE_SITE_KEY`.

### 5g. Phase C anonymisation — spaCy NER model

Not an env var. The Presidio pipeline needs the `en_core_web_sm` spaCy
model installed in the image. `backend/Dockerfile` already runs
`python -m spacy download en_core_web_sm` after `pip install`; verify
the line is still present before image build:

```bash
grep -n "spacy download" backend/Dockerfile
# expect: a single line referencing en_core_web_sm
```

Without it, the first `POST /api/documents/{id}/anonymise` returns 503
with install guidance.

### 5h. Dev-only — server-key fallback

`LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true` lets the model gateway fall
back to the server-level `ANTHROPIC_API_KEY` when a user hasn't added
their own key. Honoured only when `ENVIRONMENT` is `development` /
`dev` / `local`; production reads this as false regardless of value,
enforced in `backend/app/core/model_gateway.py`. Do not set this on the
Fly app.

---

## 6. Local sanity pass (no deploy yet)

Before kicking off Day 15, verify the deploy preflight in
`infra/deploy/cloudflare.md` is green:

```bash
cd /Users/andy/Cursor\ Projects\ 2026/legalise

# 1. CLIs
fly version && fly auth whoami
wrangler --version && wrangler whoami

# 2. Anthropic key reachable
echo "${ANTHROPIC_API_KEY:?missing}" | head -c 12 ; echo

# 3. legalise.dev present in Cloudflare account
wrangler domains list 2>/dev/null | grep -F legalise.dev

# 4. Frontend lockfile committed
git ls-files frontend/package-lock.json | grep -q . && echo OK

# 5. Backend Docker builds locally (sanity, not required for Fly)
docker build -f backend/Dockerfile . -t legalise-backend:test
```

All five should succeed. If any fail, fix before opening the deploy
runbook.

---

## 7. What's NOT in pre-flight

- The actual deploy commands — those live in `infra/deploy/cloudflare.md`.
- Gotenberg deployment — same file, §5b.
- DNS records for `legalise.dev` apex / `api.legalise.dev` — handled
  by Cloudflare Pages + Fly automatic during deploy.
- Backend smoke test — runs in `infra/deploy/cloudflare.md` §6 against
  the live URLs after deploy.
- HN / X / LinkedIn post drafts — `HANDOVER_LAUNCH.md`.

Once every checkbox here is green, open `infra/deploy/cloudflare.md`
and start at §"Setup steps" §1.
