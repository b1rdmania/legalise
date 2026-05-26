# Acceptance Criteria — Whole Product Loop

What Phase 15+ has to deliver for Phase 13 to be considered complete in pixels, not just markdown.

The acceptance criteria here are **product-level**, not page-level. Per-page acceptance lives in the journey docs.

## Andy's four

Verbatim from the Phase 13 plan brief:

1. **A fresh evaluator can go from registered user to running a module and viewing its reconstruction trail.**
2. **No direct DB manipulation.**
3. **No curl-only step except first-admin bootstrap CLI.**
4. **No unsupported marketing claim.**

## Derived from the journey docs

5. **Every documented journey is achievable through the implemented UI without dropping to DB or curl.** Each journey doc has its own acceptance checklist; the product is "complete" when every checklist holds.

6. **Every documented user action lands the documented audit row** (or explicit `none`). The audit-emission map (`AUDIT_EMISSION_MAP.md`) is the source of truth; Phase 14+ verifies each row matches the spec.

7. **Posture-gate denial is visible + actionable in the UI.** A `solicitor` clicking "Run" on a `B_mixed` matter sees the structured banner, NOT a generic error, AND can deep-link from the banner to the matching reconstruction row.

8. **Reconstruction is deep-linkable from every relevant page.** Module install page, grant page, invocation success/failure, artifact detail, admin role change — each has a "View in audit trail" link with enough context preserved to filter.

9. **The first-run experience matches Journey 00 exactly.** Fresh fork → register → run CLI → land on app-home → BYO key → install Contract Review → grant → invoke → view reconstruction. No step requires reading source code.

10. **The admin lifecycle is coherent through the UI.** Bootstrap via CLI (one off, env-gated for the rare second), then promotion / demotion via the admin page. Off-boarding stays on direct DB (deliberate Phase 11/12 scope).

## Anti-criteria — what the product MUST NOT do

11. **Hide failures.** Posture / grant / capability denials always render a structured banner. Never silently no-op. Never "Something went wrong" without a structured code.

12. **Smuggle authority.** No UI surface lets a `solicitor` invoke a `qualified_solicitor`-required capability through any path. The substrate enforces, but the UI MUST NOT pretend that capability is available.

13. **Bypass audit.** No UI action that mutates state may avoid the documented audit emission. If the spec says it should emit and the substrate doesn't, the spec records a finding — the UI doesn't ship the action.

14. **Diverge from substrate vocabulary.** Roles, postures, audit action names, BlockedReason enum values — the UI uses the substrate's strings verbatim. No translation layer that could drift.

15. **Claim what isn't shipped.** Marketing copy on landing already shipped at `legalise.dev`; the in-app surface MUST NOT promise features the substrate doesn't expose. If a Phase 15+ surface ships, the in-app copy reflects what's actually live.

## Coverage validation

Phase 15+ each ship a Playwright (or equivalent) suite that walks the journey end-to-end. The journey doc's acceptance checklist is the test plan.

Cross-cutting tests:

- **First-run end-to-end** — script: fresh DB, run CLI, complete BYO key, install Contract Review, grant, invoke, view reconstruction. Wall-clock under 10 minutes for a real evaluator.
- **Audit emission coverage** — for each row in `AUDIT_EMISSION_MAP.md`, an integration test verifies the row lands when the action runs.
- **Posture matrix** — for each cell in `POSTURE_GATE_UX.md`, an integration test verifies the banner content + deep-link behaviour.

## What Phase 13 explicitly does NOT acceptance-test

- Visual regression — Phase 15+ component-level.
- Performance budgets — Phase 15+ per surface.
- A11y AAA conformance — Phase 15+ per surface (Phase 14 picks the testing tools).
- Internationalisation — out.
- Mobile responsiveness — Phase 15+ where it matters (reconstruction view, matter list).

## Sign-off

Phase 13 is "done" when:

- [ ] All 13 journey docs ratified by Reviewer
- [ ] Page map ratified
- [ ] Audit emission map ratified
- [ ] Posture-gate UX ratified
- [ ] Backend gap audit findings ratified (Reviewer picks Phase 13b shape)
- [ ] Stack appendix ratified
- [ ] This acceptance doc ratified

Phase 14 starts after all seven hold.
