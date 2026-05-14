# Handover — v0.1 auth + multi-tenant scope plan

Strategic reframe coming out of the Mike-positioning thread: v0.1 ships
with real auth, per-user API keys, and the basic CRM-shaped surfaces
(signup, login, settings, profile) — not as a single-tenant demo on
Andy's Anthropic key. This is the launch shape. Day 18 launch sentence
unchanged ("Legalise turns reviewable legal skills into audited matter
workflows"); the user model behind it changes.

This is the plan for the reviewer agent to assess **before** anyone
writes code. Decisions marked **[DECIDE]** need explicit sign-off.

---

## 1. Why this changes now

- Mike (`willchen96/mike`) shipped self-serve OSS legal AI with
  per-user keys, got 2.9k stars + 858 forks in 16 days. Self-serve is
  what the market rewards.
- A demo where Andy pays Anthropic for every visitor's Pre-Motion run
  (9 model calls per run, real money) is a hostage to cost. We'd
  ration usage and the demo would feel thin.
- "Where's the auth?" is the first free hostile shot a HN reader takes.
  Adding signup closes it before it's fired.
- Mike's stack choice (Supabase) is heavy for self-hosters — multiple
  containers, vendor lock-in, AGPL-adjacent operator burden. Legalise
  can land the same self-serve UX *without* taking on Mike's deploy
  shape, and that's an additional moat.

The product framing doesn't change. Legalise is still the audited
execution layer for reviewable legal skills against matter context.
The difference is *who can run it without Andy* — which becomes
"anyone with an Anthropic key" instead of "no one".

---

## 2. Scope — what ships in v0.1 (post-pivot)

### Already shipped
- Matter spine + documents + audit log + privilege posture + CPR 31.22 gate
- Pre-Motion (4-stage adversarial pipeline, audited)
- Letters (matter-type-aware drafting over plugin bridge)
- Chronology (seeded fixture, regulatory gate)
- Skill catalogue Discovery (`#/modules`, 15 SKILL.md files)
- Git-as-marketplace install pattern (documented)

### New scope (this plan)
- Real auth: signup, signin, password reset, email confirm
- User model (real, not stub) — matters scoped per-user
- Per-user API keys for Anthropic / OpenAI / Gemini, encrypted at rest
- Per-user model preference (default model selection)
- Settings UI: profile, API keys, default model, default posture
- Onboarding: first signup gets a copy of the Khan demo matter, or
  matter creation flow
- Marketing/app split: `legalise.dev/` = unauthenticated marketing,
  `legalise.dev/app` or `app.legalise.dev` = signup-gated workspace
- Public landing page redesign: hero, feature scroll, video/GIF demo,
  pricing (free, BYO key), sign-up CTA — not the current `Landing`
  component which assumed auth-free direct access

### Explicitly NOT in v0.1 scope (pushed to v0.2+)
- Teams / organisations (single-user only in v0.1; team workspace in v0.2)
- Matter sharing between users
- Workflow sharing (Mike has this; we don't lift it yet)
- Tabular review of documents (Mike's distinctive feature; not
  our differentiation)
- Generic chat-with-documents (not our shape)
- Real per-module permission enforcement (v0.2 lifecycle workstream)
- Billing / payments / paid tier (v0.3+; v0.1 is free + BYO key forever)

---

## 3. Stack decisions — **[DECIDE]** before build

### 3a. Auth library / stack

| Option | Pros | Cons |
|---|---|---|
| **fastapi-users (PostgreSQL backend)** | Native Python, sits next to existing models, no new service to run, supports cookie transport + `DatabaseStrategy` (DB-backed tokens) cleanly, password reset / email verify out of the box, Apache 2.0 | Project is in maintenance mode (acceptable for v0.1 — the auth surface is stable, not a moving target; we accept "we own the patches" risk explicitly); some quirks around customisation |
| **Supabase Auth** | Best-in-class email magic links UX, social OAuth out of the box, generous free tier | Couples self-host to a vendor (4+ containers if self-hosting); two stores of truth (Supabase users + our Postgres data joined by user_id); the AGPL-adjacent operator-burden problem |
| **Clerk** | Excellent developer DX, drop-in components | Hosted-only — no self-host story at all; "your auth is locked to Clerk" is hostile to OSS adopters |
| **Authlib / DIY JWT + bcrypt** | Maximum control | We'd reinvent email confirm, password reset, lockout, rate limiting. Bad ROI. |

**Recommendation: fastapi-users with cookie transport + `DatabaseStrategy`.**
Self-host stays clean (one Postgres, no extra services), Apache 2.0
stays meaningful (no vendor dependency in the deploy story), and the
maintenance surface is small. We pay a small DX cost vs Clerk; we keep
the differentiation vs Mike. **Maintenance-mode note:** the
fastapi-users repo is in maintenance mode (low-activity but stable);
acceptable for v0.1 because auth is a stable surface, not a moving
target. We accept the "we own patches if needed" risk explicitly.

**Schema vocabulary:** use fastapi-users' `DatabaseStrategy` shape for
session tokens — `access_token` table with `(token, user_id, created_at)`
columns. Do **not** invent a parallel custom `sessions` table; pick one
shape and own it. §6 below uses the fastapi-users vocabulary.

### 3b. Session strategy

| Option | Pros | Cons |
|---|---|---|
| **JWT bearer in Authorization header** | Stateless, scales horizontally, easy to forward to backend | Logout is hard (token revocation needs a denylist), can't read in iframe / SSR setups |
| **Cookie session (httpOnly, secure, SameSite=Lax)** | Trivial logout (delete cookie), no token storage in JS (XSS-resistant), works with SSR | Stateful, sticky-session concerns at scale (irrelevant for single-Fly-machine v0.1) |
| **Hybrid (cookie + short-lived JWT)** | Best of both | Overkill for v0.1 |

**Recommendation: cookie session.** Httponly + Secure + SameSite=Lax,
session token stored in the cookie, validated by FastAPI middleware
against a `sessions` table in Postgres. Simpler XSS posture for a legal
product than localStorage JWT.

### 3c. Per-user API key storage

Encrypt at rest. Master key in env var (Fly secret).

| Approach | Detail |
|---|---|
| **Cipher** | AES-256-GCM via `cryptography` library |
| **Master key** | `LEGALISE_KEY_ENCRYPTION_SECRET` env var, 32-byte hex |
| **Per-key nonce** | Random 96-bit, stored alongside ciphertext |
| **Storage** | `user_api_keys` table: `id, user_id, provider, ciphertext, nonce, last_used_at, created_at` |
| **Plaintext lifetime** | In-memory only during request handling; never logged, never serialised to audit payload |

**Decision:** the master key never changes once set. Rotation is a
v0.2 ops task (re-encrypt all keys on rotation). For v0.1, document
that the master key must be set before first signup and stay constant.

**Production startup invariant:** if `LEGALISE_KEY_ENCRYPTION_SECRET`
is missing or empty in production (`ENVIRONMENT != development | dev
| local`), the backend **must refuse to boot** — `RuntimeError` at
lifespan startup, before any HTTP listener binds. No fallback to a
random key (which would silently un-decrypt every previously-stored
key after a restart), no fallback to a hard-coded value. The dev env
keeps the right to a default-random-on-boot key because dev signups
are throwaway.

### 3d. Email provider

| Option | Pros | Cons |
|---|---|---|
| **Resend** | Cheap (3k/mo free), simple API, good deliverability | Yet another vendor |
| **Postmark** | Best deliverability for transactional | $15/mo minimum |
| **AWS SES** | Cheapest at scale, dirt cheap at low volume | Awkward DKIM setup, slower deliverability ramp |
| **SMTP via Cloudflare Email Routing** | We're already on CF | Routing only sends FROM custom domains, not great for SaaS transactional |

**Recommendation: Resend.** Generous free tier covers v0.1 launch
volume; if we outgrow it the migration to SES is trivial (both have
similar SMTP-compatible APIs). Implementation: an `EmailProvider`
abstraction in `app/core/email.py` so the provider is swappable.

### 3e. Onboarding flow on signup

| Option | Behaviour |
|---|---|
| **Auto-copy Khan demo matter into new user's workspace** | Every signup immediately has something to click — Pre-Motion runs against their own key on their own copy. Best UX. Requires fixing slug tenancy first (see below). |
| **Shared read-only demo matter (Khan) + empty user workspace** | Cleaner separation. New user has zero matters; demo matter exists at a fixed URL. They can't modify Khan. Doesn't need slug tenancy work but degrades the "click and you're using your own data" UX. |
| **Empty workspace + "create from template" wizard** | More flexible but adds friction — user hits empty state, has to make a choice. |

**Recommendation: auto-copy on signup, after fixing slug tenancy.**

**P1 dependency — slug tenancy fix.** `Matter.slug` is currently
globally unique (`backend/app/models/matter.py:36`). Filesystem
materialisation paths are slug-shaped (`matters/{slug}/`). If every
signup gets `khan-v-acme-trading-2026`, the second signup either
collides (insertion error) or we suffix the slug and lose stable demo
URLs / collide on the filesystem either way.

Two ways to fix this:

| Fix | Detail |
|---|---|
| **A. Composite uniqueness `(created_by_id, slug)` + path namespacing** | Drop the global `UNIQUE(slug)` constraint, add `UNIQUE(created_by_id, slug)`. Change filesystem materialisation paths from `matters/{slug}/` to `matters/{user_id}/{slug}/` (or a 12-char user-shard prefix). Routes change shape from `/api/matters/{slug}` to `/api/matters/{slug}` *still* — the backend resolves by `(user_id, slug)` from the session, no URL change. **The right answer at scale.** |
| **B. Suffix on copy** | Auto-copied Khan slug becomes `khan-v-acme-trading-2026-{8-char user shard}`. Global slug uniqueness stays. Filesystem paths stay slug-shaped. Stable demo URL is lost for the auto-copied matters; the canonical demo (if we keep a read-only Khan for marketing) sits at the original slug owned by Andy. **The quick v0.1 fix that pushes the architectural call to v0.2.** |

**Recommendation: option A.** Right for multi-tenancy at scale and
the work is small (one migration, one resolver helper). The reviewer's
flag here is right — option B kicks the can to v0.2 and the can grows
when we add team workspaces.

If option A is too much for the 7-8 day window (see §5 revised
estimate), fall back to option B and add a v0.2 task to consolidate.
Reviewer to confirm.

**[DECIDE]** — option A or option B?

### 3f. Marketing vs app split

| Option | Detail |
|---|---|
| **Subdomain split** | `legalise.dev` = marketing (static, Pages), `app.legalise.dev` = workspace (Pages → Fly). Cleanest mental model. Needs DNS for two subdomains. |
| **Path prefix** | `legalise.dev/` = marketing, `legalise.dev/app/` = workspace. Same deploy. Routing complexity inside SPA. |
| **Same surface, gated** | Current Landing component stays at `/`, signup CTA is just a button. Authenticated users get the workspace at `/matters`. No marketing page beyond what we have. |

**Recommendation: same surface, gated.** v0.1 ships the smallest
surface that works. The existing `Landing` component becomes the
marketing page (with sign-up + sign-in buttons added prominently);
authenticated users skip Landing and land on `#/matters` directly via
a redirect check. v0.2 splits subdomains if we feel the need.

---

## 4. What to lift from Mike (and what not to)

### Lift (worth copying, on our terms)
- **Per-user API keys configured in Account > Models & API Keys.** Same surface name in our settings page.
- **Multi-provider key storage for the existing providers we already support** — Anthropic and OpenAI (and the Ollama-URL setting). The existing `model_gateway.py` already abstracts provider selection; we just need the user-key plumbing.
- **Model picker per call** (Account-level default + optional per-matter override).
- **"Provider key required" UI nudge** when the user tries to invoke a skill but hasn't added a key for the relevant provider.
- **Account / Settings hierarchy.** Mike has `Account > Models & API Keys`, `Account > Profile`. Same shape works.
- **Help link in-app** pointing at README + docs.

### Do not lift
- **Supabase.** See §3a.
- **AGPL.** We're Apache 2.0 forever.
- **Generic chat-with-documents.** Not our shape; would dilute the matter-first / audited-execution-layer positioning.
- **Tabular review of multiple documents.** Mike's distinctive feature but not what we're for.
- **Workflow sharing.** Real cross-user shared workflows is a real feature — pushed to v0.2 when we add teams.
- **Gemini as a provider.** Adding a third provider isn't "for free" — it's a provider implementation, model-id catalogue, gateway routing, settings UI, and tests. **Defer to v0.2.** The reviewer correctly flagged this as hidden scope in the original plan. If Gemini lands later it can ship as part of the v0.2 multi-provider expansion when we also add Bedrock / Vertex / etc.

### Mike weaknesses we should explicitly avoid
- IDOR vulnerabilities in document access (external contributor caught one in Mike). **Mitigation:** every matter / document / audit query MUST filter by `user_id` at the SQL layer. Add a `user_id` column on `Matter` and an explicit `WHERE matter.created_by_id = current_user.id` on every query touching it. Test the negative case.
- PII in logs (Mike has an open issue on this). **Mitigation:** never log user emails, API keys, prompt bodies, response bodies. Existing audit log only stores hashes; preserve that.
- Two-dev team shipping unreviewed code (security PR from outside contributor). **Mitigation:** since this is a one-person project, lean harder on the eval scripts — extend `evals/smoke_sample_matter.py` to assert per-user scoping (User A cannot read User B's matter).

---

## 5. Implementation plan — 7-8 working days (revised after R1)

**Revised estimate.** R1 reviewer correctly flagged 5 days as
optimistic given the access-control sweep, audit-middleware actor
work, and slug-tenancy migration that weren't fully scoped in the
original plan. Realistic estimate is **7-8 working days** if
email-verify + password-reset stay in scope. Alternative is to cut
those to a v0.1.5 follow-up and ship signup/signin + BYO keys in
~5 days. **[DECIDE]** — keep full auth in or cut to faster path?

### Day A — Auth scaffolding (backend)

- Add `fastapi-users` with **cookie transport + `DatabaseStrategy`**
- Replace existing stub `current_user` dependency with the real one
- New tables (Alembic migration): extend `users` (password_hash, email_verified, etc.), add fastapi-users-shaped `access_token` table, add `user_api_keys` (plus `email_verifications` + `password_resets` if those stay in scope)
- Email confirmation flow + password reset flow (Resend integration) — **cuttable to v0.1.5 if §5 [DECIDE] picks faster path**
- New endpoints: `POST /auth/signup`, `POST /auth/signin`, `POST /auth/signout`, `POST /auth/verify-email`, `POST /auth/reset-password`
- **Audit-middleware actor resolution.** `backend/app/core/audit.py` currently resolves `STUB_USER_EMAIL` for the `actor_id` on `http.*` rows. Must change to read the session cookie via the same fastapi-users dependency the route handlers use, so HTTP forensic rows resolve to the real authenticated user. For unauthenticated/failed-auth paths: write `actor_id = NULL` (not the stub user, not the default email). Otherwise semantic rows would carry the real user while `http.*` rows show Jasmine — that's a R5-level audit-invariant violation.

**Done state:** can sign up via curl, get a confirmation email (if in scope), click the link, sign in, get a session cookie, hit `/api/matters` and have it return only my matters. `actor_id` on every audit row matches the authenticated session, NULL for anonymous traffic.

### Day A.5 — Access-control sweep + 404-on-cross-user (NEW after R1)

The single most consequential R1 finding: the original plan said "auth
swap is transparent to callers". It is not. Every existing endpoint
that fetches by slug needs to be rewritten to scope by `(user_id,
slug)`, return 404 for cross-user (not 403 — avoid leaking matter
existence). Touched endpoints (rough list, build will surface more):

- `backend/app/api/matters.py` — list, detail, create, documents,
  privilege, invoke, audit
- `backend/app/modules/letters/router.py` — catalogue, draft
- `backend/app/modules/pre_motion/router.py` — run, run-stream, pdf
- `backend/app/modules/chronology/router.py` — read, gate

Plus the slug tenancy fix from §3e (option A or B per **[DECIDE]**).
Plus SSE endpoint auth — the streaming variant of Pre-Motion needs the
same session check as the non-streaming, written explicitly because
the preflight pattern is different.

Add negative test in `evals/smoke_sample_matter.py`: User A signs up,
creates a matter, User B signs up, hits User A's matter URL, expects
404. The eval must fail if the access check is missed.

**Done state:** comprehensive grep for `select(Matter).where(slug == ...)`
shows zero occurrences without an accompanying user-id filter. Negative
eval passes.

### Day B — Per-user API keys + gateway integration

- Encryption helpers in `app/core/encryption.py` (AES-GCM via `cryptography`)
- Startup-fail invariant on missing `LEGALISE_KEY_ENCRYPTION_SECRET` in production (per §3c)
- `UserApiKey` model + CRUD endpoints (`POST/GET/DELETE /api/settings/keys`)
- `ModelGateway.call()` extended to read the calling user's key (passed by FastAPI dependency); falls back to server-level env var only if `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true` (off in production, on in dev for stub-echo testing)
- New error path: model call refuses with a structured 422 if user has no key for the required provider — frontend renders this with a "Add an Anthropic key in settings →" prompt
- Update the audit log row payload to **never** include the key

**Done state:** Jasmine signs up, adds her Anthropic key, runs Pre-Motion, uses HER tokens — not the server's.

### Day C — Settings UI (frontend)

- New route `#/settings/profile`, `#/settings/keys`, `#/settings/preferences`
- Forms for: name, email, password change, API keys (one per provider, masked display, last-used-at), default model, default privilege posture
- Frontend API types + fetchers
- Existing `NavLink`s extended; TopBar gains a profile-menu dropdown (mirrors the `legalise / matters` crumb pattern)
- **Auth pages (frontend).** signup, signin, password-reset-request, password-reset-complete, email-verify-pending, email-verify-complete — six pages, all Oxide-token-styled. May need an extra half-day; tracked here for visibility.

**Done state:** clicking through the settings and auth pages works end-to-end against the backend.

### Day D — Onboarding flow + marketing rewrite

- Signup flow that auto-copies the Khan demo matter into the new user's workspace per the **[DECIDE]** in §3e — modify `seed_demo_matter` to take a `user_id` arg, call it from the post-confirm handler. If option B (suffix) wins, generate `{base-slug}-{user-shard}` here.
- Landing page rewrite: hero stays, add "SIGN UP →" and "SIGN IN →" CTAs replacing or supplementing the existing "OPEN DEMO MATTER →" button
- Email templates (HTML + plain text) for verification + reset

**Done state:** a fresh user lands on legalise.dev, signs up, confirms email, lands in a workspace with the Khan matter, can run Pre-Motion immediately (assuming they've added a key).

### Day E — Polish + evals + launch playbook update

- Extend `evals/smoke_sample_matter.py` with the negative cross-user test (described in Day A.5)
- README + Landing copy update: surface the BYO-key pattern; one paragraph in "What v0.1 does not yet do" gets removed (auth was on that list; now isn't)
- HANDOVER_LAUNCH.md update: HN post bodies extend with "Sign up free, bring your own Anthropic/OpenAI key; your matter data stays scoped to you in Postgres."
- ROADMAP.md: auth moves from v0.2 to v0.1; v0.2 Module Lifecycle workstream and Trust workstream stay where they are; Gemini provider explicitly listed as a v0.2 multi-provider task
- Documentation pass: add `docs/AUTH.md` describing the signup flow, key storage, encryption, and self-host considerations (master key generation)

### Days F-G — buffer

R1 reviewer flag: 5 days is optimistic. Days F-G are explicit buffer
for the parts that overrun in practice (typically: email deliverability
debugging, frontend auth-pages styling, the access-control sweep
catching more endpoints than the rough list above). If neither day is
needed, the launch slips less than 7-8 days; if both are consumed,
launch is on the upper end. Don't pretend buffer doesn't exist.

**Done state for the whole batch:** the v0.1.5 (post-auth) launch artifacts are ready; the launch playbook is consistent with the new shape; the deploy plan is updated with the new Fly secrets (`LEGALISE_KEY_ENCRYPTION_SECRET`, `RESEND_API_KEY`).

---

## 6. Schema changes

```
users (existing table, extended)
  + password_hash         : varchar(255) not null
  + is_active             : boolean not null default true
  + is_superuser          : boolean not null default false
  + is_verified           : boolean not null default false
  + default_model_id      : varchar(64) nullable
  + default_privilege_posture : varchar(16) nullable default 'B_mixed'
  -- (is_active/is_superuser/is_verified are the fastapi-users
  --  standard columns; we keep their names so the library's
  --  UserManager + DatabaseStrategy work out of the box)

access_token (new, fastapi-users DatabaseStrategy shape)
  token        : varchar(43) pk -- url-safe random, fits in cookie
  user_id      : uuid fk users
  created_at   : timestamptz not null default now()
  -- expiry enforced by lifetime config on the strategy, not a column

user_api_keys (new)
  id            : uuid pk
  user_id       : uuid fk users
  provider      : varchar(32) -- 'anthropic' | 'openai' (Gemini = v0.2)
  ciphertext    : bytea not null
  nonce         : bytea not null
  last_used_at  : timestamptz nullable
  created_at    : timestamptz not null default now()
  UNIQUE(user_id, provider)

matters (existing, possibly extended per §3e [DECIDE])
  -- created_by_id already exists as nullable FK; tightens to NOT NULL
  -- once we have real users and the demo-seed migration backfills.
  --
  -- Option A (§3e): DROP UNIQUE(slug), ADD UNIQUE(created_by_id, slug).
  -- Option B (§3e): keep UNIQUE(slug), no schema change; the suffix
  -- happens in the seed copy function.
```

Email verification + password reset use **fastapi-users' built-in
tokenisation** — the library issues JWT-shaped tokens for these flows,
not a DB-stored row. No `email_verifications` / `password_resets`
tables required; the original §6 draft proposed them but fastapi-users'
existing flow is simpler and matches the project's maintenance-mode
stability.

One Alembic migration covers everything. No breaking change to
existing audit / matter / document / event tables (modulo the
optional `matters` uniqueness change if option A wins).

---

## 7. Locked invariants — do not touch during the auth build

### Locked from prior reviewer rounds (R5/R6/R7)

These were all signed off and must hold:

- Audit-row contracts: 3 / 12 / 2 / 1 rows for Letters draft /
  Pre-Motion run / PDF export / C_paused-blocked attempts
- Matter-type routing in Letters (catalogue `resolve()`)
- Privilege posture enforcement at the gateway (`PrivilegePosture.C_PAUSED`)
- CPR 31.22 chronology gate (server-side redaction)
- Plugin bridge SKILL.md parsing + invocation shape
- `#/modules` discovery endpoint shape
- Pre-Motion 4-stage pipeline with parallel sub-agents
- Gotenberg sidecar deploy model (always-on, internal-only)
- Apache 2.0 license
- Oxide design tokens (`docs/DESIGN.md`)

### NEW invariants this build must hold (added after R1)

The R1 reviewer flagged five access-control invariants that the auth
build is responsible for *establishing* (not preserving — they don't
exist yet). The build is not done until these hold:

- **Slug tenancy.** `Matter.slug` resolves only within
  `(created_by_id, slug)` once auth lands. Per §3e [DECIDE] either
  via composite uniqueness (option A) or via slug-suffix on auto-copy
  (option B). Either way, two users with the same slug never collide.
- **Filesystem materialisation tenancy.** Paths under
  `matters/{slug}/` change shape so two users with the same slug
  cannot stomp each other on disk. Per option A: `matters/{user-shard}/{slug}/`.
  Per option B: not strictly needed because slugs are globally unique
  again, but worth a defensive prefix anyway.
- **Audit middleware actor resolution.** `backend/app/core/audit.py`
  resolves `actor_id` from the session cookie via the same
  fastapi-users dependency the route handlers use. For anonymous /
  failed-auth traffic, write `actor_id = NULL`. Never write the stub
  Jasmine UUID.
- **SSE auth + scoping.** `POST /pre-motion/run-stream` runs the
  session check + matter ownership check in the route handler
  preflight, before `StreamingResponse` opens — same pattern as the
  R6-P1 fix that established the C_paused preflight. A user MUST NOT
  be able to start an SSE on another user's matter.
- **404-on-cross-user.** Every matter / document / audit endpoint
  returns 404 (not 403, not 401) when the slug exists but is owned by
  a different user. Avoid leaking existence.
- **Cookie / CORS coherence (added R2).** Every authenticated
  cross-origin call from the frontend (fetch, SSE, PDF POST) must use
  `credentials: "include"`; backend CORS must keep
  `allow_credentials=True` with an explicit origin allowlist (no
  wildcards). On the split deploy, `CORS_ORIGINS` must contain
  exactly the marketing origin (`https://legalise.dev`) and nothing
  with `*`. Missing this combination breaks every authenticated
  request silently — preflight 200, actual request blocked. The
  R6-P1a CORS work already established the shape; the auth build
  must not regress it.
- **Public vs gated endpoint discipline (added R2).** Public-without-
  auth: `/health`, `/api/modules` (catalogue Discovery), `/api/modules/{plugin}/{skill}`
  (prompt body), and the marketing surface served at `/`. Everything
  else (matters, documents, audit, letters, pre-motion, chronology,
  settings, anything that exercises a model call or returns user data)
  requires a valid session. The auth scaffolding lands with an
  explicit allowlist for the public set; new endpoints default to
  gated.
- **Server-key fallback is dev-only (promoted from §5 to invariant after R2).**
  `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true` is honoured only when
  `ENVIRONMENT in {development, dev, local}`. In production the env
  var is read as `false` regardless of value — the gateway refuses
  to fall back to a server-level key even if the flag is set. Document
  this in `docs/AUTH.md` and assert it in a unit test so regressions
  blow up at CI time.

**The auth build adds scope and access-control discipline; it does not
modify the R5/R6/R7-signed-off scope.**

---

## 8. Launch implications

- **Launch slip: 7-8 working days** from current state (revised after R1). If we start Monday, ready to deploy late-following-week, launch Tuesday week-after. Faster path (cut email-verify + password-reset to v0.1.5) brings this back to ~5 days; **[DECIDE]** in §5.
- **Launch sentence unchanged:** "Legalise turns reviewable legal skills into audited matter workflows."
- **HN post body gains 3 lines** about BYO-key pattern + free-forever for OSS users.
- **Day 15 deploy plan slightly more complex:** one new Fly secret (`LEGALISE_KEY_ENCRYPTION_SECRET`), one new env var for Resend API key, no architectural change.
- **Pre-launch polish (Day 17) shifts:** Pre-Motion GIF is now recorded against a signed-in user's session, not Andy's direct demo path. Settings page screenshot becomes one of the 5 required.
- **Day 18 paired-launch story strengthens.** Two HN posts: "Show HN: claude-for-uk-legal — 15 reviewable legal skills for Claude Code" and "Show HN: Legalise — Apache 2.0 legal AI workspace, signup free, BYO key". The "signup free, BYO key" line in the second post is meaningfully better than what we had before.

---

## 9. Open decisions — closed at R2

All R2 yes/nos signed off. Outcomes (do not relitigate):

1. **Slug tenancy:** Option A — composite uniqueness `(created_by_id, slug)` + filesystem path namespacing. R2 verdict: "creates discipline exactly where auth/tenancy needs it."
2. **Email-verify + password-reset:** retained in v0.1 — 7-8 day estimate is the cost of doing auth credibly. Public signup without reset is "a cheap hostile shot" (R2).
3. **`LEGALISE_ALLOW_SERVER_KEY_FALLBACK`:** flag ships, but production refuses it as a hard invariant (now codified in §7).
4. **Demo matter strategy:** auto-copy on signup *after* Option A lands. Read-only Khan is cleaner technically but worse for the first-click experience.
5. **Estimate:** 7-8 days "tight but defensible". Days F-G are real buffer, not optional polish — builder must treat them as part of the estimate, not slack.

Build kicks off after this section becomes historical reference.

---

## 10. Review history

**R1 outcomes (closed):**
1. Auth in v0.1 scope — **yes** (with R1 amendments)
2. fastapi-users + cookie + Postgres — **yes**, with `DatabaseStrategy`
3. Per-user encrypted API keys + env master — **yes**, plus startup-fail invariant on missing master in production (§3c)
4. Same-surface gated routing — **yes**
5. Mike-feature triage — **mostly yes**; Gemini moved to "don't lift"

R1 added five new locked invariants (§7): slug tenancy, FS materialisation tenancy, audit middleware actor resolution, SSE auth + scoping, 404-on-cross-user.

**R2 outcomes (closed):**
1. Slug tenancy — **Option A** (composite uniqueness + path namespacing)
2. Email-verify + password-reset in v0.1 — **retain** (the cost of doing auth credibly)
3. Auto-copy Khan on signup — **yes**, after Option A lands
4. Locked invariants list — **almost complete**; R2 added two more (cookie/CORS coherence, public-vs-gated endpoint discipline) and promoted the server-key-fallback decision from open question to hard invariant. §7 now has eight new invariants total above the R5/R6/R7 inherited set.
5. 7-8 day estimate — **defensible** if Days F-G are treated as real buffer, not optional polish.

R2 also flagged one editing artifact (duplicate Day B-E block at lines ~322-358) which has been removed.

**Build status:** auth build cleared to start after this commit lands.

---

## 11. What this plan is not

- Not a finished spec. Concrete API shapes, exact fastapi-users
  configuration, exact frontend route layout are TBD during the build.
- Not a commitment to ship in 5 days — 7-8 days is the R2-signed-off
  estimate, with Days F-G as real buffer not optional polish.
- Not a v0.2 plan. The Module Lifecycle workstream, team workspaces,
  matter sharing, paid tiers, signed manifests, lint gates — all
  remain v0.2+.

---

Pre-build sign-off pass next. Build kicks off after reviewer round.
