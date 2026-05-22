# Handover — Hosted production deploy live (legalise.dev + api.legalise.dev)

**For:** the reviewer agent. Andy approved closing out the deploy session 2026-05-22 ~17:00 UTC.
**Repo head:** `c731895` (updated each commit) — the doc-currency hash.
**Runtime code head:** `c731895` — what's actually deployed on Fly right now (was `a375133` Dockerfile pin sync at deploy time). Pushed to `origin/master`.
**Prior context:** the substrate hardening track closed at `63415d6`; waitlist at `3c95b39`; supervised-autonomy doctrine at `9e62b9c`; landing pass + brand mark + repo tidy at `55a9b1d`, `9004f43`, `e354aa2`.
**Scope:** infrastructure stand-up from "frontend-only waitlist" to "hosted evaluation environment with real backend, DB, queue, storage, email." No new feature surfaces. Public copy unchanged except the index.html meta and the new in-page Manifesto section that Andy hand-edited mid-session.

---

## 1. TL;DR

The hosted-eval stack from `docs/handovers/PRE_FLIGHT.md` is up. legalise.dev serves the production bundle, api.legalise.dev serves the Fly backend over TLS, Neon holds the seeded Khan v Acme matter, Upstash is wired in, Resend's sending domain is configured (DNS auto-pushed via the Cloudflare integration), Gotenberg sidecar is reachable on `.internal:3000`, and `/api/modules/public` returns 15 working skills with 0 broken after the plugin pin was bumped.

What's *not* yet tested: anything that requires a real browser session (signup → email click → workspace, BYO key, SSE streams, per-user matter copy). Andy was tired and explicitly punted browser-smoke to tomorrow. Worth running a Playwright-driven pass before any first public click lands.

One real surprise during the deploy is documented in §6 (entrypoint.sh wasn't honoring Fly's release_command args). Two infra changes were committed and pushed; everything else is configuration.

---

## 2. Production surface

| Surface | Status | URL / value |
|---|---|---|
| Frontend (Cloudflare Pages) | 200 | https://legalise.dev |
| Backend (Fly lhr, 2 HA machines) | 200 | https://api.legalise.dev |
| Database (Neon eu-west-2, pgvector 0.8.0, alembic 0011) | 18 tables, Khan matter seeded | private |
| Queue (Upstash Redis eu-west-1, TLS) | reachable from Fly | private |
| Object storage (Cloudflare R2 weur) | bucket `legalise-prod-matters` | private |
| PDF sidecar (Gotenberg, Fly lhr internal) | 1 primary + 1 standby | `legalise-gotenberg.internal:3000` |
| Transactional email (Resend, mail.legalise.dev) | sending key issued; domain DNS auto-configured via Cloudflare integration | private |
| Inbound email (Cloudflare Email Routing, hello@legalise.dev → andy@cherrygalore.com) | active | — |

CORS: `Access-Control-Allow-Origin: https://legalise.dev`, credentials allowed, cookies/content-type in allow-headers, preflight returns 200 with proper headers.

Auth: protected routes return 401 unauthed; backend uses fastapi-users with `cookie_samesite="lax"` (same-zone with api.legalise.dev, so lax is correct).

Locked posture preserved: no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in production secrets. `LEGALISE_ALLOW_SERVER_KEY_FALLBACK` not set; structural guard at `app/core/model_gateway.py:392-394` enforces dev-only anyway.

## 3. Fly secrets (25 staged + applied)

`ENVIRONMENT` is in `[env]` of `backend/fly.toml` as `demo` (triggers idempotent Khan v Acme seed, no `--reload`). Everything else is a Fly secret:

```
CORS_ORIGINS  DEBUG  EMAIL_FROM  EMAIL_VERIFY_URL_BASE  GOTENBERG_URL
LEGALISE_KEY_ENCRYPTION_SECRET  LEGALISE_LIMIT_ACTIVE_JOBS
LEGALISE_LIMIT_ASSISTANT_MESSAGES_PER_DAY  LEGALISE_LIMIT_DOCUMENTS_PER_MATTER
LEGALISE_LIMIT_GENERATED_ARTEFACTS_PER_DAY  LEGALISE_LIMIT_MATTERS_PER_USER
LEGALISE_LIMIT_MODULE_SUBMISSIONS_PER_DAY  LEGALISE_LIMIT_TOTAL_STORAGE_BYTES_PER_USER
LEGALISE_LIMIT_WORKFLOW_RUNS_PER_DAY  PASSWORD_RESET_URL_BASE  POSTGRES_DSN
REDIS_URL  RESEND_API_KEY  S3_ACCESS_KEY  S3_BUCKET  S3_ENDPOINT  S3_REGION=auto
S3_SECRET_KEY  SESSION_COOKIE_SECURE=true  SESSION_SECRET
```

Hosted-eval limits set to the DEPLOYMENT_SECRETS.md defaults (5 matters / 50 docs / 500MB / 100 msgs / 50 runs / 3 active jobs / 0 submissions). Module submissions intentionally disabled (Turnstile not configured this session — `LEGALISE_LIMIT_MODULE_SUBMISSIONS_PER_DAY=0`, no `GITHUB_SUBMISSION_TOKEN`).

Secret values are mirrored to `~/.legalise-secrets/secrets.env` (chmod 600) for re-runs. Wipe after the next quiet pass.

## 4. DNS posture

`legalise.dev` zone on Cloudflare, nameservers `brad.ns.cloudflare.com` + `violet.ns.cloudflare.com` (Namecheap registrar swap done 2026-05-22). DNS records:

- `A legalise.dev → 192.0.2.x` and `CNAME www → ...` — managed by the Pages custom-domain binding
- `CNAME api → legalise-backend.fly.dev` (DNS-only, grey cloud — Fly handles TLS) — added via Cloudflare API mid-incident
- Resend SPF / DKIM / MX for `mail.legalise.dev` — auto-pushed by Resend's Cloudflare integration
- Cloudflare Email Routing MX + DKIM for the apex — Email Routing managed

Stale Namecheap records (Namecheap parking A, parking CNAME for www, eforward MX, Namecheap SPF TXT) were replaced when the custom-domain binding and Email Routing ran. No manual cleanup needed.

A scoped Cloudflare API token (`cfut_...`) was minted for DNS Edit on `legalise.dev` only — Andy chose to keep it (not revoke) for future ops. Lives in the secrets stash. Worth setting a 1-year calendar reminder to rotate.

## 5. Plugin manifests — Modules page fix

Was a real visible bug: `/api/modules/public` reported `0 working / 15 broken — module.json manifest missing`. The Modules page surfaced this as a long red list. Cause and fix in two commits:

- **a2e7d95**: bumped `PLUGINS_REPO_REF` in `backend/fly.toml` from `3fb0ea8` (no manifests) to `f8201f1` (manifests committed two days earlier in `claude-for-uk-legal` but never picked up).
- **a375133**: the *real* fix — `backend/Dockerfile:21` had `ARG PLUGINS_REPO_REF=3fb0ea86...` as a hardcoded default. Build-time clone uses the ARG, runtime URL construction in `modules.py:_source_url()` uses the env var. They had drifted. The first commit only updated the env; the image was still being built from the old SHA. Synced the Dockerfile ARG default to match.

Post-redeploy: `/api/modules/public` at `ref f8201f1da72f` reports **15 working / 0 broken** with correct per-skill capability declarations. Modules page is now visually clean.

**Constraint worth flagging**: the Dockerfile ARG and fly.toml env are independent and must be kept in sync manually on every plugin bump. A future tidy could either (a) read the env var at build via `--build-arg PLUGINS_REPO_REF=$ENV_VAR` in the deploy command, or (b) drop the Dockerfile ARG default entirely and require an explicit build-arg every deploy. Either prevents the drift class.

## 6. The release_command bug

`backend/entrypoint.sh` ignored positional args. Fly's `release_command = "alembic upgrade head"` was passed as `$@` to the entrypoint but the script unconditionally `exec`'d uvicorn — so the release machine ran a web server forever, never hit "destroyed" state, Fly timed out the deploy.

**Commit 4054a9d** adds an early `if [ "$#" -gt 0 ]; then exec "$@"; fi` branch. Now release_command runs alembic, machine exits, Fly promotes new app instances. Same fix lets `fly ssh console -C "<cmd>"` and other one-shot patterns work.

This is the kind of thing the reviewer might want to see — it shipped quietly because nothing exercised it before. Worth a one-liner test (CI? a `fly machine run` smoke?) before the next deploy if any of this is touched.

## 7. Cloudflare incident note

A Cloudflare entitlements-service incident from ~16:05 UTC on 2026-05-22 broke DNS writes and Pages config mutations for several hours mid-session. Worked around by waiting ~90 min and retrying. The incident's status page was stale by the time the API actually recovered (write succeeded before the page flipped to "Resolved"). Mention in case the timeline of commits looks gapped.

## 8. Code changes summary

Three infra-only commits during this session:

| Hash | Subject | Why |
|---|---|---|
| `4054a9d` | backend entrypoint: exec one-shot args (Fly release_command fix) | release_command needed args honored |
| `a2e7d95` | Bump claude-for-uk-legal pin: 3fb0ea8 → f8201f1 (plugin manifests) | runtime env half of the pin |
| `a375133` | Dockerfile: bump PLUGINS_REPO_REF default to match fly.toml | build-time half of the pin |

Plus the brand-mark + favicons + OG card commit from earlier in the day (`e354aa2`), the landing pass (`9004f43`), and the pre-launch repo tidy (`55a9b1d`). None of those touched backend code or migration state.

## 9. Open items on Andy's desk

In priority order:

1. **Browser smoke walk** — per `PRE_FLIGHT.md` §7, twelve surfaces. Not run this session. Could be driven by a Playwright agent. Highest-value follow-up before any first public click.
2. **arq worker process** — `backend/fly.toml` has no `[processes]` block. Backend can enqueue jobs (Redis is wired) but no process dequeues them. Export-to-docx and PDF generation will queue but never finish. DEPLOYMENT_SECRETS.md §Redis explicitly requires the worker. Two paths: add a process group to the existing app (`fly.toml [processes] app = "uvicorn ..."; worker = "arq app.worker.WorkerSettings"`), or split into a second Fly app. Not blocking signup or basic matter work.
3. **Resend domain status verification** — auto-config was "propagating" when Andy added the domain; I couldn't verify final status because the API key is `send-only` scope (correct posture). Worth a one-click check on the Resend dashboard before relying on signup emails landing. If it never verified, signups will fail to verify and nobody can complete registration.
4. **Module submission flow** — Turnstile not configured this session. If you decide to open public module PR submission, the `5f` block in `PRE_FLIGHT.md` lists the secrets needed.
5. **Calendar rotation** — Cloudflare DNS API token expires (default ~1y); R2 access key has no expiry but should be rotated annually; GitHub PAT for submissions (if/when set) expires 90 days. None scheduled.

## 10. What I want from you (the reviewer)

- **Sanity-check the entrypoint.sh patch** (`4054a9d`). The change is minimal and semantically obvious but it touches PID 1 — worth one careful read for whether the early `exec "$@"` could ever clobber a legitimate code path (e.g. a hypothetical case where someone passes args meaning "run uvicorn with these flags"). I don't think there is one, but you'd see it faster than I would.
- **Confirm the Dockerfile-vs-env split is acceptable** as a permanent posture, or whether the build-arg-from-env wrapper (§5) should land before next deploy. Either is defensible; I'm flagging because the drift it caused was an avoidable real bug.
- **Decide on arq worker shape** — same-app `[processes]` group vs separate Fly app. The locked architecture doesn't say. Worth a quick call before someone tries to export a matter and it hangs forever.
- **Browser smoke priority** — is this a "before any external user" gate, or are you fine deferring to first-public-link?

Nothing else is blocking. The substrate is up and the modules surface is clean. Andy is going to bed.
