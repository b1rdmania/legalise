# Journey 00 — Fresh fork / first run

The open-core release narrative made concrete. What an evaluator sees between `docker compose up` and the first useful screen.

## Preconditions

- Repo cloned. Docker compose stack up. Migrations at head.
- Zero users in the DB. Zero superusers. Zero modules installed (beyond the seeded substrate primitives).
- Browser open on the SPA's root (eventually `/app` or `/`).

## Goal

The evaluator becomes the first admin and lands on a usable workspace within ten minutes of `docker compose up`, with no DB or curl required after the bootstrap CLI invocation.

## Trigger

Evaluator navigates to the SPA root.

## Steps

### 1. App detects "no users yet" state

- **User sees:** an empty-state page explaining: "No accounts yet. The first user becomes the workspace administrator."
- **Actions:** primary CTA "Register first account"; secondary anchor "Read the open-core README".
- **System:** `GET /api/system/bootstrap-state` returns `{user_count: 0, has_superuser: false}` (no auth required). Phase 13b C; see `backend/app/api/system.py`.

### 2. Register first account

- **User does:** clicks "Register first account" → fills email + password.
- **System:** `POST /auth/register` → 201. Audit row: `auth.user.registered`.
- **Result:** user is created, default role `solicitor`, `is_superuser=false`.

### 3. App shows "now bootstrap as admin"

- **User sees:** instructions for the CLI invocation, with copy-paste-ready command pre-filled with their email:
  ```bash
  docker compose -f infra/docker-compose.yml exec backend \
    python -m app.tools.bootstrap_admin \
      --email <their-email> \
      --role workspace_admin
  ```
- **Actions:** "I've run the CLI — refresh status" button.
- **System:** on refresh, `GET /auth/users/me` returns the now-admin user (`is_superuser=true`).
- **Audit:** the bootstrap CLI emits `user.admin.bootstrapped` (Phase 12).

### 4. Land on app home

- **User sees:** the `/app` page with the seeded Khan v Acme matter and an empty modules list, plus a "Set up your provider API key" banner.
- **System:** `GET /api/matters` returns Khan (seeded at registration); `GET /api/settings/keys` returns `[]`.

### 5. Continue to BYO key journey

- **User does:** clicks the banner → diverts into Journey 03 (`03_byo_key_setup.md`).

## Audit emissions

| Step | Action | Audit row | Notes |
| --- | --- | --- | --- |
| 2 | Register first account | `auth.user.registered` | substrate already emits |
| 2 | Seed Khan v Acme | `auth.user.demo_seeded` | substrate already emits |
| 2 | Auto-grant legacy capabilities | `auth.user.capabilities_auto_granted` | substrate already emits |
| 3 | Bootstrap admin via CLI | `user.admin.bootstrapped` | Phase 12 |
| 4 | View first-run completion banner | none | UI-only |

## Acceptance criteria

- [ ] Evaluator with zero CLI/DB experience can read the app's instructions and reach an authenticated admin state.
- [ ] No JSON or curl invocation required (the bootstrap CLI is pre-formatted with the user's email).
- [ ] The "no users yet" detection is reliable — refresh after the first register correctly progresses the flow.
- [ ] Reconstruction view on Khan v Acme shows the entire first-run audit chain.

## Not covered (out of scope this phase)

- Hosted-eval mode that auto-promotes the first user without the CLI step (Phase 12 explicitly rejected this).
- Migration / DB connection error UI — generic 500 banner covers it.
- "Skip registration, log in as the demo solicitor" path — there's no demo solicitor, by design.
