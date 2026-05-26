# Journey 02 — Login / signup

Standard auth flows after the first admin exists.

## Preconditions

- A superuser exists; the workspace is past first-run.

## Goal

A new or returning user reaches `/app` authenticated.

## Trigger

User navigates to `/auth/register` or `/auth/login`.

## Steps

### Signup

1. Navigate to `/auth/register`.
2. Fill email + password → submit.
3. `POST /auth/register` → 201 + verification email sent.
4. User clicks email link → `/auth/verify?token=...` → `POST /auth/verify` → 200.
5. Redirect to `/auth/login`.
6. Login flow follows.

### Login

1. Navigate to `/auth/login`.
2. Fill email + password → submit.
3. `POST /auth/login` (form-encoded `username` + `password`) → 200 + session cookie set.
4. Redirect to `/app`.

### Password reset

1. `/auth/forgot-password` → `POST /auth/forgot-password` → 202 (email sent regardless of whether the email exists, by design).
2. Email link → `/auth/reset-password?token=...` → form → `POST /auth/reset-password` → 200.
3. Redirect to `/auth/login`.

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| Signup 3 | Register | `auth.user.registered` (substrate) |
| Signup 3 | Demo seed | `auth.user.demo_seeded` (substrate) |
| Signup 3 | Auto-grant | `auth.user.capabilities_auto_granted` (substrate) |
| Verify 4 | Email verified | (substrate emits via fastapi-users; verify shape) |
| Login 3 | Login | (substrate emits via fastapi-users; verify shape) |
| Reset | Password reset | (substrate emits via fastapi-users; verify shape) |

Three of these are substrate-internal via fastapi-users. The audit-emission map (Step 3) verifies whether they actually land — likely `none` for verify/login/reset under the current substrate.

## Acceptance criteria

- [ ] New user can register, verify email, log in, reach `/app`.
- [ ] Wrong password produces a structured 401 banner; no leak of which emails exist.
- [ ] Unverified user attempting login sees a "verify email first" banner with resend CTA.
- [ ] Password reset works end-to-end without exposing whether the email is registered.

## Not covered

- SSO (Google / SAML / OIDC) — out, single-tenant for now.
- 2FA — out for Phase 14; may surface as a Phase 15+ finding.
- Account deletion via the UI — `DELETE /auth/users/me` exists but Phase 13 doesn't spec the UX yet.
