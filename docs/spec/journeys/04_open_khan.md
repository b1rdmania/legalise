# Journey 04 — Open the Khan v Acme matter

The user opens the seeded sample matter to see what a workspace looks like.

## Preconditions

- User authenticated; Khan v Acme seeded (every registered user gets it via `auth.user.demo_seeded`).

## Goal

User lands on `/matters/khan-v-acme-trading-2026` and sees the matter workspace hub.

## Trigger

User clicks "Khan v Acme Trading Ltd" from `/matters` or from the app-home recent-matters list.

## Steps

1. **Load matter list.**
   - System: `GET /api/matters` → array of `MatterRead`.
2. **Open matter.**
   - System: parallel calls to:
     - `GET /api/matters/khan-v-acme-trading-2026` (matter row)
     - `GET /api/matters/khan-v-acme-trading-2026/documents` (3 seeded docs)
     - `GET /api/matters/khan-v-acme-trading-2026/grants` (per-user grants on this matter — Phase 7)
     - `GET /api/matters/khan-v-acme-trading-2026/artifacts` ★ (gap)
   - Workspace renders with four panels:
     - Documents (3 — dismissal letter, witness statement, NDA)
     - Installed modules + their grants on this matter
     - Artifacts (empty on first open)
     - "See audit trail" link → `/matters/{slug}/audit`
3. **Posture banner (if applicable).**
   - Default seed posture is `B_mixed`.
   - If caller role is not `qualified_solicitor` → banner per `POSTURE_GATE_UX.md`.

★ **Gap:** `GET /api/matters/{slug}/artifacts` does not exist; logged in `BACKEND_GAP_AUDIT.md`.

## Audit emissions

| Step | Action | Audit row | Notes |
| --- | --- | --- | --- |
| 1 | List matters | none | read |
| 2 | Open matter | none | read |
| 3 | Posture-aware render | none | the substrate emits `posture_gate.check.blocked` only on actual invocation, not on UI mount |

## Acceptance criteria

- [ ] Matter workspace loads in under 500ms cold (Phase 15 perf budget).
- [ ] All four panels render in their loading → loaded → empty state cleanly.
- [ ] Posture banner appears IFF role < required for posture; deep-links to audit/reconstruction.
- [ ] Document panel shows extracted body via `GET /api/documents/{doc_id}/body` on row click.

## Not covered

- Matter creation flow — `04b_create_matter.md` is implicit in the route map but Phase 13 doesn't split it out as a separate journey.
- Workflows panel (`/api/matters/{slug}/workflows`) — Phase 15+ if surfaced.
