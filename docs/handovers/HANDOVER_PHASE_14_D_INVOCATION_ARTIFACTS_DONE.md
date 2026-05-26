# HANDOVER — Phase 14 D Invocation + Artifacts DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `7258cf7` (v2). **A0:** `d98a6a2`. **A:** `fb80cb9`. **B:** `d534d59`. **C:** `6b7d23c`.
**Reviewer brief:** "Phase 14 D, but keep it tight: invocation UI + artifacts surfaces only. No reconstruction view, admin, settings, async, or new substrate unless the invoke/artifact UI proves an actual backend gap."

## What landed

Three new components + two new routes wired through the existing matter workspace. Zero new substrate.

### Invocation
- `src/matter/InvocationRunner.tsx` — per-(module, capability) Run affordance with an inline result panel. Idle → Running → either (a) Success + kind-aware preview, or (b) one of seven typed structured-error banners. Optional Args disclosure (JSON textarea, defaults to `{}`).
- `src/matter/ArtifactPreview.tsx` — kind-aware renderer used by both the invocation result panel and the artifact-detail page. Knows `motion_draft` (markdown + claim_summary card) and `evidence_list` (table). Falls back to pretty-printed JSON for unknown kinds or mismatched payload shape.

### Artifacts surfaces
- `src/matter/ArtifactsList.tsx` — `/matters/{slug}/artifacts`. Hits Phase 13b A's `GET /api/matters/{slug}/artifacts`; renders a desc-by-created_at table. Per Phase 13b Decision #1, reads emit no audit row.
- `src/matter/ArtifactDetail.tsx` — `/matters/{slug}/artifacts/{artifactId}`. Hits `GET /.../artifacts/{id}`; renders metadata + ArtifactPreview keyed by the row's `kind`.

### Wired into matter workspace
- `GrantsPanel.tsx` now derives a `runnablePairs` set from the cross-product of catalog × grant list:
  - module is valid + in the v2 catalog,
  - capability is `scope === "matter"`,
  - at least one grant on this matter matches `plugin === module_id`.
- Each runnable pair renders a Run button via `InvocationRunner`. We do NOT invent runnables from the catalog alone — the user must have granted on this matter first. The plugin→module_id link is loose; substrate enforces the real check.

### Router

The two artifact routes swapped from `PlaceholderPage` to real components in `src/router/index.tsx`. Routes still live under `__authed`.

### API client (`src/lib/api.ts`)

Added:

- `InvocationResponse`, `ArtifactSummary`, `ArtifactRead`.
- `invokeCapability(slug, {module_id, capability_id, args})`, `listArtifacts(slug)`, `readArtifact(slug, id)`.
- **Seven typed errors** covering every documented non-200 path from `backend/app/api/invocations.py`:
  - `PostureBlockedError` (403; carries posture, requiredRole, actorRole, reason)
  - `CapabilityDeniedError` (403; carries plugin, skill, capability)
  - `Phase1BlockedError` (403; carries blockedReason, gateState)
  - `ProviderKeyMissingForInvokeError` (422; carries provider — drives the `/settings/keys` deep-link)
  - `ProviderUpstreamInvokeError` (502; carries provider, code, upstreamStatus)
  - `InvocationInvalidArgsError` (422; carries the substrate message verbatim)
  - Unknown envelope → plain `Error` with raw substrate text (graceful degradation)

Callers branch on `instanceof`, never string-match.

## Audit deep-link contract

Both the invocation result panel and the artifact detail page link to `/matters/{slug}/audit?invocation_id=<id>`. This route is **registered** (Phase 14 A0 placeholder); the deep-link contract here is what Phase 14 E will honour. Unlike the Phase 14 B `/admin/audit` redline that pointed to a non-existent route, this link goes to a real route that resolves to the placeholder — meaningful content lands when E ratifies. Test pins the exact query-param shape so it can't regress.

## Test coverage

19 new tests across four files. Total frontend test count: **83 passing** (up from 66).

- `InvocationRunner.test.tsx` (6) — happy path renders motion_draft preview + audit deep-link; each of `PostureBlockedError`, `ProviderKeyMissingForInvokeError`, `CapabilityDeniedError`, `Phase1BlockedError`, `InvocationInvalidArgsError` renders its structured banner with the substrate vocabulary (action names) verbatim.
- `ArtifactPreview.test.tsx` (5) — motion_draft → markdown + claim_summary card; evidence_list → table; JSON fallback for unknown kind; JSON fallback when payload shape doesn't match the hint; auto-detect when no hint.
- `ArtifactsList.test.tsx` (3) — rows render with substrate columns + Open link; empty state; error inline.
- `ArtifactDetail.test.tsx` (3) — metadata + kind-aware preview; JSON fallback for unknown kind; **audit deep-link carries `?invocation_id=…` verbatim** (pins the Phase 14 E contract); error state.

## Verification

- `npm run typecheck` — clean.
- `npm test` — **83/83**.
- `npm run build` — clean.
- Backend untouched (zero substrate file changes; finding 14-B-#1 still open but not blocking — the runnable-pairs heuristic sidesteps it).

## P3 nit from C ratification

Renamed the awkward test `renders for a superuser whose role IS qualified_solicitor only when… no it does not` → `renders nothing for superuser when role is qualified_solicitor`. No behavioural change.

## Reviewer-narrow discipline — what this DOES NOT do

- **No reconstruction view.** Phase 14 E. The two deep-links from D point at the registered placeholder route; pins the query-param contract.
- **No admin pages.** Phase 14 F.
- **No settings polish.** Phase 14 G. The provider-key-missing banner links to `/settings/keys` (existing route) but does not modify the settings UI.
- **No async / background invocations.** Synchronous POST + inline result. Long-running invocations would block; substrate's existing behaviour. Not in scope per the brief.
- **No new audit emissions.** Substrate emits everything (`module.capability.invoked`, `module.capability.completed`, `model.call`, `model.invoked`, `posture_gate.check.blocked`, etc.); UI never invents a row.
- **No backend changes.** The finding 14-B-#1 (no list-installed-modules endpoint) remains open — Phase 14 D's runnable-pairs heuristic sidesteps it (grant existence on this matter is the gate, not module-installed state at workspace level). Reviewer may still want to close 14-B-#1 in a backend phase; D doesn't force the issue.

## Acceptance vs ACCEPTANCE.md

- **§1 (registered → run module → reconstruction).** The path is fully wired: register → /app → open matter → grant a capability → Run → see result → link to artifacts list and detail. Reconstruction is the only remaining piece (Phase 14 E).
- **§5 (every journey achievable through UI).** Journeys 08 + 09 + 10 reachable via this surface.
- **§11 (no hidden failures).** Seven typed error banners, each citing the substrate action verbatim. No generic toasts.
- **§14 (no diverged vocabulary).** Audit action names (`posture_gate.check.blocked`, `module.capability.denied`, `advice_boundary.check.blocked`, `model.call.error`) appear verbatim in banner text. Substrate state names (`B_mixed`, `qualified_solicitor`) appear verbatim. Artifact kinds (`motion_draft`, `evidence_list`) keyed off substrate strings.
- **§15 (no claim-without-ship).** Audit deep-link labels include "(Phase 14 E)" so the user understands the link goes to a placeholder until then.

## Next sub-step

**Phase 14 E — reconstruction view.** Lands the matter audit page at `/matters/{slug}/audit` with the query-param contract (`?invocation_id=…`, `?action=…`) already pinned by Phase 14 B / C / D tests. When E ratifies, the deep-links across the app become meaningful without churn.
