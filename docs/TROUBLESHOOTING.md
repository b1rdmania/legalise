# Troubleshooting

Common setup errors a forker can hit locally, with the diagnosis and
fix for each. Sourced from the Phase 15 Playwright hardening cycle —
every entry here was a real silent CI-vs-local divergence that burned
through one or more runs before we caught it. Nothing speculative.

When in doubt, start with `legalise doctor`:

```bash
docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor
```

Doctor surfaces most of the conditions below as named `fail` rows
with remediation pointers.

---

## `POSTGRES_DSN` is set in my shell but the backend hits the default DB

**Symptom.** You exported `POSTGRES_DSN=…` in your shell, ran
`docker compose -f infra/docker-compose.yml up`, and the backend is still talking to
`legalise:legalise@db:5432/legalise`. `legalise doctor` says
`db.reachable` is `ok` against the *default* DSN.

**Diagnosis.** `infra/docker-compose.yml` uses
`${POSTGRES_DSN:-default}` interpolation, so a host shell override is
honoured. Phase 15 hit this in CI when the workflow exported
`POSTGRES_DSN` but the compose file had a hard-coded literal that
silently won. The fix landed in Phase 16 B (env_file `../.env` for
backend + worker, plus dropping the shadowing literals from the
`environment:` block).

**Fix.** Either:

- Export `POSTGRES_DSN` in the shell *before* `docker compose -f infra/docker-compose.yml up`, so
  the `${…}` interpolation reads it; or
- Put it in `.env` (which compose now passes through via `env_file`).

Verify after starting:

```bash
docker compose -f infra/docker-compose.yml exec backend env | grep POSTGRES_DSN
```

---

## `auth.user.registered` doesn't show up on the matter Audit tab

**Symptom.** You registered a user, opened the Khan v Acme Audit tab,
filtered for `auth.user.registered`, and got nothing.

**Diagnosis.** `auth.user.registered`, `auth.user.verified`,
`auth.user.capabilities_auto_granted`, and `auth.user.profile_updated`
all land at **workspace scope** (no `matter_id`). The matter Audit tab
only shows rows scoped to that matter. `auth.user.demo_seeded` *is*
matter-scoped because it carries `matter_id=khan.id`.

This caught the Phase 15 first-run spec — it was reading the wrong
endpoint for these rows.

**Fix.** Read workspace-scope rows through the admin reconstruction
view at <http://localhost:3000/admin/audit>. On the local quickstart
path, the first registered user is promoted automatically when
`LEGALISE_DEV_AUTO_ADMIN_FIRST_USER=true`. If you disabled that flag,
are not running in a local/dev environment, or are recovering an
existing user, use the `bootstrap_admin` CLI below.

The full scope split is in
[`docs/spec/AUDIT_COVERAGE_MATRIX.md`](./spec/AUDIT_COVERAGE_MATRIX.md).

---

## `bootstrap_admin` exits with a usage error

**Symptom.**

```
$ docker compose -f infra/docker-compose.yml exec backend python -m app.tools.bootstrap_admin you@example.com
usage: bootstrap_admin [-h] --email EMAIL [--role ROLE] [--force]
bootstrap_admin: error: the following arguments are required: --email
```

**Diagnosis.** The CLI takes `--email` as a keyword, not a positional
argument. Caught in Phase 15 hardening (CI run `26507523312`).

**Fix.**

```bash
docker compose -f infra/docker-compose.yml exec backend python -m app.tools.bootstrap_admin --email you@example.com
```

---

## `bootstrap_admin` exits with `user_not_found`

**Symptom.**

```
error: no user found for email 'you@example.com'; register first then bootstrap
```

Exit code `2`.

**Diagnosis.** The CLI promotes an **existing** user; it does not
create one. The normal local quickstart promotes the first registered
user automatically, so this CLI is now mainly for manual/recovery use
or environments where `LEGALISE_DEV_AUTO_ADMIN_FIRST_USER=false`.

**Fix.** Register via the signup form at <http://localhost:3000>
first, then re-run the CLI with the same email.

---

## Audit reconstruction is empty for a user I just promoted

**Symptom.** Your account was promoted, either by first-user local
auto-admin or by `bootstrap_admin`, but `/admin/audit` still 403s or
you keep seeing the non-superuser shell.

**Diagnosis.** `AuthProvider` caches the user object from
`/auth/users/me`. The promotion mutates the DB row, but the React
context can still hold the pre-promotion snapshot. Caught in Phase 15
first-run.

**Fix.** Reload the browser — `AuthProvider` re-fetches on mount and
the superuser context loads.

---

## `legalise doctor` says `khan.demo_present` failed after I signed up

**Symptom.**

```
[fail] khan.demo_present: users exist but Khan matter (khan-v-acme-trading-2026) missing
```

or

```
[fail] khan.demo_present: Khan matter present but no seed.matter.created audit row
```

**Diagnosis.** The Khan demo seeds on first signup via the `on_after_register` hook. Either signup never completed cleanly (the
`matter` row didn't land) or the seed audit row was truncated by a
later operation. The doctor check is stateful by design — pre-signup
it soft-notes, post-signup it demands the seed.

**Fix.**

- If the matter is missing: register a fresh user (signup re-runs the
  seed for each new user).
- If the matter exists but the audit row is missing: inspect backend
  logs for seeding failures (`docker compose -f infra/docker-compose.yml logs backend | grep
  seed`), then either re-register or delete the matter row and try
  again.

---

## `legalise doctor` notes that the S3 bucket isn't created yet

**Symptom.**

```
[note] s3.bucket_present: bucket 'legalise-docs' not created yet
        (storage layer creates it lazily on first use); rerun with
        --create-bucket to provision it now
```

**Diagnosis.** This is a soft note, not a failure. Fresh MinIO has no
buckets; the storage layer creates `legalise-docs` lazily the first
time anything writes to it. You can proceed.

**Fix (optional).** If you want the bucket pre-provisioned:

```bash
docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor --create-bucket
```

The `--create-bucket` flag is the one explicit mutation `doctor`
allows; without it, doctor never writes.

---

## I built the frontend with `vite preview` instead of `vite dev` and the API calls 404

**Symptom.** You ran `npm run build && npm run preview` for the
frontend, the page loads, but every `/api` and `/auth` request
returns 404 from the preview server.

**Diagnosis.** `vite dev` honours the `server.proxy` block in
`vite.config.ts`; `vite preview` does **not**. Phase 15 hit this in
CI and the fix was two-pronged: build with `VITE_API_BASE_URL`
pointing at the absolute backend URL, and add the preview origin to
the backend's `CORS_ORIGINS`.

**Fix.** For local development, use the compose frontend service
(`vite dev`) — it's the supported path. If you need to test the
production build:

```bash
VITE_API_BASE_URL=http://localhost:8000/api npm run build
npm run preview
```

…and add `http://localhost:4173` to `CORS_ORIGINS` in `.env`.

---

## I don't have any provider keys and want to know if the demo still works

**Symptom.**

```
[note] provider.mode: configured providers: stub-echo
```

You haven't set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

**Diagnosis.** This is the expected state for a fresh fork. The
keyless `stub-echo` model handles the Khan v Acme demo end-to-end —
Phase 15 first-run uses it. You don't need a provider key to evaluate
the substrate.

**Fix.** Nothing to fix. Set a real default model on your user via
**Settings → Default model** (or `PATCH /auth/users/me`) only when
you want to invoke a real provider with your own key.

---

## I see the waitlist page on `/auth/signin` instead of a signup form

**Symptom.** Visiting <http://localhost:3000/auth/signin> renders a
"Join the waitlist" page with no email/password fields.

**Diagnosis.** The frontend reads `VITE_HOSTED_ACCESS_MODE` at build
time. Waitlist mode is only honoured on the hosted domain
(`legalise.dev` by default); localhost and self-hosted forks render the
real auth forms. Phase 16 B also bakes `VITE_HOSTED_ACCESS_MODE=open`
into the **compose frontend service**, so a fresh
`docker compose -f infra/docker-compose.yml up` should render the
signup form.

If you see the waitlist page locally, something is overriding the
compose default — most likely a stale `frontend/.env` or a host env
export of `VITE_HOSTED_ACCESS_MODE=waitlist`.

**Fix.**

```bash
docker compose -f infra/docker-compose.yml config | grep VITE_HOSTED_ACCESS_MODE
```

Should print `open`. If it prints `waitlist`, localhost should still
render the auth form, but the override is stale and should be removed.
