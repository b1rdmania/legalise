# Journey 12 — Admin role promotion

A superuser promotes another user's `role` (Phase 11).

## Preconditions

- Caller is `is_superuser=True`.
- Target user exists.

## Goal

The target user's `User.role` is set to the requested token; the change is audited; the target can now run modules on matters whose posture required the new role.

## Trigger

Superuser navigates to `/admin/users` → clicks a target row.

## Steps

1. **List users.**
   - System: `GET /api/admin/users` → array of `{id, email, role, is_superuser, ...}`.
   - UI shows a table: email, role, is_superuser, last_active.
2. **Open user detail.**
   - System: `GET /api/admin/users/{user_id}` → single user row.
3. **Pick new role.**
   - UI shows a dropdown locked to `{solicitor, qualified_solicitor, workspace_admin}` (Phase 11 vocabulary).
4. **Confirm + submit.**
   - System: `POST /api/admin/users/{user_id}/role` body `{role}` → 200 (or 200 no-op if same role).
   - Audit: `user.role.changed` with `from_role`, `to_role`, `target_user_id`, `actor_id=<superuser>`, `reason="manual_admin_action"`.
5. **UI refreshes.**
   - The user-list row reflects the new role.

## Permission gates this exercises

- **Admin-only** — non-superuser sees no `/admin` link AND the list endpoint returns 403 (when it lands).
- **Self-promotion forbidden** — Phase 11 returns 403 `self_promotion_forbidden` on `target_id == caller.id`. UI surfaces a banner; the dropdown is disabled when the row is the caller's own.
- **Locked vocabulary** — anything outside the three tokens returns 422 `invalid_role`.

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 1 | List users | none (read) |
| 2 | Open user detail | none (read) |
| 4 | Submit role change | `user.role.changed` (Phase 11) |
| 4 | No-op (same role) | none (Phase 11 idempotency) |
| 4 | Self-promote attempt | none (the 403 fires before any mutation) |

## Acceptance criteria

- [ ] Non-superuser cannot reach `/admin/users` (link hidden from top-nav; direct URL returns 403).
- [ ] Self-row's dropdown is disabled with an "use Phase 12 CLI" tooltip.
- [ ] Role change is reflected immediately in the user list.
- [ ] Reconstruction view shows the `user.role.changed` row with full from-to payload.
- [ ] After promotion, the target user can run modules on `B_mixed` matters (closes the demo-role gap Phase 11 named).

## Not covered

- Bulk promotion — out.
- Demotion off `is_superuser` — Phase 11 deliberately doesn't ship; off-boarding stays on direct DB.
- Audit-log surface for past role changes per user — `/audit/reconstruction` covers it (Phase 15+ may add a dedicated `/admin/users/{id}/audit` view).
- SRA roll verification on `qualified_solicitor` promotions — out.
