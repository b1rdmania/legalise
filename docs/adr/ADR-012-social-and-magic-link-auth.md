# ADR-012 — Social sign-in (Google/Microsoft/GitHub) and magic-link auth

**Status:** Accepted, enforced in code.

## Context

Email/password (fastapi-users, cookie session, DB-backed tokens —
`backend/app/core/auth.py`) was the only sign-in method. For a
professional/legal audience in 2026, password-only signup reads as
dated and is pure friction: it adds no security here, since BYOK (ADR-001)
already means Legalise never holds anything more sensitive than the
account itself.

A third-party hosted identity provider (Privy and similar) was
considered and rejected: it would mean every self-hosted fork depends
on a paid external service for basic login, which cuts against the
"open source, self-hostable, no invisible dependencies" positioning
this project is built on. The chosen approach turns on a feature
`fastapi-users` already ships (`fastapi-users[oauth]`) rather than
swapping the identity system.

## Decision

- **Google, Microsoft (Entra/Azure AD), and GitHub OAuth**, plus a
  **magic link** (passwordless email), sit alongside email/password —
  not instead of it. One set of buttons on both `/auth/login` and
  `/auth/join`; first use creates the account, return use logs in.
- **Account linking is by verified email, always** (`associate_by_email=True`
  on every OAuth router, `backend/app/core/oauth.py`). Google/Microsoft/GitHub
  only return an email after verifying it themselves, so "same email,
  different login method" is safe to treat as the same person. GitHub
  is the one caveat: a user's GitHub email can be private/unverified;
  when `get_id_email` returns no email, the callback redirects with
  `oauth_error=no_email` rather than guessing.
- **OAuth signups are verified by default** (`is_verified_by_default=True`),
  same reasoning — the provider already did the verification.
- **Magic link can create an account, not just log into an existing
  one.** Clicking the link is itself proof of email ownership, so there
  is no separate "verify, then set a password" round-trip. The token is
  a self-issued signed JWT (`backend/app/core/magic_link.py`, 15-minute
  lifetime — tighter than the 1-hour password-reset token, since this
  path both logs in *and* can create an account) — no DB row, same
  mechanism `fastapi-users` uses internally for its own verify/reset
  tokens.
- **Custom redirect-friendly OAuth routers, not `fastapi_users.get_oauth_router`.**
  The stock router's `/authorize` and `/callback` both return JSON — built
  for an SPA that calls them via fetch and handles navigation itself.
  This app's OAuth buttons are plain `<a href>` links for a real
  full-page browser redirect (no client-side OAuth SDK is installed or
  needed), so `backend/app/core/oauth.py` reimplements both endpoints
  using fastapi-users' own internal building blocks (state-token
  signing, the `oauth_callback()` manager method, the
  `AuthenticationBackend` login) — `/authorize` redirects straight to
  the provider, `/callback` redirects straight into the app
  (`oauth_redirect_url`, default `/matters`) with the session cookie
  copied onto the redirect response. Errors (denied consent, no
  verified email, tampered state, provider already linked elsewhere)
  redirect to `/auth/login?oauth_error=<reason>` instead of raising a
  raw JSON error — a browser mid-redirect should always land on a real
  page.
- **Cookie-DB session strategy is unchanged for every new login path.**
  OAuth and magic-link logins call the exact same `auth_backend.login()`
  → `AuditingDatabaseStrategy.write_token()` as password login, so
  `auth.user.logged_in` gets audited identically regardless of how the
  session started.
- **Each OAuth provider mounts only if configured**
  (`google_oauth_client_id`/`_secret` etc, all optional, unset by
  default — `backend/app/core/config.py`). An unconfigured provider's
  routes simply don't exist (404), and its button doesn't render
  (`GET /auth/oauth/providers`) — partial rollout (e.g. GitHub live,
  Google/Microsoft pending console setup) works cleanly, with no
  half-wired state.
- **Magic link has its own explicit off switch** (`magic_link_enabled`
  / `MAGIC_LINK_ENABLED`, default `False`). Every OAuth provider is
  already gated by needing real credentials, so shipping the code
  changes nothing in production until someone sets up a Google/
  Microsoft/GitHub console. Magic link needs none of that — it works
  the moment the router mounts — so without its own flag, merging this
  feature would make passwordless sign-in live on the next deploy with
  no credential step to hold it back. The router only mounts when the
  flag is true (`backend/app/main.py`), and the frontend reads the same
  `GET /auth/oauth/providers` response (extended with a `magic_link`
  key) to decide whether `MagicLinkForm` renders at all.
- **`oauth_callback_base_url` and `magic_link_url_base` are explicit
  settings, not derived from the incoming request.** This app sits
  behind Fly + Cloudflare with no proxy-header trust middleware
  configured, so `request.base_url` cannot be trusted to reflect the
  real public origin — same reasoning as `email_verify_url_base` /
  `password_reset_url_base` already being explicit settings.

## Consequences

- New table `oauth_accounts` (migration `0043`, one row per
  (user, provider) social identity, `ON DELETE CASCADE` from `users`).
- `User.oauth_accounts` relationship uses `lazy="selectin"`, deliberately
  **not** fastapi-users' own docs example of `lazy="joined"` — joined
  eager-load on a collection duplicates rows in any plain
  `session.scalars(select(User)).all()` query unless the caller adds
  `.unique()`. `selectin` is a separate batched query: no duplication,
  no ripple effect on the User-list code that predates OAuth
  (`app/api/admin_users.py`'s listing endpoint hit exactly this bug in
  testing before the fix).
- Magic-link account creation (`app/api/magic_link.py`) deliberately
  does **not** call `UserManager.create()` — that path's
  `on_after_register` hook unconditionally sends its own verification
  email in production, which would double-email someone who just
  proved ownership by clicking the magic link that got them here.
  Creation is done by hand instead: a random unusable password (same
  shape OAuth-created accounts get), the same demand-capture
  `email_domain`/`domain_class` derivation, created already-verified,
  audited, and run through the same `_post_verify` side effects (seed
  demo matter) every other signup path gets.

## What not to change, and why

- **Do not switch `associate_by_email` to `False`, or gate it behind an
  explicit "link this account" confirmation step.** The providers here
  already verify email ownership before returning it; adding friction
  buys no real security and contradicts "as easy as possible" (the
  actual ask this ADR exists to satisfy).
- **Do not route OAuth through `fastapi_users.get_oauth_router` "to
  simplify."** Its JSON-returning endpoints do not match this app's
  plain-link, full-page-redirect frontend — that mismatch is the whole
  reason the custom router exists.
- **Do not reuse `UserManager.create()` for magic-link signups.** See
  Consequences above — it double-emails.
- **Do not derive OAuth callback / magic-link URLs from the incoming
  request.** No proxy-header trust is configured; keep them explicit
  settings.
- **Do not flip `MAGIC_LINK_ENABLED` to `True` by default, and do not
  remove the flag "since OAuth is already gated anyway."** They're
  gated for different reasons — OAuth by a real credential dependency,
  magic link by nothing at all — so magic link is the one path that
  goes live the instant its flag flips. Turn it on deliberately, when
  the whole social-login surface is ready to launch together, not as a
  side effect of an unrelated change.
