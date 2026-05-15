# Handover — auth-build progress review

Reviewer pass on the auth build to date. `HANDOVER_AUTH.md` is the
R2-signed-off plan; this doc reports against it. Three of the 7-8
working days are landed (A, A.5, B); Day C is partially landed (the
API surface and routing foundation) with pages, the `useAuth` hook,
and the TopBar profile menu still pending.

The point of this review pass is to catch architectural drift **before**
the bulk of frontend code lands — Day C is ~1500 lines of UI from a
~1590-line `App.tsx` baseline, and a wrong call now is cheap to redo,
expensive to redo after.

---

## Where we are

Commits in order, on `master`:

- `c69e311` — Day A: auth scaffolding (fastapi-users cookie + DatabaseStrategy)
- `2ea85ac` — Day A.5: access-control sweep, slug tenancy Option A, FS sharding, cross-user negative eval
- `9187108` — Day B: per-user API keys + gateway integration
- `e1ac88c` — Day C (partial): api client + routes ready for auth/settings pages

Diff against `HANDOVER_AUTH.md` start (`cd2c502`): four commits,
~1100 insertions, ~70 deletions, 28 files touched.

---

## How to orient yourself in 15 minutes

Read in this order:

1. `HANDOVER_AUTH.md` — the plan you're reviewing against. §7
   (locked invariants) is the load-bearing section. §5 has the
   per-day done states this build is hitting.
2. `backend/app/core/auth.py` — fastapi-users wiring. UserManager hooks,
   cookie transport, DatabaseStrategy, `current_user` + `optional_current_user`.
3. `backend/app/core/encryption.py` — AES-256-GCM helpers with
   production startup invariant.
4. `backend/app/core/user_keys.py` — per-user key resolution and the
   `ProviderKeyMissing` exception the gateway raises.
5. `backend/app/core/model_gateway.py` lines 30-50, 145-180 — the
   per-user-key plumbing inside `call()`. This is the §5 invariant
   "server fallback is dev-only".
6. `backend/app/core/audit.py` — actor resolution from session cookie
   (NULL on anon, never the stub).
7. `backend/alembic/versions/0003_auth.py` — the one migration.
8. `backend/app/models/user.py` — User, AccessToken, UserApiKey.
9. `backend/app/models/matter.py` (lines 33-46) — slug uniqueness now
   composite per-owner.
10. `evals/smoke_cross_user.py` — the negative eval that proves the
    access-control sweep landed.
11. `frontend/src/lib/api.ts` lines 60-73, 388-end — `apiFetch` wrapper +
    auth/settings surface.
12. `frontend/src/lib/route.ts` — new auth/settings routes + public allowlist.

Optional dives:

- `backend/app/api/settings.py` — keys CRUD endpoint
- `backend/app/api/auth.py` — fastapi-users routers mounted at `/auth`
- `backend/app/providers/anthropic_provider.py` + `openai_provider.py` —
  api_key now per-call kwarg; server-level construct-time key is
  dev fallback only
- `backend/app/core/matter_fs.py` — FS path now `matters/{user-shard}/{slug}/`

---

## What landed against the §7 invariants

The R1/R2 invariants in `HANDOVER_AUTH.md` §7 are what we'd most like
the review to verify. Status:

**Slug tenancy.** §3e Option A landed. `Matter.__table_args__` adds
`uq_matters_owner_slug` on `(created_by_id, slug)`; migration `0003`
drops the old global unique index and replaces it. `unique_slug()` in
`api/matters.py` now scans per-user.

**Filesystem materialisation tenancy.** `matter_fs.matter_dir(slug,
user_id)` returns `matters/{user-shard-12}/{slug}/`. `_user_shard()`
takes a 12-char hex prefix of the UUID. `append_history` and
`record_document` got `user_id` arguments; all call sites updated.

**Audit middleware actor resolution.** `core/audit.py` reads the
session cookie via the standalone helper `_resolve_actor_id` (the
middleware sits outside FastAPI's dependency graph, so we can't use
`Depends`). Looks up `access_token`, returns `user_id` or `None`.
Stub-user lookup is gone — no path now writes the Jasmine UUID to
`actor_id` for anonymous traffic.

**SSE auth + scoping.** `pre_motion/router.py` preflight runs *before*
`StreamingResponse` opens: matter lookup is `(slug, user_id)`-scoped,
posture is read in the same preflight. The background task that owns
its own session also re-scopes by `user_id`. A user cannot start an
SSE on another user's matter.

**404-on-cross-user.** Every `Matter.slug == slug` query across the
codebase now also constrains `Matter.created_by_id == user.id`.
`grep -rn "Matter.slug ==" app/ | grep -v "created_by_id"` returns
zero hits. Cross-user returns 404 (not 403), per the existence-leak
mitigation in the plan.

**Cookie / CORS coherence (R2).** Backend `CORSMiddleware` already has
`allow_credentials=True`; `cors_origins` default keeps the explicit
allowlist (`localhost:3000`, `legalise.dev`). Frontend `apiFetch`
wrapper sets `credentials: "include"` uniformly. The wrapper is the
single integration point — there are no bare `fetch()` calls in
`api.ts` other than `apiFetch` itself and the public `/health` ping
in `App.tsx`.

**Public vs gated endpoint discipline (R2).** Public-without-auth:
`/health`, `/api/modules`, `/api/modules/{plugin}/{skill}`, the
marketing surface served at `/`. Every other route depends on
`current_user`, which 401s without a session. New `/api/settings/keys`
endpoints all depend on `current_user`.

**Server-key fallback is dev-only (R2 invariant).** Encoded in
`model_gateway.py` lines 165-175:
```python
fallback_allowed = (
    settings.environment in _DEV_ENVIRONMENTS
    and settings.allow_server_key_fallback
)
```
Production `ENVIRONMENT` value falls outside `{development, dev, local}`
so the gate is `False` regardless of the env-var flag. Worth a unit
test on this — see "What we'd like the reviewer to flag" below.

**Production startup invariant — encryption master key.**
`assert_master_key_present()` runs first in `main.lifespan`, before
any HTTP listener binds. If `LEGALISE_KEY_ENCRYPTION_SECRET` is
missing/empty and `ENVIRONMENT` not in dev set, raises `RuntimeError`
("refusing to boot"). Dev gets a process-lifetime random key with a
loud stderr warning.

---

## R5/R6/R7 invariants — preserved?

The plan says these must not be touched. Status:

- **Audit-row contracts (3/12/2/1):** The `model.call`, `plugin.invoked`,
  `module.pre_motion.run.start/.complete`, `http.*`, and
  `module.pre_motion.pdf.exported` rows are written from the same
  code paths as before. The actor-id field on `http.*` rows now
  resolves to a real user (or `NULL`) instead of the stub, but the
  row *shapes* are unchanged.
- **Matter-type routing in Letters:** untouched.
- **Privilege posture enforcement:** untouched. C_paused 409 still
  preflights before `StreamingResponse`.
- **CPR 31.22 chronology gate:** untouched.
- **Plugin bridge SKILL.md parsing + invocation shape:** untouched.
- **`#/modules` discovery endpoint shape:** untouched; remains public.
- **Pre-Motion 4-stage pipeline:** untouched.
- **Gotenberg sidecar deploy model:** untouched; auth doesn't change deploy.
- **Apache 2.0:** untouched.
- **Oxide design tokens:** untouched; Day C pages must honour them.

---

## What we'd most like the reviewer to flag

Three angles where we suspect we may have drifted, or could.

**1. The R2 server-key-fallback invariant.** Promoted from open
question to hard invariant. The plan says "assert it in a unit test so
regressions blow up at CI time." We haven't yet — the assertion is in
the code but there's no test under `backend/tests/` that proves the
production environment value forces `False` regardless of the env-var
flag. Is "code reads correctly" enough at v0.1, or do we owe the
invariant a test? Either way, name it.

**2. Audit-row actor consistency.** Day A re-wired the middleware to
resolve actor from session, but the `http.*` rows are written
**after** the route returns — the audit middleware runs after
`call_next`. For a request that 401s at the dependency layer (bad
cookie, expired token), the middleware writes `actor_id = NULL` with
status 401. Good. For an authenticated request that hits a successful
route, the cookie is present and the user resolves. Good. But the
edge case: a route that requires a verified user when verification is
off (we set `requires_verification=False`). Confirm the audit row's
actor_id stays consistent with the semantic-row actor. Specifically,
does Pre-Motion's `module.pre_motion.run.start` row's `actor_id`
always equal the corresponding `http.post` row's `actor_id`? We
believe so; flag if our reasoning misses a case.

**3. The slug-tenancy migration's backfill of `hashed_password`.**
Migration `0003` does `UPDATE users SET hashed_password = '!disabled'`
to satisfy `NOT NULL` on column add. The stub Jasmine user from the
existing dev DB has `is_active` un-set; the migration adds `is_active`
with `server_default true`, which means the legacy Jasmine row will
come out the migration as `is_active=true` and `hashed_password=
'!disabled'` — accidentally creating a "user account that exists but
cannot ever log in". The dev `seed.py` separately creates a
`demo@legalise.dev` user with `is_active=False`. Two failure modes
to assess:

   (a) Does the legacy Jasmine row from a pre-migration dev DB get
       picked up anywhere it shouldn't? (It would still own the seeded
       Khan matter via `created_by_id`.)
   (b) Production starts fresh with no users — the backfill never
       runs against a real user. So the concern is dev-only. Acceptable?

**4. Cross-user negative eval coverage.** `smoke_cross_user.py`
covers the matter detail / audit / chronology / letters catalogue /
pre-motion run / letters draft / anonymous 401 paths. Does it cover
**enough** of the surface area? Specifically: documents list, document
upload (multipart), privilege PATCH, pre-motion run-stream (SSE), and
pre-motion pdf are not yet exercised. Day E retrofits the existing
`smoke_sample_matter.py` for auth; the cross-user variant could be
extended at the same time, or stay narrow. Reviewer call.

**5. Gemini.** Plan §4 says "Defer to v0.2"; current code has zero
Gemini references. Confirm: nothing in this build snuck a third-provider
hook?

---

## What we'd like the reviewer NOT to do

- Don't reopen the R5/R6/R7 architectural calls (audit-row contracts,
  Gotenberg shape, parser extension). Those are still locked.
- Don't grade the Day C frontend that hasn't shipped yet — `api.ts`
  and `route.ts` are foundation; the pages, useAuth hook, redirect
  guard, and TopBar profile menu are still to come.
- Don't reopen the R2 yes/no outcomes (Option A slug tenancy,
  email-verify retained, server-key invariant, auto-copy on signup,
  7-8 day estimate). Those are signed off.
- Don't propose a different auth library. fastapi-users is locked.

---

## What we'd ask for

A short findings doc — same format as previous reviewer rounds
(P1/P2/P3 with file:line refs). Specifically: where the §7 invariants
don't hold, where the audit-row consistency claim breaks if it does,
where the slug-tenancy migration might leave broken state.

Length: whatever serves. R1 was ~700 words across 6 findings; R2 was
~400 across 2. Use whatever fits.

After this review, Day C (pages, useAuth, TopBar) lands, then Day D
(onboarding + landing rewrite + email templates), then Day E (eval
retrofit + docs). Days F-G are explicit buffer per R2.

---

Cold-read. Catch the drift.
