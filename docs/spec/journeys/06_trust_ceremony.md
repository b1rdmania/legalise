# Journey 06 — Trust ceremony (in-ceremony detail)

The four-click ceremony admin walks during a module install. This is Journey 05's load-bearing inner loop.

## Preconditions

- Ceremony started via Journey 05 Step 3; `ceremony_id` in hand.
- Verified-publisher fast path (3 trusts + 1 grant). Non-verified modules walk a 7-step path; the UI conditionally renders.

## Goal

Admin reviews the module's permission card four times — once per ceremony state — and commits the install via the final `grant` action.

## Trigger

Admin lands on the ceremony page (could be `/modules/install/{ceremony_id}`).

## Steps

### Fast path (verified publisher)

For each of three trust steps and one grant step, the UI shows the ceremony's current state + the permission card:

1. **`discovered` → `trust` → `publisher_checked`**
   - Card shows: module id, publisher, signature status (`verified` / `unsigned` / `invalid` / `unknown_publisher`), signed-by.
   - Action: "I've reviewed the publisher" → `POST .../advance` body `{action: "trust"}`.

2. **`publisher_checked` → `trust` → `permissions_reviewed`**
   - Card shows: declared reads, writes, model_access, external_network, data_movement.
   - Action: "I've reviewed the requested permissions".

3. **`permissions_reviewed` → `trust` → `granted`**
   - Card shows: declared gates, advice_tier_max, audit_events.
   - Action: "I've reviewed the gates and audit promises".

4. **`granted` → `grant` → `enabled`**
   - Card shows: final summary + the canonical "this writes an `installed_modules` row" line.
   - Action: "Install module" → `POST .../advance` body `{action: "grant"}`.

### Full path (unverified — 7 steps)

Same card structure, with two extra inspection states (`inspected`, `signature_checked`) and an explicit `gates_reviewed` step before `granted`.

### Reject

At any step the admin can click "Reject" → `POST .../advance` body `{action: "reject"}` → ceremony terminates in `rejected_by_user`. The audit row records the rejection.

### Invalid action

Phase 5 + Phase 6 fix: anything other than `trust`/`reject`/`grant` returns HTTP 422 with `module.ceremony.rejected` audit row emitted by the global RequestValidationError handler. The UI does not need to surface this except as a generic "Something went wrong" — the audit-reconstruction view picks up bypass attempts.

## Audit emissions

| State transition | Audit row |
| --- | --- |
| `discovered` → `publisher_checked` | `module.publisher.checked` |
| `publisher_checked` → `permissions_reviewed` | `module.permissions.reviewed` |
| `permissions_reviewed` → `granted` | `module.grant.created` |
| `granted` → `enabled` | `module.enabled` |
| Any → `rejected_by_user` | `module.denied` |
| Pydantic-422 fall-through | `module.ceremony.rejected` |
| Invalid transition (e.g. grant from publisher_checked) | `module.ceremony.rejected` + 409 |

## Acceptance criteria

- [ ] Verified-publisher fast path completes in 4 advances.
- [ ] Unverified path walks 7 advances; UI labels which state is current.
- [ ] Reject button works at every step; subsequent advances 409.
- [ ] Grant action from a non-`granted` state returns 409 (Phase 5 R2 fix); ceremony state unchanged; UI shows "ceremony out of sequence".
- [ ] Each advance's audit row is visible in reconstruction.

## Not covered

- Manifest editing in the ceremony — admin uploads/pastes a finalised manifest; in-ceremony edits aren't supported.
- Multi-admin ceremony approval — Phase 13 ships single-admin; multi-party approval is Phase 15+.
