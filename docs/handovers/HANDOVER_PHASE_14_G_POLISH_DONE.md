# HANDOVER — Phase 14 G Polish DONE

**Branch:** `runtime-rewrite`
**Prior ratifications:** plan `7258cf7` (v2). A0 `d98a6a2`. A `fb80cb9`. B `d534d59`. C `6b7d23c`. D `9406ef0`. E `ea522a1`. F `11e4f6a`.
**Reviewer brief:** "Phase 14 G, the final polish/settings pass. Keep it bounded: navigation anchors for the real A–F surfaces, settings/key polish if needed, posture-change affordance if already backed by existing `PATCH /privilege`, and cleanup of placeholder wording. No new substrate unless G exposes a genuine missing endpoint."

## What landed

Four narrow polish changes plus the cross-cutting handover. Zero new substrate.

### G.1 — TopBar admin anchor

`src/ui/TopBar.tsx` now renders an `Admin` nav anchor between `Settings` and the `ProfileChip` when `auth.user?.is_superuser === true`. Active-state styling covers both Phase 14 F routes (`adminUsers`, `adminUserDetail`). Substrate enforces independently — UI gating is the no-smuggled-authority signal.

### G.2 — Posture change CTA in PostureBanner

`PostureBanner` accepts an optional `onChangePosture` prop. When provided AND `user.is_superuser === true`, the banner renders an inline `ChangePostureControl` (select + Apply button) on both `B_mixed` and `C_paused` panels. The select is seeded to the current posture; submit is disabled until the draft differs. Wired in `MatterDetail` against the existing `onPostureChange` handler (Phase 4 `PATCH /api/matters/{slug}/privilege`). Non-admins continue to see the explanatory banner only; the control is hidden.

The control replaces the C_paused "PATCH /privilege" copy-only hint. UX is the same in spirit but is now actionable.

### G.3 — Placeholder wording dropped

E shipped, so the "(Phase 14 E)" parenthetical on the audit deep-link labels in `InvocationRunner` + `ArtifactDetail` was stale. Removed. The links now read "See audit trail for this invocation" — the destination is real, no caveat needed.

### G.4 — Settings/keys audit

Briefly audited `src/auth/Settings.tsx` + the `/keys` flow. The page already calls the substrate's `POST /api/settings/keys` and `DELETE /api/settings/keys/{provider}` correctly; substrate-side Phase 13b D emits `user.key.configured` (added/rotated) and `user.key.revoked` rows automatically. No polish required — closing the task without a code change.

## Tests

7 new tests, total **114 passing** (up from 107):

`src/ui/TopBar.test.tsx` — 3 tests:
- Superuser sees the admin anchor pointing at `/admin/users`.
- Non-superuser viewer does not see it.
- Unauth visitor does not see it.

`src/matter/PostureBanner.test.tsx` — 4 new tests (15 total):
- Admin sees the change-posture control, default-selected current, submit disabled until changed; on submit, callback fires with the new posture string.
- Non-superuser never sees the control.
- C_paused admin sees the control (parity with B_mixed).
- Omitting `onChangePosture` hides the control even for admins (caller opt-in contract).

The existing C_paused test was updated: the inline "PATCH …/privilege" copy hint was replaced by the actionable control, so the assertion now pins the banner's presence without the verbatim-copy expectation.

## Verification

- `npm run typecheck` — clean.
- `npm test` — **114/114**.
- `npm run build` — clean.
- Backend untouched.

## What this DOES NOT do

Per the Reviewer brief — and the build plan's G scope:

- **No global audit view.** Finding `14-B-#2` (admin/workspace-scoped reconstruction) stays open. The G brief explicitly didn't include it.
- **No bulk operations.** No bulk role change, no bulk module install/revoke.
- **No notifications / banners across pages** beyond what each sub-step already ships.
- **No vocabulary lint rule** (Phase 14 plan §1 cross-cutting mentioned it; deferred — every Phase 14 component already uses substrate vocabulary verbatim and the tests pin it).
- **No new audit emissions.** Every Phase 14 G affordance maps to an existing substrate emission.

---

# Phase 14 close-out

Phase 14 is complete. Eight sub-steps (A0 + A–G) shipped, all ratified. The Andy's-four acceptance criteria are now reachable end-to-end through pixels.

## Sub-step ledger

| Sub-step | Surface | Ratified at |
| --- | --- | --- |
| A0 | TanStack Router migration, AuthGate, hash redirect | `d98a6a2` |
| A | `/app` first-run + authed home | `fb80cb9` |
| B | `/modules` catalog + detail + trust ceremony | `d534d59` |
| C | Grants panel + PostureBanner | `6b7d23c` |
| D | Invocation runner + artifacts list/detail | `9406ef0` |
| E | `/matters/{slug}/audit` reconstruction | `ea522a1` |
| F | `/admin/users` + `/admin/users/{userId}` | `11e4f6a` |
| G | TopBar admin anchor + posture-change CTA + placeholder cleanup | this handover |

## Acceptance vs ACCEPTANCE.md (Andy's four)

1. **Registered → run module → reconstruction.** ✅ A (`/app`) → B (install) → C (grant) → D (run + artifacts) → E (reconstruction). End-to-end through pixels.
2. **No direct DB manipulation.** ✅ Every state change has a UI path.
3. **No curl-only step except first-admin bootstrap CLI.** ✅ AppHome's bootstrap-required state literally surfaces the Phase 12 CLI command; everything else is UI.
4. **No unsupported marketing claim.** ✅ Per-sub-step copy review; PostureBanner copy + AdminUserDetail copy explicitly disclaim what the substrate doesn't expose (e.g. response no-op inference).

Plus the derived §5–§10 + anti-criteria §11–§15: every test pins the substrate vocabulary and the no-smuggled-authority discipline.

## Open backend findings (carried forward)

Three findings in `BACKEND_GAP_AUDIT.md` are still open after Phase 14. None blocks the close-out — the frontend ships graceful fallbacks for each. Reviewer's call when to close.

- **14-B-#1** — no list-installed-modules endpoint. Catalog ships without at-a-glance installed badges; runnable-pair derivation (D) uses the catalog × grant intersection heuristic.
- **14-B-#2** — no global / workspace-scoped audit reconstruction. InstallCeremony's invalid-transition banner names `module.ceremony.rejected` without a deep-link. F left this open deliberately.
- **14-E-#1** — no server-side `invocation_id` / `action` filter on reconstruction. Frontend filters client-side with honest partial-page copy (E P1 redline closed this).

All three are clean Reviewer calls. A backend mini-phase between Phase 14 and Phase 15 could close them, or carry into 15 with the Playwright suites.

## Phase 14 totals

- **Frontend test count:** 114 passing across 16 test files.
- **Substrate file changes during Phase 14:** zero. Three findings filed; no endpoint additions.
- **New routes:** 8 (A–F real surfaces).
- **Route migration:** A0 swapped a hash-based router to TanStack file-based, with a one-release hash → path redirect shim.
- **New audit emissions:** zero. Every UI-triggered audit row comes from a substrate emission already verified in Phase 13b D's audit gap-fill.

## Next phase

**Phase 15** — the build plan estimates Playwright (or equivalent) end-to-end coverage walking every journey doc. Per ACCEPTANCE §15-coverage: "First-run end-to-end" script, "Audit emission coverage" integration tests against each `AUDIT_EMISSION_MAP.md` row, and the "Posture matrix" tests against `POSTURE_GATE_UX.md`.

The three open backend findings (`14-B-#1`, `14-B-#2`, `14-E-#1`) can either close in a backend mini-phase first, or carry into 15 alongside the Playwright work — Reviewer's call.

Handover: this file. Phase 14 closes when ratified.
