# Authentication & key storage

Reference for the v0.1 auth surface — what's wired, what each env var
controls, what self-host operators need to own.

For the broader trust posture see [`TRUST.md`](./TRUST.md). This file is
the canonical v0.1 reference for auth, sessions, provider keys, and
signup seeding.

---

## 1. Surface summary

| Capability | Where | Notes |
|---|---|---|
| Signup, sign-in, sign-out | `#/auth/signup` / `signin` / drawer | fastapi-users register + cookie login |
| Email verification | `#/auth/verify` (token in URL) | Production uses Resend; dev autoverifies |
| Forgot / reset password | `#/auth/forgot` / `reset` | One-time token, expires shortly after issue |
| Profile & defaults | `#/settings/profile` | Name, password change, default model, default privilege posture |
| API keys (BYO) | `#/settings/keys` | Anthropic + OpenAI, AES-256-GCM at rest |
| Preferences | `#/settings/preferences` | v0.2 placeholder |
| Sign-out | TopBar profile chip / drawer | Real session revocation via `access_token` table |

---

## 2. Signup → first sign-in flow

1. User registers via `#/auth/signup`. `fastapi-users` creates the row;
   the password is hashed with the library's default Argon2/bcrypt scheme.
2. `UserManager.on_after_register` (in `backend/app/core/auth.py`)
   branches:
   - **Production** (`ENVIRONMENT` not in `{development, dev, local}`):
     calls `self.request_verify(user)` which sends a verification email
     via Resend. The user lands on `#/auth/verify-pending`. They click
     the link in the email; the verify endpoint flips
     `is_verified=True` and calls `on_after_verify`.
   - **Development**: skips the email loop, sets `is_verified=True`
     directly, logs `auth.dev_autoverify`, then calls the shared
     `_post_verify(user)` helper inline (because the dev path bypasses
     `on_after_verify`).
3. `_post_verify(user)` calls
   `seed_demo_matter_for_user(session, user)` (in `core/seed.py`). This
   copies the Khan v Acme demo matter, its two seeded documents, and
   its seven chronology events under `created_by_id = user.id`.
   Idempotent — re-running for the same user returns the existing row.
   Failures are caught and logged (`auth.user.demo_seed_failed`); a seed
   failure does not block sign-in.
4. User signs in at `#/auth/signin`. The cookie strategy
   (`CookieTransport` + `DatabaseStrategy`) sets an HttpOnly
   `legalise_session` cookie backed by a row in the `access_token` table.
   Sign-out revokes that row server-side.
5. First authed page is `#/matters`. Khan is already there.

The `#/auth/verify-pending` page shows a "resend the link" form that
calls `requestVerifyToken(email)` — useful if the first email is
filtered.

---

## 3. Slug tenancy (Option A)

Matter slugs are unique **per user**, not globally. The unique
constraint is `(slug, created_by_id)`. Two independent users both
hold a matter at `khan-v-acme-trading-2026` without collision.

Cross-user reads on a slug-shaped URL return **404, not 403**: the
backend resolves the slug under the requesting user's scope; a slug
that exists for someone else but not the requester is indistinguishable
from "slug doesn't exist".

The full negative-access matrix is asserted in
[`evals/smoke_cross_user.py`](../evals/smoke_cross_user.py) (11
endpoints: GET matter / audit / chronology / letters catalog /
documents; POST pre-motion run / run-stream / pdf, letters draft;
PATCH privilege; POST documents multipart upload).

---

## 4. Per-user provider keys

### Shape

`UserApiKey` row per `(user_id, provider)` with provider ∈
`{anthropic, openai}`. The raw key is never stored — only an
AES-256-GCM ciphertext, a 12-byte nonce, and the auth tag, all
serialised together. See `backend/app/core/encryption.py` and
`core/user_keys.py`.

### Master key

The encryption key for the keys-at-rest is supplied via env var
`LEGALISE_KEY_ENCRYPTION_SECRET` (32-byte hex = 64 hex chars).

```bash
# Generate one
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Production startup refuses to boot if the env var is missing, wrongly
sized, or not valid hex — see `assert_master_key_present()`.

In dev, missing → process-lifetime random key; signups work for
throwaway testing, but anything encrypted under that key becomes
unrecoverable after a restart. Don't dev-seed real keys.

### Rotation

The codebase does not yet ship a master-key rotation routine. To
rotate manually: provision a new key, decrypt + re-encrypt every
`UserApiKey` row, swap the env var, redeploy. v0.2 will ship a
versioned-envelope format (`v1$<old-ciphertext>` → `v2$<new>`) so
rotation can be online.

### Self-host considerations

- The master key is the entire ground truth for decrypting stored
  keys. Lose it and every user's stored Anthropic/OpenAI key is
  unrecoverable — users will re-paste their keys via Settings → API
  keys. (User data — matters, audit, chronology — is unaffected.)
- Treat the env var like a database password. Inject via your
  secrets manager (Fly Secrets, Docker secret, Kubernetes secret,
  1Password injector). Don't bake it into the image.
- If you run multiple backend replicas, they all need the same
  master key. Trivial via env injection; impossible via per-node
  random.
- A user's stored key is decrypted only at model-call time inside
  the gateway. The plaintext never enters logs, audit rows, or
  prompt-response payloads.

---

## 5. Sessions

Cookie-backed `DatabaseStrategy`:

- Cookie name: configurable, default `legalise_session`.
- Attributes: `HttpOnly`, `Secure` (enforced in production via
  `SESSION_COOKIE_SECURE=true`), `SameSite=Lax`.
- Lifetime: configurable, default 7 days.
- Backing table: `access_token` (fastapi-users default schema).
  Sign-out deletes the row; deleting the row server-side immediately
  invalidates the cookie even if the user still holds it.

`SESSION_SECRET` must be set in production (refuses to boot
otherwise). Used for the verification-token + password-reset-token
signing inside `UserManager`. Generate with
`python3 -c "import secrets; print(secrets.token_urlsafe(64))"`.

---

## 6. Production env-var checklist

| Var | Purpose | Boot failure if missing |
|---|---|---|
| `SESSION_SECRET` | Sign verify + reset tokens | Yes |
| `SESSION_COOKIE_SECURE` | `true` in prod | Yes (refuses to boot at `false`) |
| `RESEND_API_KEY` | Send verification + reset emails | Yes (no silent log fallback in prod) |
| `LEGALISE_KEY_ENCRYPTION_SECRET` | Per-user key encryption | Yes |
| `EMAIL_FROM` | "From" address on outbound mail | Defaults work; override in prod |
| `EMAIL_VERIFY_URL_BASE` | Base URL prepended to verify token | Required so emails point at your domain |
| `PASSWORD_RESET_URL_BASE` | Same for password reset | Same |

`assert_auth_secrets_present()` and `assert_master_key_present()` are
called in `main.lifespan`; either failing aborts boot with a clear
error.

---

## 7. Out of scope for v0.1

- **Enterprise SSO** (Microsoft 365, Google, SAML, SCIM): v0.2 via WorkOS or Stytch.
- **MFA / TOTP**: v0.2 alongside SSO.
- **Org / team objects**: v0.2 — matters are per-user in v0.1.
- **Per-user audit-row encryption**: v0.2 (application-layer encryption of stored prompts/responses is a separate workstream).
- **Master-key rotation tooling**: v0.2 (versioned envelope).
- **Email-template branding**: v0.1 ships inline-styled transactional HTML; richer templating + dark-mode-aware bodies are v0.2 polish.

---

## 8. Related references

- `backend/app/core/auth.py` — `UserManager`, hooks, cookie + DB strategy
- `backend/app/core/encryption.py` — master-key asserts, AES-GCM encrypt/decrypt
- `backend/app/core/email.py` — Resend send + dev-log fallback + transactional templates
- `backend/app/core/seed.py` — `seed_demo_matter_for_user`
- `backend/app/api/auth.py` and `api/users.py` — fastapi-users route mounts
- `backend/app/api/settings.py` — `/api/settings/keys` endpoints
- `frontend/src/lib/api.ts` — `getCurrentUser` and the auth + key fetchers
- `frontend/src/App.tsx` — `AuthProvider`, six auth pages, Settings shell
- `evals/smoke_cross_user.py` — slug tenancy + cross-user 404 invariants
- `evals/smoke_signup_auto_seed.py` — Day D auto-Khan-copy + cross-user write isolation
