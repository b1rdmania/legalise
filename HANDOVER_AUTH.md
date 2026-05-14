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
| **fastapi-users (PostgreSQL backend)** | Native Python, sits next to existing models, no new service to run, supports JWT + cookie sessions, password reset / email verify out of the box, Apache 2.0 | DIY-feeling — we own the patches; some quirks around customisation |
| **Supabase Auth** | Best-in-class email magic links UX, social OAuth out of the box, generous free tier | Couples self-host to a vendor (4+ containers if self-hosting); two stores of truth (Supabase users + our Postgres data joined by user_id); the AGPL-adjacent operator-burden problem |
| **Clerk** | Excellent developer DX, drop-in components | Hosted-only — no self-host story at all; "your auth is locked to Clerk" is hostile to OSS adopters |
| **Authlib / DIY JWT + bcrypt** | Maximum control | We'd reinvent email confirm, password reset, lockout, rate limiting. Bad ROI. |

**Recommendation: fastapi-users.** Self-host stays clean (one Postgres,
no extra services), Apache 2.0 stays meaningful (no vendor dependency
in the deploy story), and the maintenance surface is small. We pay a
small DX cost vs Clerk; we keep the differentiation vs Mike.

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
| **Auto-copy Khan demo matter into new user's workspace** | Every signup immediately has something to click — Pre-Motion runs against their own key on their own copy. Best UX. |
| **Shared read-only demo matter (Khan) + empty user workspace** | Cleaner separation. New user has zero matters; demo matter exists at a fixed URL. They can't modify Khan. |
| **Empty workspace + "create from template" wizard** | More flexible but adds friction — user hits empty state, has to make a choice. |

**Recommendation: auto-copy on signup.** Lowest friction. The seed
function is already idempotent and scoped per-user-id; minor change to
take `created_by_id` as a parameter.

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
- **Multi-provider support.** Anthropic, OpenAI, Gemini. (Mike adds Gemini; we should too — it's free for low volume and a good fallback when Anthropic rate-limits.)
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

### Mike weaknesses we should explicitly avoid
- IDOR vulnerabilities in document access (external contributor caught one in Mike). **Mitigation:** every matter / document / audit query MUST filter by `user_id` at the SQL layer. Add a `user_id` column on `Matter` and an explicit `WHERE matter.created_by_id = current_user.id` on every query touching it. Test the negative case.
- PII in logs (Mike has an open issue on this). **Mitigation:** never log user emails, API keys, prompt bodies, response bodies. Existing audit log only stores hashes; preserve that.
- Two-dev team shipping unreviewed code (security PR from outside contributor). **Mitigation:** since this is a one-person project, lean harder on the eval scripts — extend `evals/smoke_sample_matter.py` to assert per-user scoping (User A cannot read User B's matter).

---

## 5. Implementation plan — 5 working days

### Day A — Auth scaffolding (backend)

- Add `fastapi-users` with cookie session backend
- Replace existing stub `current_user` dependency with the real one
- New tables (Alembic migration): extend `users` (password_hash, email_verified, etc.), add `sessions`, `user_api_keys`
- Email confirmation flow + password reset flow (Resend integration)
- New endpoints: `POST /auth/signup`, `POST /auth/signin`, `POST /auth/signout`, `POST /auth/verify-email`, `POST /auth/reset-password`
- **Locked invariants stay locked:** every existing endpoint (`/matters/*`, `/pre-motion/*`, `/letters/*`, `/modules/*`) still wires `current_user` the same way it does today — auth swap is transparent to callers. Audit row contracts unchanged.

**Done state:** can sign up via curl, get a confirmation email, click the link, sign in, get a session cookie, hit `/api/matters` and have it return only my matters.

### Day B — Per-user API keys + gateway integration

- Encryption helpers in `app/core/encryption.py` (AES-GCM via `cryptography`)
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

**Done state:** clicking through the settings pages works end-to-end against the backend.

### Day D — Onboarding flow + marketing rewrite

- Signup flow that auto-copies the Khan demo matter into the new user's workspace (modify `seed_demo_matter` to take a `user_id` arg, call it from the post-confirm handler)
- Landing page rewrite: hero stays, add "SIGN UP →" and "SIGN IN →" CTAs replacing or supplementing the existing "OPEN DEMO MATTER →" button
- New auth pages: signup, signin, password-reset-request, password-reset-complete, email-verify-pending, email-verify-complete (six pages, all Oxide-token-styled)
- Email templates (HTML + plain text) for verification + reset

**Done state:** a fresh user lands on legalise.dev, signs up, confirms email, lands in a workspace with the Khan matter, can run Pre-Motion immediately (assuming they've added a key).

### Day E — Polish + evals + launch playbook update

- Extend `evals/smoke_sample_matter.py` with a negative test: User A signs up, creates a matter, User B signs up, hits User A's matter URL, expects 404 (not 403 — we don't want to leak "this matter exists")
- README + Landing copy update: surface the BYO-key pattern; one paragraph in "What v0.1 does not yet do" gets removed (auth was on that list; now isn't)
- HANDOVER_LAUNCH.md update: HN post bodies extend with "Sign up free, bring your own Anthropic/OpenAI/Gemini key; your matter data stays scoped to you in Postgres."
- ROADMAP.md: auth moves from v0.2 to v0.1; v0.2 Module Lifecycle workstream and Trust workstream stay where they are
- Documentation pass: add `docs/AUTH.md` describing the signup flow, key storage, encryption, and self-host considerations (master key generation)

**Done state:** the v0.1.5 (post-auth) launch artifacts are ready; the launch playbook is consistent with the new shape.

---

## 6. Schema changes

```
users (existing table, extended)
  + password_hash : varchar(255) not null
  + email_verified : boolean not null default false
  + email_verified_at : timestamptz nullable
  + default_model_id : varchar(64) nullable
  + default_privilege_posture : varchar(16) nullable default 'B_mixed'

sessions (new)
  id : uuid pk
  user_id : uuid fk users
  token_hash : varchar(64) unique (sha256 of cookie value)
  expires_at : timestamptz
  created_at : timestamptz
  ip_address : varchar(45) nullable -- audited; optional, IPv6-friendly
  user_agent : text nullable

user_api_keys (new)
  id : uuid pk
  user_id : uuid fk users
  provider : varchar(32) -- 'anthropic' | 'openai' | 'gemini'
  ciphertext : bytea
  nonce : bytea
  last_used_at : timestamptz nullable
  created_at : timestamptz
  UNIQUE(user_id, provider)

matters (existing, extended)
  + created_by_id is already nullable+ftk; tighten to NOT NULL once
    we have real users and the demo-seed migration backfills

email_verifications (new)
  id : uuid pk
  user_id : uuid fk users
  token_hash : varchar(64) unique
  expires_at : timestamptz
  consumed_at : timestamptz nullable

password_resets (new)
  -- same shape as email_verifications
```

One Alembic migration covers all of these. No breaking change to
existing audit / matter / document / event tables.

---

## 7. Locked invariants — do not touch during the auth build

These were all signed off in R5/R6/R7 reviewer rounds and must hold:

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

**The auth build adds scope; it does not modify scope.**

---

## 8. Launch implications

- **Launch slip: ~5 working days** from current state. If we start Mon, ready to deploy Fri-Mon, launch Tue following week.
- **Launch sentence unchanged:** "Legalise turns reviewable legal skills into audited matter workflows."
- **HN post body gains 3 lines** about BYO-key pattern + free-forever for OSS users.
- **Day 15 deploy plan slightly more complex:** one new Fly secret (`LEGALISE_KEY_ENCRYPTION_SECRET`), one new env var for Resend API key, no architectural change.
- **Pre-launch polish (Day 17) shifts:** Pre-Motion GIF is now recorded against a signed-in user's session, not Andy's direct demo path. Settings page screenshot becomes one of the 5 required.
- **Day 18 paired-launch story strengthens.** Two HN posts: "Show HN: claude-for-uk-legal — 15 reviewable legal skills for Claude Code" and "Show HN: Legalise — Apache 2.0 legal AI workspace, signup free, BYO key". The "signup free, BYO key" line in the second post is meaningfully better than what we had before.

---

## 9. Open decisions for reviewer agent

The five things the reviewer should focus on before code lands:

1. **fastapi-users vs Supabase Auth vs Clerk** (§3a). Does the
   "self-host stays clean" argument hold? Is there a stronger case for
   Supabase given Mike's adoption velocity?
2. **Cookie session vs JWT** (§3b). XSS posture argument vs scaling
   simplicity.
3. **Per-user key encryption master-key approach** (§3c). Is env-var
   master key acceptable for v0.1, or do we need KMS / Fly secrets API
   for the master key itself?
4. **Marketing/app split** (§3f). Same-surface gated vs subdomain
   split. The "same surface" recommendation is the smallest change;
   does the marketing case for two domains override it?
5. **Auto-copy demo matter on signup vs shared read-only Khan**
   (§3e). UX vs simplicity.

Plus the implicit one: **is launching with auth the right call** vs
deferring to v0.1.5? The Andy + plan-author take is yes. Reviewer
should pressure-test.

---

## 10. What the reviewer agent is asked to sign off

After reading this plan top-to-bottom, the reviewer should produce
yes/nos on:

1. Auth is in v0.1 scope (not v0.1.5 / not deferred)
2. fastapi-users + cookie session + Postgres is the right stack
3. Per-user encrypted API keys + AES-GCM + env-var master is acceptable for v0.1
4. Auto-copy Khan demo on signup is the right onboarding shape
5. Same-surface gated routing (no subdomain split) is acceptable for v0.1
6. The 5-day implementation plan is realistic (or which days are under-scoped)
7. The locked invariants list (§7) is complete — anything else worth marking off-limits during the auth build?
8. Mike-feature triage (§4) is correct — anything in the "lift" list that shouldn't be there, or in the "don't lift" list that should be?

When the reviewer signs off with concrete changes (if any), we move to
build.

---

## 11. What this plan is not

- Not a finished spec. Concrete API shapes, exact fastapi-users
  configuration, exact frontend route layout are TBD during the build.
- Not a commitment to ship in 5 days. Reviewer may flag scope expansion
  or under-scoping. Estimate revised post-review.
- Not a v0.2 plan. The Module Lifecycle workstream, team workspaces,
  matter sharing, paid tiers, signed manifests, lint gates — all
  remain v0.2+.

---

Pre-build sign-off pass next. Build kicks off after reviewer round.
