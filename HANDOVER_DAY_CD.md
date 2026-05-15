# Handover — Day C + Day D combined

Reviewer pass on the auth-build final stretch: Day C (frontend auth +
Settings) and Day D (backend signup auto-copy + landing CTAs + email
templates). Reviewer signed off `81bf3f9` cleanly on the design retoken;
this handover covers the two follow-up commits.

R5–R7 are signed off across the backend trust / pre-motion / module
work. R-auth-review is signed off on Day A / A.5 / B (the backend auth
plumbing). The design retoken is signed off at `81bf3f9`. Two new
commits ship on top.

---

## Where we are

Commits since the last signoff (`81bf3f9`):

- `f0e82d3` — **Day C**: `useAuth` + `AuthProvider`, six auth pages,
  Settings shell with three tabs, TopBar profile chip, protected-route
  redirect. `App.tsx` grew from 2241 → 3261 lines. JS bundle 252 kB →
  269 kB (74 → 79 kB gzipped).
- (this commit) — **Day D**: backend `seed_demo_matter_for_user` so
  signup → email-verify auto-copies Khan into the new user's
  workspace; landing rewrite to add explicit Sign up / Sign in CTAs
  for the unauthenticated state; email templates upgraded from
  three-`<p>`-tags to a properly-styled transactional layout. Backend
  diff is small and contained: three files (`seed.py`, `auth.py`,
  `email.py`).

---

## How to orient yourself in 20 minutes

1. **Read this handover end-to-end first** (~3 min) so the yes/nos
   below make sense.
2. **`backend/app/core/seed.py`** — note the new `seed_demo_matter_for_user(session, user)` signature and the thin `seed_demo_matter(session)` wrapper that preserves the dev-boot call site in `main.py`. Same idempotency contract.
3. **`backend/app/core/auth.py`** §`UserManager` — read `on_after_register` and `on_after_verify` plus the new `_post_verify` helper. The dev-autoverify branch and the prod verify hook both end in `_post_verify`, which calls `seed_demo_matter_for_user`. Failure is logged and swallowed so a seed bug doesn't break signup.
4. **`backend/app/core/email.py`** — two new helpers (`_render_html`, `_render_text`) and the two send functions rewritten to use them. Inline styles only (most email clients strip `<style>`). Table-based layout for legacy clients. No images.
5. **`frontend/src/App.tsx`** — the **Landing** function only (search for `function Landing`). CTAs now branch on `auth.user`. Unauth shows Sign up + Sign in + Installed skills + GitHub plus a paragraph about the BYO-key pattern. Authed shows the original Open demo matter / All matters / etc.
6. **Click through the dev server** (`cd frontend && npm run dev`). Suggested order:
   - `/` unauthenticated → Sign up + Sign in CTAs visible
   - `#/auth/signup` → fill form, submit. Dev env auto-verifies, so post-signup lands on `/auth/verify-pending` (because frontend routes there regardless). Click "Back to sign in" or sign in to land on `/matters`.
   - `/matters` → Khan should be in the list under your new account
   - Open Khan → all six tabs render
   - `#/settings/profile` → form pre-fills with your name, email shows verified
   - `#/settings/keys` → add an Anthropic key
   - Sign out via TopBar chip → land back on `/` unauthenticated

---

## Yes/no signoffs

### Yes/no 1 — Day C: useAuth + protected routes + Settings agree with the design and the backend contract

Spot-checks:

- `AuthProvider` is the outermost wrapper of `<AppInner>`; `useAuth` throws if called outside a provider. ✓ in `App.tsx` lines ~73–164.
- `getCurrentUser` is called once on mount; `signIn`, `signOut`, `signUp` all call `refresh()` afterwards (or clear state on signOut).
- `PROTECTED_ROUTE_NAMES` covers `list / new / detail / settings`. Landing / Modules / auth pages stay public. Compare to `lib/route.ts` `PUBLIC_ROUTE_NAMES`.
- Six auth pages each route via `auth.signIn / signUp / forgotPassword / resetPassword / verifyEmail / requestVerifyToken`. The chrome lifts P3 hero + P13 inputs + P12 ink-fill button + P14 error callout per DESIGN.md.
- Settings shell uses P2 sidebar (desktop) / horizontal tabs (mobile). Settings · Profile reads / writes via `updateProfile`. Settings · Keys lists / upserts / deletes via the three `*ApiKey*` calls. Settings · Preferences is a P5 callout (placeholder for v0.2 per HANDOVER_AUTH §41).
- TopBar `ProfileChip` opens on click, closes on outside-click + Esc. Drawer Sign out is a button calling `auth.signOut()` then `navigate("/")`.

Reach for any of these specifically:

- Race: refresh fires on mount, then again after sign-in. Any UI hooked to `auth.user` should re-render correctly. The Settings `useEffect` that bounces to signin gates on `!loading && !user` — should not redirect during the initial fetch.
- The `Verify` page on success calls `auth.refresh()` then renders an "Open workspace" CTA. Confirm the refresh doesn't trigger the protected-route redirect mid-flow (it shouldn't — we're on `/auth/verify`, which is not protected).

### Yes/no 2 — Day D: signup auto-copy works end-to-end against the backend

Trace through:

- `UserManager.on_after_register` (dev autoverify path) → sets `is_verified=True` → calls `_post_verify(user)`. `_post_verify` reads `self.user_db.session` (a real `AsyncSession`) and calls `seed_demo_matter_for_user(session, user)`. The seed commits within the same session; idempotent if the user already has Khan.
- `UserManager.on_after_verify` (prod path) → calls `_post_verify(user)` only. fastapi-users commits the `is_verified=True` change before invoking the hook.
- The dev-boot path in `main.lifespan` still calls `seed_demo_matter(session)` (no args). That now provisions the locked-out demo user and routes through `seed_demo_matter_for_user`. Behaviour for the dev demo workspace unchanged.
- Slug tenancy is Option A (per Day A.5): `khan-v-acme-trading-2026` is shared, scoped by `created_by_id`. Each user has their own row, their own filesystem materialisation, their own audit history.

Possible failure modes to think about:

- **Session reuse across commits.** `seed_demo_matter_for_user` calls `await session.commit()` at the end. On the verify path, fastapi-users may have already committed the verified state and may try to commit again on return. SQLAlchemy 2.x async lets you reuse a session post-commit, so this should be fine, but worth a glance at the actual session lifecycle inside fastapi-users.
- **Exception in `_post_verify`.** Caught and logged. The user proceeds to sign-in with `is_verified=True` but no Khan. They can create their own matter. Acceptable degradation; alternative was to bubble and block sign-in, which is worse.
- **Race: same user, two parallel registrations.** Idempotent — the `select(Matter).where(...)` check at the top of `seed_demo_matter_for_user` resolves both calls to the same row. Worth confirming no unique constraint forces a duplicate.

### Yes/no 3 — Day D: email templates render correctly in real clients

I can't trivially test email rendering in this session. The plan-against:

- The new `_render_html` function builds a table-based layout (Gmail / Outlook / Apple Mail / iOS Mail compatible). Inline styles only. No `<style>` block. No images.
- Tokens lifted from DESIGN.md at the level email clients support: `#FFFFFF` paper, `#181818` ink, `#9CA3AF` muted, `#E5E5E5` rule, `#F4F4F4` wash, `#4B5563` prose. JetBrains Mono on the CTA, system stack on body (because few email clients honour custom font links).
- Plain-text fallback (`_render_text`) is a separate function, also called from the two `send_*` functions.
- The dev environment never sends real email (per `core/email.py` §`_send`); we log `email.dev_log` with kind + recipient domain only. So previewing the HTML in Resend's dashboard or a `litmus`-style tool is the only real check, and that has to wait until the production env has `RESEND_API_KEY`.

If you can pipe the HTML to a render check tool, the two functions to call are `send_verification(to, link)` and `send_password_reset(to, link)`. Otherwise this yes/no is "the layout/styles look sane on read" only.

---

## Judgment calls — push back on any

1. **Auto-copy on register (dev) AND on verify (prod) routes through one `_post_verify` helper.** This is the cleanest way to keep the dev autoverify path and the prod verify path identical in their post-state — but it does mean `_post_verify` runs once in dev (from register) and would run once in prod (from verify). If for any reason a user verifies twice (re-requesting + re-clicking), `seed_demo_matter_for_user` is idempotent and returns the existing row. So duplicate calls are safe but produce duplicate audit log lines for `auth.user.demo_seeded`. Acceptable.

2. **`_post_verify` swallows exceptions.** Per comment in code: a seed failure should not block sign-in. Reviewer may prefer the opposite — bubble and fail the verify — on the grounds that a half-set-up account is worse than a clean failure. Open to flip.

3. **Landing CTA wording: "Sign up — free, BYO key".** More functional than marketing. Alternatives: "Open a workspace", "Get started", "Try Legalise". The current wording surfaces the trust posture upfront, which is the differentiating thing. Push back if it reads as too instrumental.

4. **Email templates use JetBrains Mono on the CTA only.** Inter on body via the system stack falls back to Helvetica / Arial in most clients (custom font URLs in email are unreliable). The mono CTA is a small visual hook; some clients won't honour it either and will fall back to monospace generic. Acceptable.

5. **No physical Khan filesystem materialisation test.** `materialise_matter` writes to disk under `matter_fs`. Each new user will create a `matters/{user-shard}/khan-v-acme-trading-2026/` directory on first verify. In containerised prod with ephemeral filesystem, that directory only persists if the matter_fs root is mounted. Should already be covered by infra (R/W mount documented in `infra/deploy/cloudflare.md`), but worth a re-read.

6. **`StubSurface` was removed.** Every route now has a real renderer. Unmapped routes (e.g. malformed hash) fall through to landing per `parseHash`'s default. Reviewer may want a 404 surface explicitly — flag.

7. **MatterDetail still calls auth-gated endpoints on mount.** Per R2 P1 close-out: unauth visitors clicking demo CTAs now route to signup first. After Day D, the post-signup-verify-Khan-seeded flow lands them on a working detail page. The route `#/matters/{slug}` is itself protected, so even if someone deep-links it unauth, they get bounced to signin.

---

## Smoke-test fragility — flagged for the reviewer

- `auth.refresh()` after `Verify` succeeds: confirm no flash of the "Verification failed" state during the awaited refresh.
- `ProfileChip` dropdown z-index against the fixed `<header>`: should be `z-50` parent, dropdown inherits via `absolute`. Verify on iOS Safari that the dropdown doesn't get clipped by the header.
- Mobile drawer with `auth.user` non-null in the **marketing** state ("`/`" while signed in): shows Modules / Docs / GitHub primary + Open demo matter / Sign out secondary. Visually fine but the "marketing" framing while signed in is a tiny editorial wart. Alternative: drawer renders the workspace-no-matter set when authed on `/`.
- The `Settings · Profile` `default_model` field is a free-text input (model id strings vary by provider). Reviewer may want a select instead — listed as a v0.2 polish item.

---

## What I'm not asking you to review

- The auth backend plumbing (cookie + DatabaseStrategy + access tokens) — covered in R-auth-review and signed off.
- The DESIGN.md retoken / P18 mobile nav / P10 bounded-value patch — signed off at `81bf3f9`.
- The pre-motion / chronology / letters / audit module logic — signed off in R5–R7.
- Pre-flight items (Ollama, Cloudflare DNS, Fly/Neon, ANTHROPIC_API_KEY). These are interactive on Andy's machine and not in this commit pair.

---

## What I'd do next after signoff

Day E (per HANDOVER_AUTH.md §303): extend `evals/smoke_sample_matter.py` with negative cross-user test; README + Landing copy pass to remove the "no auth" line from "What v0.1 doesn't do"; HANDOVER_LAUNCH update to mention BYO-key in the HN post; ROADMAP move auth from v0.2 to v0.1; `docs/AUTH.md` describing signup, key storage, encryption, self-host considerations.

Day E lands before Day 15 deploy. Pre-flight items (Ollama, Cloudflare DNS, Fly/Neon, ANTHROPIC_API_KEY) are interactive and not on the critical AI-build path — Andy will drive those.

Approval pattern same as prior rounds: three yes/nos above, push back on the seven judgment calls, propose any P1/P2 fixes inline.
