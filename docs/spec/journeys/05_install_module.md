# Journey 05 — Install a module

Admin installs Contract Review (or Pre-Motion) from the modules catalog into the workspace.

## Preconditions

- User authenticated; `is_superuser=True` (Phase 3 install gate).
- The module's manifest is discoverable from the catalog OR pasted in.

## Goal

The selected module is in the `installed_modules` table with `signature_status='verified'`, `enabled=true`, ready for matter-scoped grants (Journey 07).

## Trigger

Superuser clicks "Install" on a module's detail page (`/modules/{module_id}`) OR pastes a manifest into `/modules/install`.

## Steps

1. **Browse catalog.**
   - System: `GET /api/modules/v2` → list of discoverable manifests.
2. **Select module.**
   - System: `GET /api/modules/v2/{module_id}` → manifest detail; "Install" button shown if not already installed.
3. **Start ceremony.**
   - System: `POST /api/modules/install` body `{source: "registry"|"manifest", module_id?, manifest?}` → 201 with `{ceremony_id, state, permission_card}`.
   - Audit: trust ceremony's first audit row lands (substrate).
4. **Trust ceremony.** (see Journey 06 for detail)
   - For verified-publisher modules: 3 × `trust` advances then 1 × `grant`.
   - Each advance: `POST /api/modules/install/{ceremony_id}/advance` body `{action: "trust"|"grant"|"reject"}`.
5. **Install commits.**
   - After the final `grant` action, `InstalledModule` row written; ceremony reaches `enabled` state.
   - Audit: `module.installed`.
6. **Redirect.**
   - UI redirects to `/modules/{module_id}` showing the installed-version state.

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 3 | Start ceremony | `module.discovered` |
| 4 | Each advance | `module.publisher.checked`, `module.permissions.reviewed`, `module.grant.created`, `module.enabled` (canonical Phase 3 chain) |
| 4 | Rejected action | `module.ceremony.rejected` (Phase 5 carry-over) |
| 5 | Install complete | `module.installed` |

## Acceptance criteria

- [ ] Non-superuser sees no "Install" button (and `POST /api/modules/install` returns 403 if attempted).
- [ ] Ceremony state visibly progresses through the 4 advances.
- [ ] Invalid manifest returns structured 422 with the validator errors.
- [ ] Dependency-unsatisfied (Phase 4) returns structured 422 with the resolution detail.
- [ ] Successful install lands all canonical audit rows; reconstruction picks them up.

## Not covered

- Disable / uninstall — Phase 4 `/api/modules/{id}/revoke` exists but Phase 13 doesn't spec the UX yet.
- Update an installed module to a new version — Phase 4 endpoint exists; UX deferred.
- Browse a remote module registry over HTTP — catalog is local-only today.
