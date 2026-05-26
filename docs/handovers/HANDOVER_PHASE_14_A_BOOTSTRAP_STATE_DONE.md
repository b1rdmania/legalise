# HANDOVER — Phase 14 A Bootstrap-State + First-Run Shell DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `7258cf7` (v2). **A0 ratified at:** `d98a6a2`.
**Reviewer brief:** "keep it narrow. It should only implement bootstrap-state + `/app` first-run/home shell. No module catalog work, no grants, no reconstruction, no admin."

## What landed

Single new surface: `/app`. Three-state machine wired against `GET /api/system/bootstrap-state` (Phase 13b C, no auth required). Reviewer-narrow throughout.

### State machine

| Bootstrap response | Auth | Render |
| --- | --- | --- |
| `user_count === 0` | any | **FirstRunEmptyState** — "No accounts yet. Register the first account." CTA → `/auth/signup`. Body explicitly names bootstrap as a separate step; does NOT claim registration grants admin. |
| `user_count > 0, has_superuser === false` | any | **BootstrapRequiredState** — literal CLI command + binary path. `python -m app.tools.bootstrap_admin <email>` and `backend/app/tools/bootstrap_admin.py` are both present verbatim so an operator can copy-paste. No UI shortcut to self-promote. |
| `has_superuser === true` | unauth | **SigninRedirect** — `useNavigate` → `/auth/signin` (or `/waitlist` per `HOSTED_ACCESS_WAITLIST`). Renders a "Redirecting…" loader during the effect. Authed home content is never mounted for an unauthed visitor. |
| `has_superuser === true` | authed | **AuthedHome** — recent matters (max 3) + "Open Khan v Acme" CTA when Khan isn't already in the recent list. Links to `/matters` and `/matters/new`. |

### Files added

- `frontend/src/app/AppHome.tsx` — the three-state component.
- `frontend/src/app/AppHome.test.tsx` — 5 regression tests; coverage table below.

### Files changed

- `frontend/src/lib/api.ts` — added `BootstrapState` interface + `getBootstrapState()` fetcher.
- `frontend/src/router/index.tsx` — `/app` route now resolves to `AppHome`. **`/app` moved out from under `__authed`** so the first-run states are reachable without a session. AppHome owns its own auth gating for the State 3 branch.
- `frontend/src/lib/route.ts` — `appHome` added to `PUBLIC_ROUTE_NAMES` so `AppShell`'s session-expiry watcher doesn't redirect away from `/app`.
- `frontend/src/auth/SignIn.tsx`, `frontend/src/auth/SignUp.tsx`, `frontend/src/auth/Verify.tsx` — post-auth redirect target changed from `/matters` to `/app`. The plan names `/app` as the authenticated landing surface; routing everyone through it means the State 3 authed-home renders the recent-matter list + Khan CTA before the user dives into a specific matter.

### Test coverage

5 new tests in `AppHome.test.tsx`, all passing:

| # | State | Assertion |
| --- | --- | --- |
| 1 | user_count=0 | renders "Register first account" CTA pointing at `/auth/signup` |
| 2 | user_count=0 | **invariant from Reviewer v2 P1**: empty-state body does NOT match `/becomes the workspace administrator/i` or `/first user becomes admin/i`; positively names the bootstrap CLI |
| 3 | has_superuser=false | renders the verbatim CLI string + the binary path |
| 4 | has_superuser=true, unauth | does NOT render the authed home; renders one of the redirect stubs |
| 5 | has_superuser=true, authed | renders the home with recent matters + Khan CTA |

Total frontend test count: **34 passed**.

### Verification

- `npm run typecheck` — clean
- `npm test` — 34/34
- `npm run build` — clean (558 KB JS / 27 KB CSS; existing bundle warning is pre-A0)
- Backend untouched.

## Reviewer-narrow discipline — what this DOES NOT do

Lifted from the reviewer brief; named here so the next sub-step builder doesn't blur scope:

- **No module catalog** — Phase 14 B. The home does NOT call `/api/modules/v2`.
- **No grants UI** — Phase 14 C.
- **No invocation surface** — Phase 14 D.
- **No reconstruction view** — Phase 14 E. AuthedHome does NOT link to `/matters/{slug}/audit` from the home page; that's an in-matter affordance.
- **No admin pages** — Phase 14 F.
- **No settings polish** — Phase 14 G.
- **No new audit emissions.** AppHome makes one read (`bootstrap-state`, no audit by design — Phase 13b Decision #3) plus one read (`listMatters`, NONE-read per AUDIT_EMISSION_MAP). No new rows land.

## Acceptance vs ACCEPTANCE.md

- **§9 (first-run experience matches Journey 00).** Verified: empty-state copy + bootstrap-required CLI literal match the journey doc's text.
- **§11 (no hidden failures).** `getBootstrapState` error → structured `CenteredError` with the actual message + a "refresh + check backend" hint.
- **§14 (no diverged vocabulary).** `has_superuser`, `user_count` are the substrate field names verbatim in the component's internal switch.
- **§15 (no claim-without-ship).** Empty-state copy was the load-bearing P1 redline; tests assert the absence of admin-promotion language.

## Phase 14 cross-cutting (still NOT done — punt to later sub-steps)

- Vocabulary lint rule (Phase 14 F per plan §1 cross-cutting).
- Audit-emission integration tests against the backend — these are end-to-end and land per sub-step. Phase 14 A makes no mutations, so there's nothing to verify here.

## Next sub-step

**Phase 14 B — module catalog + detail + install ceremony.** That's the largest sub-step and the next blocker for the Andy's-four acceptance criteria #1 ("registered → run a module → view its reconstruction trail").
