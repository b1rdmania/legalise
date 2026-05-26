# Journey 07 — Grant module permissions on a matter

Per-user, matter-scoped grant flow that Phase 7 ships.

## Preconditions

- Module installed (Journey 05); `installed_modules.enabled=True`.
- User authenticated; user owns the matter OR is `is_superuser`.

## Goal

The user has matter-scoped grants for every capability they want to invoke on this matter. After the grant lands, `require_capability(matter_id=matter.id)` accepts.

## Trigger

User clicks "Enable Contract Review on this matter" from the matter workspace's module panel.

## Steps

1. **Module not yet granted (initial state).**
   - System: `GET /api/matters/{slug}/grants` → array (empty for this module).
   - Workspace shows "Contract Review (not yet enabled)" with a CTA.
2. **Click "Enable".**
   - System: `POST /api/matters/{slug}/grants` body `{module_id, capability_id}` → 201 on first call OR 200 on idempotent no-op.
   - Response body: `{matter_id, parent_capability_id, module_id, grants: [...], was_idempotent_noop}`.
   - The grants array carries one row per declared `reads` + `writes` capability string (e.g. `matter.document.read` + `matter.artifact.write`).
3. **UI updates.**
   - Module panel re-renders as "Enabled" with a "Disable" CTA.
4. **(Optional) revoke.**
   - User clicks "Disable" → confirm dialog → `DELETE /api/matters/{slug}/grants/{grant_id}` per row → 204.
   - Module panel re-renders as "Not enabled".

## Permission gates this exercises

- **Owner-or-superuser predicate** — non-owners get 404 (uniform; Phase 7 invariant).
- **Module enabled** — if `installed_modules.enabled=False`, returns 409 `module_disabled` (Phase 7 Decision #3).
- **Scope check** — if the capability is workspace-scope, returns 422 `capability_scope_not_supported_here` (Phase 7 Decision #5).
- **Idempotent no-op** — second identical POST returns 200 with `was_idempotent_noop=True`; no `module.grant.created` audit row (Phase 7 Decision #4).

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 2 | First grant | one `module.grant.created` per row written |
| 2 | Idempotent re-grant | none (Phase 7 Decision #4) |
| 4 | Revoke | one `module.grant.revoked` per row deleted |

## Acceptance criteria

- [ ] Owner sees the "Enable" CTA; non-owner gets 404 cleanly.
- [ ] First grant emits N audit rows (one per capability string).
- [ ] Second click on "Enable" without changes returns 200, zero audit, no UI flicker.
- [ ] "Disable" revokes all matter-scoped grants for this `(user, module, capability_id)` triple.
- [ ] After revoke, subsequent invocation returns 403 `capability_denied`.

## Not covered

- Cross-user grants (admin grants to another user) — Phase 8+; not in v2.
- Bulk grant a module's capabilities + a matter's all-modules — out.
- Grant audit-history endpoint per matter — `/audit/reconstruction` covers it.
- Workspace-scope grants — `POST /api/workspace/grants` reserved for future; not in v2.
