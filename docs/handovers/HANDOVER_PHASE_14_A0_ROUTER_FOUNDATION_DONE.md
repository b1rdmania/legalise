# HANDOVER — Phase 14 A0 Router Foundation DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `7258cf7` (PHASE_14_PRODUCT_SURFACE_BUILD_PLAN.md v2)
**Reviewer brief:** "do A0 first and keep it boring. Route migration, protected layout, placeholder routes, hash redirects, and route smoke tests. No new feature work should sneak into A0."

## What landed

Boring as instructed. Zero new feature surfaces; every behavioural change traces to the router migration or the placeholder shape the Phase 14 sub-steps need.

### Router migration

- **New:** `frontend/src/router/index.tsx`. TanStack Router (code-based, one file because the whole tree fits in one read) with `createBrowserHistory`. All 16 existing routes registered, plus 8 Phase 14 placeholder routes.
- **New:** `frontend/src/app/AppShell.tsx`. Replaces the giant `route.name === "..."` switch that used to live in `App.tsx`. Renders `TopBar` + `Drawer` + `<Outlet />` and owns the runtime auth-state guard.
- **Rewritten:** `frontend/src/app/App.tsx`. Now just `<AuthProvider><RouterProvider router={router} /></AuthProvider>`. Lost ~100 lines.
- **Rewritten:** `frontend/src/lib/route.ts`. Hash-router gone. `useRoute()` now reconstructs the existing `Route` discriminated union from `useRouterState().location`; `navigate(to)` is a thin wrapper around `router.navigate({to})`. Compatibility shim — every pre-A0 consumer (`useRoute`, `navigate`, `parseHash`, `isPublicRoute`, `PUBLIC_ROUTE_NAMES`) keeps its signature.

### Protected layout (`__authed`)

The router has a single `__authed` parent route that wraps every authenticated page. Its `beforeLoad` reads `getAuthSnapshot()` (a module-level mirror written by `AuthProvider` on every state change — see `src/auth/AuthSnapshot.ts`) and throws `redirect({ to: ... })` when there's no user.

`beforeLoad` only fires at navigation time, so `AppShell` also keeps a runtime watcher: if auth flips authed → null while a protected route is mounted (session expiry), it calls `navigate("/auth/signin")` or `/waitlist` per `HOSTED_ACCESS_WAITLIST`. Same logic as pre-A0's `PROTECTED_ROUTE_NAMES` `useEffect`, just expressed as `!isPublicRoute(route)`.

### Placeholder routes for Phase 14 A–G

Eight new routes resolved with `PlaceholderPage`. The build plan mentioned a `VITE_FEATURE_FLAGS` short-circuit-to-404 mechanism — A0 deliberately does NOT implement that. Plain placeholders are sufficient for the deep-link contract and feature flags aren't load-bearing for any sub-step yet. If a sub-step needs a flag, it adds one then.

| Route | Phase | Sub-step |
| --- | --- | --- |
| `/app` | A | Bootstrap-state + first-run shell |
| `/modules/{moduleId}` | B | Module detail |
| `/modules/install/{ceremonyId}` | B | Trust ceremony |
| `/matters/{slug}/audit` | E | Reconstruction |
| `/matters/{slug}/artifacts` | D | Artifact list |
| `/matters/{slug}/artifacts/{artifactId}` | D | Artifact detail |
| `/admin/users` | F | Admin · users |
| `/admin/users/{userId}` | F | Admin · user detail |

Each placeholder shows a "Phase 14 X" tag, the route literal, and the title. No feature behaviour, no fetches. Replaced wholesale when its sub-step ratifies.

### Hash → path redirect

`frontend/src/router/legacyHashRedirect.ts`. Runs once in `main.tsx` BEFORE `ReactDOM.createRoot(...).render(...)`. Catches inbound `#/foo` URLs and rewrites them via `history.replaceState` to the canonical `/foo` form, preserving query strings (`?token=…`).

Five test cases cover: matter deep-link, auth/reset with token, root, no-hash no-op, non-route hash no-op (e.g. `#top` for in-page anchors).

### Drawer state lift

Pre-A0, `App.tsx` owned `drawerMatter` + `drawerTab` state and passed setters to `MatterDetail` via `onMatterLoaded` / `onTabChange` props. With routed pages those callers no longer exist, so I introduced `src/app/DrawerContext.tsx`:

- `DrawerProvider` wraps `AppShell` so both `<Outlet />` (which mounts `MatterDetail`) and the chrome siblings (TopBar, Drawer) see the same state.
- `MatterDetail`'s prop list shrank to `{ slug }`. The two setters come from `useDrawer()` inside the component. No call-site changes anywhere else.

### Hash-href sweep

Every `href="#/..."` and `` `#/...` `` literal across `src/` rewritten to `/`. With browser-history routing, a click on `<a href="/matters">` triggers the router's intercepted nav; the hash form would set `window.location.hash` and never fire a route change.

Files touched (sed): TopBar, Drawer, ProfileChip, primitives, Landing, Manifesto, Waitlist, SignUp, SignIn, ResetPassword, ForgotPassword, Verify, VerifyPending, NewMatter, MatterList, MatterDetail, MatterBreadcrumb, Modules, WorkflowsTab, Settings. Doc comments referencing `#/demo` etc. left as historical context.

### Test framework

Pre-A0 the frontend had no tests. A0 adds:

- `vitest@4.1.7` + `jsdom@28` + `@testing-library/react` + `@testing-library/jest-dom`
- `vitest.config.ts` + `src/test/setup.ts`
- `npm test` + `npm test:watch` scripts

Two test files, **29 tests, all passing**:

- `src/router/legacyHashRedirect.test.ts` — 5 tests covering the hash→path rewriting.
- `src/lib/route.test.ts` — 24 tests covering `routeFromPath` for every existing route + every Phase 14 placeholder route + a few edge cases (trailing slash, unknown path → landing fallback). `parseHash` compatibility wrapper covered.

## Verification

- `npm run typecheck` — clean.
- `npm test` — 29/29.
- `npm run build` — 552 KB JS / 27 KB CSS, clean. Bundle warning is pre-existing.
- Backend sweep unchanged (no backend files touched).

## What this DOES NOT do (per Reviewer instruction)

- **No `/app` content.** Phase 14 A handles that. A0's `/app` is a placeholder.
- **No bootstrap-state fetch.** Phase 14 A.
- **No `BootstrapStateProvider`.** Phase 14 A.
- **No first-run UX.** Phase 14 A.
- **No module-catalog rework.** Phase 14 B.
- **No reconstruction view.** Phase 14 E.
- **No admin pages.** Phase 14 F. (Their routes are stub'd because deep-links must resolve; the content is `PlaceholderPage`.)

If a sub-step builder finds themselves editing the router definition for anything other than swapping a placeholder component, treat that as scope creep.

## Files added

- `frontend/src/router/index.tsx`
- `frontend/src/router/PlaceholderPage.tsx`
- `frontend/src/router/legacyHashRedirect.ts`
- `frontend/src/router/legacyHashRedirect.test.ts`
- `frontend/src/lib/route.test.ts`
- `frontend/src/app/AppShell.tsx`
- `frontend/src/app/DrawerContext.tsx`
- `frontend/src/auth/AuthSnapshot.ts`
- `frontend/src/test/setup.ts`
- `frontend/vitest.config.ts`
- `docs/handovers/HANDOVER_PHASE_14_A0_ROUTER_FOUNDATION_DONE.md` (this file)

## Files changed

- `frontend/src/app/App.tsx` — slimmed to RouterProvider mount.
- `frontend/src/main.tsx` — calls `redirectLegacyHash()` before render.
- `frontend/src/lib/route.ts` — hash router → TanStack Router compatibility shim.
- `frontend/src/auth/AuthProvider.tsx` — mirrors state to `AuthSnapshot`.
- `frontend/src/matter/MatterDetail.tsx` — drawer setters via context, not props.
- `frontend/src/demo/DemoMatter.tsx` — pathname comparison instead of hash.
- `frontend/package.json` — added vitest deps + test scripts.
- 19 components: `href="#/..."` → `href="/..."`.

## Next sub-step

**Phase 14 A — Bootstrap-state + first-run shell.** Wire `GET /api/system/bootstrap-state`, render the three-state machine (`user_count=0` / `has_superuser=false` / `has_superuser=true`), replace `/app`'s placeholder. Per the plan, the empty-state copy must NOT claim registration creates an admin.
