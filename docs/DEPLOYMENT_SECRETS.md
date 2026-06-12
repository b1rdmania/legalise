# Deployment Secrets

This is the deployment checklist for the hosted evaluation environment.

Core doctrine:

> Legalise is open source. The hosted site is a limited evaluation environment.

Production posture:

- BYO user model keys only.
- Do not configure server-paid Anthropic/OpenAI keys in production.
- Hosted limits are abuse controls, not a paid plan.

---

## Fly Backend

Required:

- `ENVIRONMENT=production`
- `DEBUG=false`
- `POSTGRES_DSN`
- `REDIS_URL`
- `SESSION_SECRET`
- `SESSION_COOKIE_SECURE=true`
- `LEGALISE_KEY_ENCRYPTION_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_VERIFY_URL_BASE=https://legalise.dev/#/auth/verify`
- `PASSWORD_RESET_URL_BASE=https://legalise.dev/#/auth/reset`
- `CORS_ORIGINS=["https://legalise.dev"]`

Do not set in production:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true`

If a model key is needed, the user adds it in Settings.

---

## R2 / S3-Compatible Storage

Required:

- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_REGION`

Checklist:

- bucket exists.
- API can put/get/delete.
- export bundle writes to bucket.
- generated `.docx` download reads from bucket.
- matter delete removes matter prefix.

---

## Neon Postgres

Required:

- London/UK-region project where available.
- connection string using the SQLAlchemy-compatible `postgresql+psycopg://` prefix.
- migrations run through release command or explicit deploy step.

Checklist:

- fresh migrations apply.
- `audit_entries` WORM trigger exists.
- app boot fails if DB revision is behind in production.
- no app-boot schema mutation in production.

---

## Redis / arq

Required:

- `REDIS_URL`
- worker process deployed and running.

Checklist:

- Redis receives job ids only.
- no matter content, prompt body, response body, or document body in Redis.
- worker can process one export job.
- enqueue failure cannot leave permanent queued jobs.

---

## Resend

Required:

- `RESEND_API_KEY`
- verified sender/domain for `EMAIL_FROM`.

Checklist:

- signup verification email sends.
- password reset email sends.
- email logs do not include raw token/body in production.

---

## GitHub Skill Import

The public module-submission flow (Turnstile widget + GitHub draft PRs)
was removed; skills arrive only by import (Lawve or a GitHub repo URL at
a pinned SHA) through the trust ceremony. No Turnstile keys exist.

Optional:

- `GITHUB_READ_TOKEN` — read-only PAT (no scopes needed for public
  repos) that raises the GitHub API rate limit for the skill importers.
  The legacy `GITHUB_SUBMISSION_TOKEN` env name still works as an alias.

Checklist:

- `LEGALISE_LIMIT_MODULE_SUBMISSIONS_PER_DAY` stays at its default of 0
  (submissions disabled; the usage endpoint reports the value).

---

## Cloudflare Pages Frontend

Required:

- `VITE_API_BASE_URL=https://<api-host>/api`

Checklist:

- build uses production API base.
- legalise.dev loads current bundle.
- CORS allows legalise.dev.
- auth cookie flow works cross-origin.
- no stale preview deployment is promoted by mistake.

---

## Hosted Evaluation Limits

Recommended launch defaults:

- `LEGALISE_LIMIT_MATTERS_PER_USER=5`
- `LEGALISE_LIMIT_DOCUMENTS_PER_MATTER=50`
- `LEGALISE_LIMIT_TOTAL_STORAGE_BYTES_PER_USER=524288000`
- `LEGALISE_LIMIT_ASSISTANT_MESSAGES_PER_DAY=100`
- `LEGALISE_LIMIT_WORKFLOW_RUNS_PER_DAY=50`
- `LEGALISE_LIMIT_ACTIVE_JOBS=3`
- `LEGALISE_LIMIT_GENERATED_ARTEFACTS_PER_DAY=50`
- `LEGALISE_LIMIT_MODULE_SUBMISSIONS_PER_DAY=0`

These limits should be documented as hosted-environment limits only. Self-hosting removes hosted limits.

