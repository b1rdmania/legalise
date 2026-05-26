# Handover — Phase 13 Done v2 (Product Surface Specification)

**v2 patch (post-Reviewer):** Reviewer's first-pass review found one P1 (phantom audit actions in the audit map), two P2s (settings-key audits unverified; some matter rows already concrete), and one P3 (advice-boundary dual-name not documented). All four patched. Phase 13b shape locked to **Option B (bundled)** per Reviewer's call. See "Reviewer redlines applied (v2)" at the bottom.

---

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_13_PRODUCT_SURFACE_SPEC_BUILD_PLAN.md` (v2)
**Sweep:** Phase 13 ships markdown only. Sweep unchanged at **676 passed, 8 skipped** (no backend code touched).

---

## The blueprint exists

Phase 13 turned the substrate into a written app spec. Phase 14 builds the foundation; Phase 15+ ships features one at a time. No frontend code lands until the spec is ratified.

The deliverables match the v2 plan exactly:

| Step | Artefact | Path |
| --- | --- | --- |
| 1 | Page map + route table | `docs/spec/PAGE_MAP.md` |
| 2 | 13 journey docs | `docs/spec/journeys/` |
| 3 | Audit emission map | `docs/spec/AUDIT_EMISSION_MAP.md` |
| 4 | Posture-gate UX matrix | `docs/spec/POSTURE_GATE_UX.md` |
| 5 | First-run journey | `docs/spec/journeys/00_first_run.md` (load-bearing for the open-core release narrative) |
| 6 | Backend gap audit | `docs/spec/BACKEND_GAP_AUDIT.md` |
| 7 | Frontend stack appendix | `docs/spec/STACK_APPENDIX.md` |
| 8 | Acceptance criteria | `docs/spec/ACCEPTANCE.md` |
| 9 | This handover | `docs/handovers/HANDOVER_PHASE_13_PRODUCT_SURFACE_SPEC_DONE.md` |

---

## Architectural decisions ratified

The seven Phase 13 decisions held end-to-end. Two are load-bearing:

### Decision #4 — Audit emissions are part of the UI contract

`AUDIT_EMISSION_MAP.md` is the source of truth. Every user action gets a row: the canonical audit row it lands, an explicit `none` with justification, or a flagged "verify shape" for substrate calls whose emission Phase 14 needs to confirm.

This is the discipline that keeps "supervised autonomy" load-bearing in pixels, not just JSON. A button that emits no audit row is a deliberate choice the spec records; a button that should emit one but doesn't is a finding.

### Decision #5 — Backend gap audit by file:line

Each expected endpoint verified by reading code. Five real gaps found:

1. `GET /api/matters/{slug}/artifacts` — artifact listing per matter
2. `GET /api/matters/{slug}/artifacts/{id}` — artifact read
3. `GET /api/admin/users` — admin user listing
4. `GET /api/admin/users/{user_id}` — admin user detail
5. `GET /api/system/bootstrap-state` — first-run detection (or equivalent)

Plus an "audit-shape verification pass" for fastapi-users + settings + matter mutations whose emission is unverified.

---

## Findings (Phase 13b backlog)

Reviewer decides between three approaches:

**Option A — Three small phases.**
- Phase 13b-A: artifact endpoints (~2 days)
- Phase 13b-B: admin user list + detail (~1 day)
- Phase 13b-C: first-run state + audit-shape verification (~3 days)

**Option B — One bundled Phase 13b.** All five gaps + audit-shape verification in one ~5-day substrate phase. Then Phase 14 starts on a complete substrate.

**Option C — Merge into Phase 14.** Gaps land during the frontend phase as they're encountered. Risks coupling backend + frontend timelines.

**Recommendation:** Option B. The substrate is the source of truth; finishing it before Phase 14 means the frontend isn't building against a moving target. Five days is short enough not to derail the overall timeline.

---

## Open product questions for Reviewer

Listed in the relevant spec files; consolidated here:

1. **Does reading a privileged artifact emit an audit row?** Phase 13 doesn't decide. Phase 15+ either ships `matter.artifact.read` or explicitly defers.
2. **Does the substrate need a dedicated `artifact.created` audit row?** Phase 9 follow-up confirmed `write_artifact` emits nothing today; reconstruction relies on `module.capability.completed.payload`. Open whether to formalise.
3. **Self-service role-request flow?** A `solicitor` on a `B_mixed` matter currently has no in-app path to request promotion. Phase 13 doesn't ship one; flagged in `POSTURE_GATE_UX.md`.
4. **Real-time posture banner refresh?** When a `workspace_admin` changes a matter's posture, does the active session re-render the banner without a page refresh? Punted to Phase 15+.

---

## What "complete" means

Phase 13 is complete in **markdown coverage**, not in pixels. The product is complete when Phase 15+ surfaces ship and `ACCEPTANCE.md`'s ten criteria hold.

Specifically:

- All 12 user-facing journeys + the first-admin CLI journey are written end-to-end
- All 9 surface categories from the page map have an explicit route, API contract, and state model
- All canonical audit emissions are mapped (with "verify shape" markers where the substrate emission is unverified)
- All nine cells of the posture × role matrix are spec'd
- The fork experience is a first-class deliverable (Journey 00)
- Five real backend gaps named with proposed shapes
- Four frontend stack candidates analysed with tradeoffs
- Recommendation: Vite + React, confirmed by Phase 14

---

## File ledger

```
NEW
  docs/spec/PAGE_MAP.md
  docs/spec/journeys/README.md
  docs/spec/journeys/00_first_run.md
  docs/spec/journeys/01_first_admin_bootstrap.md
  docs/spec/journeys/02_login_signup.md
  docs/spec/journeys/03_byo_key_setup.md
  docs/spec/journeys/04_open_khan.md
  docs/spec/journeys/05_install_module.md
  docs/spec/journeys/06_trust_ceremony.md
  docs/spec/journeys/07_grant_permissions.md
  docs/spec/journeys/08_invoke_contract_review.md
  docs/spec/journeys/09_invoke_pre_motion.md
  docs/spec/journeys/10_inspect_artifacts.md
  docs/spec/journeys/11_inspect_reconstruction.md
  docs/spec/journeys/12_admin_role_promotion.md
  docs/spec/AUDIT_EMISSION_MAP.md
  docs/spec/POSTURE_GATE_UX.md
  docs/spec/BACKEND_GAP_AUDIT.md
  docs/spec/STACK_APPENDIX.md
  docs/spec/ACCEPTANCE.md
  docs/handovers/HANDOVER_PHASE_13_PRODUCT_SURFACE_SPEC_DONE.md (this doc)

MODIFIED
  (none — zero backend code touched per acceptance criterion)
```

20 markdown files. No code.

---

## Phase 14 entry-point

When Phase 13 is ratified + Phase 13b lands, Phase 14 builds the foundation. The spec's eight files are the source of truth for these questions:

- **What pages does the app have?** → `PAGE_MAP.md`
- **What does each page do step-by-step?** → `journeys/*.md`
- **Which API call serves which page?** → `PAGE_MAP.md` API column + journey "Steps" sections
- **What audit row does each user action emit?** → `AUDIT_EMISSION_MAP.md`
- **What happens on a posture denial?** → `POSTURE_GATE_UX.md`
- **What does the fresh-fork experience look like?** → `journeys/00_first_run.md`
- **Which stack do we pick?** → `STACK_APPENDIX.md` (recommendation: Vite + React)
- **When are we done?** → `ACCEPTANCE.md`

---

## Out of scope at end of Phase 13

- Any backend code edit (acceptance criterion)
- Any frontend code (the entire SPA is Phase 14+)
- Component library decision (Phase 14)
- Routing library decision (Phase 14)
- Data-fetching library decision (Phase 14)
- Test-runner decision (Phase 14)
- Deployment target confirmation (Phase 14; the brand-seal handover already names Cloudflare Pages)
- Pixel-perfect mocks
- Marketing site copy (`legalise.dev` already shipped)
- Mobile / responsive specifics
- Performance budgets
- Internationalisation

---

## Hand-off line for Reviewer

> *Phase 13 (product surface specification) shipped on `runtime-rewrite`. 20 markdown files; zero backend code touched. The substrate is now spec'd into 13 end-to-end journeys, a 9-category page map with API contracts, a complete audit-emission map, a posture-gate UX matrix, a first-run / fork experience as a first-class deliverable, a backend gap audit naming five real gaps + an audit-shape verification pass, a frontend stack appendix recommending Vite + React, and the ten acceptance criteria for the whole product loop. The spec is the source of truth; Phase 14 starts only on a ratified spec + the Phase 13b backlog Reviewer picks between. Ready for ratification.*

---

---

## Reviewer redlines applied (v2)

Reviewer's first-pass review surfaced four findings; all patched in `AUDIT_EMISSION_MAP.md` v2 + `BACKEND_GAP_AUDIT.md` v2.

### P1 — Phantom audit actions removed

v1's audit map listed four action names that don't actually emit:

- `auth.user.registered` — was claimed as substrate audit row; actually a `logger.info` structured log line at `backend/app/core/auth.py:66`. Now marked **GAP**.
- `auth.user.demo_seeded` — same; structured log at `core/auth.py:115`. Now **GAP**.
- `auth.user.capabilities_auto_granted` — same; structured log at `core/auth.py:134`. Now **GAP**.
- `module.installed` — claimed to be a separate audit row after install; doesn't exist. The substrate emits `module.enabled` when the ceremony state machine reaches ENABLED (`backend/app/core/trust_ceremony.py:463`). Now **REMOVED**; the UI must assert against `module.enabled`.

### P2 — Settings key audits flagged as substrate work, not Phase 14 follow-up

`backend/app/api/settings.py` has no `audit.log` calls. Provider key add / rotate / remove all emit nothing. Reviewer marked this as a P2 blocker — BYO keys are security-sensitive; reconstruction must record key lifecycle. Phase 13b D adds `user.key.configured` + `user.key.revoked` rows before Phase 14 ships the settings surface.

### P2 — Matter audit rows made concrete

v1 had "verify shape" against matter create / upload / posture change / archive. v2 verified all four against `backend/app/api/matters.py`:

- `matter.create` — `matters.py:280` (**VERIFIED**)
- `document.upload` — `matters.py:467` (**VERIFIED**)
- `privilege.set` — `matters.py:569` (**VERIFIED**)
- `matter.deleted` — `matters.py:1074` (**VERIFIED**)

### P3 — Advice-boundary dual-name documented

The substrate exposes two names for the same logical event through different reconstruction sources:

- `audit_entries.action = advice_boundary.check.{completed|blocked|denied|failed}` (written by `gate.py:_emit`; surfaced as `source="audit"` rows)
- `advice_boundary.decision.{completed|blocked|denied|failed}` (synthesised by `audit_reconstruction.py:_abd_to_entry` from the `AdviceBoundaryDecision` table; surfaced as `source="advice_boundary"` rows; never written to `audit_entries`)

Both appear in the reconstruction response. Frontend tests must match the source they're asserting on. Documented in `AUDIT_EMISSION_MAP.md` § "Advice-boundary dual-name clarification".

---

## Phase 13b shape (Reviewer ratified)

**Option B (bundled).** One ~5.5-day substrate phase, then Phase 14 starts.

| Sub-step | Scope | Estimate |
| --- | --- | --- |
| Phase 13b A | Artifact endpoints (list + read) | ~2 days |
| Phase 13b B | Admin user list + detail | ~1 day |
| Phase 13b C | First-run state endpoint | ~0.5 days |
| Phase 13b D | **Audit-shape gap-fill** (8 auth events + 2-3 settings key events + module update/revoke verification + demo-seed audit decision) | ~2 days |

Reviewer's reasoning: Option A (three small phases) keeps Phase 14 stalling on sequential delivery. Option C (merge into Phase 14) couples frontend timeline to backend discoveries. Option B ships the substrate once, fully, before Phase 14 starts.

Full sub-step ledger in `docs/spec/BACKEND_GAP_AUDIT.md` v2.

---

*End of Phase 13 handover v2.*
