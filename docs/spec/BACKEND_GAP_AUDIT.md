# Backend Gap Audit (v3 — Phase 13b landed)

Verified by reading the current substrate code. For each endpoint category the spec needs, names the file:line where it exists.

**v3 patch:** every gap v2 flagged is now closed. Phase 13b Option B shipped all five endpoint gaps + the audit-shape gap-fill in one bundle. Phase 14 unblocked.

## Verification methodology

Phase 13 reads `backend/app/api/*.py` + the route registration in `backend/app/main.py`. An endpoint counts as present if its `@router.<method>(...)` decorator is on the canonical path + the router is mounted at the expected prefix.

## Present endpoints

### Auth + first-run

| Surface | Endpoint | Location |
| --- | --- | --- |
| Register | `POST /auth/register` | `backend/app/api/auth.py:31` (via fastapi-users) |
| Login | `POST /auth/login` | `backend/app/api/auth.py:28` (via fastapi-users) |
| Logout | `POST /auth/logout` | `backend/app/api/auth.py:28` (via fastapi-users) |
| Verify email | `POST /auth/verify` | `backend/app/api/auth.py:33` (via fastapi-users) |
| Forgot / reset password | `POST /auth/forgot-password`, `/reset-password` | `backend/app/api/auth.py:32` (via fastapi-users) |
| Self info | `GET /auth/users/me`, `PATCH /auth/users/me` | `backend/app/api/auth.py:34` (via fastapi-users) |
| Delete own account | `DELETE /auth/users/me` | `backend/app/api/account.py:29` |
| Bootstrap admin | CLI: `python -m app.tools.bootstrap_admin` | `backend/app/tools/bootstrap_admin.py` (Phase 12) |

### Settings / BYO keys

| Surface | Endpoint | Location |
| --- | --- | --- |
| List keys | `GET /api/settings/keys` | `backend/app/api/settings.py:50` |
| Add key | `POST /api/settings/keys` | `backend/app/api/settings.py:63` |
| Delete key | `DELETE /api/settings/keys/{provider}` | `backend/app/api/settings.py:77` |

### Matters

| Surface | Endpoint | Location |
| --- | --- | --- |
| List matters | `GET /api/matters` | `backend/app/api/matters.py:291` |
| Create matter | `POST /api/matters` | `backend/app/api/matters.py:245` |
| Open matter | `GET /api/matters/{slug}` | `backend/app/api/matters.py:305` |
| Upload document | `POST /api/matters/{slug}/documents` | `backend/app/api/matters.py:320` |
| List documents | `GET /api/matters/{slug}/documents` | `backend/app/api/matters.py:526` |
| Change posture | `PATCH /api/matters/{slug}/privilege` | `backend/app/api/matters.py:543` |
| Archive | `DELETE /api/matters/{slug}` | `backend/app/api/matters.py:964` |
| Document body | `GET /api/documents/{doc_id}/body` | `backend/app/api/documents.py:66` |

### Modules

| Surface | Endpoint | Location |
| --- | --- | --- |
| Public catalog | `GET /api/modules/public` | `backend/app/api/modules.py:281` |
| Workspace modules | `GET /api/modules` | `backend/app/api/modules.py:311` |
| v2 catalog | `GET /api/modules/v2` | `backend/app/api/modules.py:433` |
| v2 capabilities | `GET /api/modules/v2/capabilities` | `backend/app/api/modules.py:480` |
| v2 module detail | `GET /api/modules/v2/{module_id}` | `backend/app/api/modules.py:494` |
| Start install ceremony | `POST /api/modules/install` | `backend/app/api/modules.py:658` |
| Advance ceremony | `POST /api/modules/install/{ceremony_id}/advance` | `backend/app/api/modules.py:754` |
| Read ceremony state | `GET /api/modules/install/{ceremony_id}` | `backend/app/api/modules.py:832` |
| Update installed module | `POST /api/modules/{module_id}/update` | `backend/app/api/modules.py:895` |
| Revoke (disable) | `POST /api/modules/{module_id}/revoke` | `backend/app/api/modules.py:978` |

### Grants (Phase 7)

| Surface | Endpoint | Location |
| --- | --- | --- |
| POST | `POST /api/matters/{slug}/grants` | `backend/app/api/grants.py:125` |
| DELETE | `DELETE /api/matters/{slug}/grants/{grant_id}` | `backend/app/api/grants.py:228` |
| GET | `GET /api/matters/{slug}/grants` | `backend/app/api/grants.py:256` |

### Invocations (Phase 10)

| Surface | Endpoint | Location |
| --- | --- | --- |
| POST | `POST /api/matters/{slug}/invocations` | `backend/app/api/invocations.py:115` |

### Audit / reconstruction (Phase 5)

| Surface | Endpoint | Location |
| --- | --- | --- |
| Reconstruction | `GET /api/matters/{slug}/audit/reconstruction` | `backend/app/api/audit.py:108` |
| Legacy audit feed | `GET /api/matters/{slug}/audit` | `backend/app/api/matters.py:937` |

### Admin (Phase 11 + 13b B)

| Surface | Endpoint | Location |
| --- | --- | --- |
| List users | `GET /api/admin/users` (superuser-only, `role=` + `is_superuser=` filters) | `backend/app/api/admin_users.py` Phase 13b B |
| User detail | `GET /api/admin/users/{user_id}` (superuser-only) | `backend/app/api/admin_users.py` Phase 13b B |
| Change role | `POST /api/admin/users/{user_id}/role` | `backend/app/api/admin_users.py:77` |

### Artifacts (Phase 13b A)

| Surface | Endpoint | Location |
| --- | --- | --- |
| List artifacts | `GET /api/matters/{slug}/artifacts` | `backend/app/api/artifacts.py:111` |
| Read artifact | `GET /api/matters/{slug}/artifacts/{id}` | `backend/app/api/artifacts.py:136` |

### System (Phase 13b C)

| Surface | Endpoint | Location |
| --- | --- | --- |
| Bootstrap state | `GET /api/system/bootstrap-state` (no auth) | `backend/app/api/system.py` |

## Phase 13b — closed gaps

All five v2 endpoint gaps closed; audit-shape gap-fill complete.

## Phase 14 findings

Phase 14 B surfaced one gap. Not blocking the sub-step — frontend ships without the at-a-glance indicator and Reviewer decides whether to fill before Phase 14 D depends on it.

### Finding 14-B-#1 — no listing of installed modules

**Expected:** an authenticated endpoint returning `[{module_id, installed_version, publisher, enabled, ...}]` so the `/modules` catalog page can render "Installed vX.Y" / "Available" badges per module without N+1 requests.

**Verification:** `grep -rn "InstalledModule" backend/app/api/*.py` shows `select(InstalledModule)` in `grants.py`, `invocations.py`, `modules.py` revoke + update — every call site filters by a known `module_id`. No listing endpoint.

**Used by:** Phase 14 B catalog. Without it the catalog lists discovered modules but cannot surface "installed" vs "available" status. The detail page (`/modules/{id}`) avoids the gap because admins click Update / Revoke and surface 404 errors inline.

**Proposed shape (two options for Reviewer):**

Option A — new endpoint:
```
GET /api/modules/installed
  → 200 [{module_id, version, publisher, enabled, installed_at, installed_by_user_id}]
  → 401 if anon
```

Option B — augment V2ManifestEntry:
```
class V2ManifestEntry:
    ...
    installed_version: str | None      # set if a corresponding InstalledModule row exists
    installed_enabled: bool             # the row's enabled flag
```

Either lets the catalog render without N+1. B is fewer LOC backend but couples v2-discovery to install-state queries; A keeps surfaces orthogonal.

**Status:** filed Phase 14 B (frontend ships catalog without installed-status badges; UX degrades gracefully — "Open" is the affordance on every card). Phase 14 D may depend on this for invocation-ready check; revisit there if not closed first.

### Finding 14-B-#2 — no global / workspace-scoped audit reconstruction surface

**Expected:** a reconstruction view that surfaces workspace-scoped audit rows (ceremony events, settings key operations, admin role mutations) — i.e. events that are not bound to a specific matter and therefore don't appear in `GET /api/matters/{slug}/audit/reconstruction`.

**Verification:** the only reconstruction endpoint is `GET /api/matters/{slug}/audit/reconstruction` (`backend/app/api/audit.py:108`), matter-scoped by design. Phase 14 B emits `module.ceremony.rejected` from the substrate when an invalid transition is requested; the UI surfaces a banner naming that row but cannot deep-link to a reconstruction view that doesn't exist.

**Used by:** Phase 14 B trust-ceremony invalid-transition banner; Phase 14 G settings + admin pages would benefit too.

**Proposed shape:** either
- new endpoint `GET /api/admin/audit/reconstruction` (superuser-only) returning workspace-scoped rows with the same shape as the matter endpoint; OR
- a `scope=workspace` query param on the existing reconstruction endpoint (admin-only) that returns rows where `matter_id IS NULL`.

**Status:** filed Phase 14 B. Frontend banner ships without a deep-link (P1 redline fix). When this lands, the InstallCeremony invalid-transition banner can carry a real link without churn.

### Finding 14-E-#1 — no server-side filter for `invocation_id` / `action` on reconstruction

**Expected:** `GET /api/matters/{slug}/audit/reconstruction` accepts `invocation_id=<id>` and/or `action=<string>` as query params so the substrate returns only matching rows. Today only `since`, `until`, `include`, `cursor`, `limit` are honoured (`backend/app/api/audit.py:108`).

**Used by:** Phase 14 E reconstruction page. Every Phase 14 sub-step pins deep-links to `/matters/{slug}/audit?invocation_id=…` or `?action=…`; the frontend filters client-side as a fallback.

**Why a substrate-side filter matters:** client-side filtering is correct *within the loaded window*, but misses rows that haven't been paged in yet. A user deep-linking to a single `invocation_id` may see "0 rows" until they click "Load more" through enough pages to reach the row's `occurred_at`. For dense matter timelines this is a real UX hole.

**Proposed shape:**
```
GET /api/matters/{slug}/audit/reconstruction
  ?invocation_id=<uuid>           # match payload.invocation_id OR refs.invocation_id
  &action=<string>                # exact match on action column
  &since=…&until=…&include=…&cursor=…&limit=…
```

Backwards-compatible — both params optional. Implementation lives in `app.core.audit_reconstruction.reconstruct` since it already filters by `since/until/include`; the new filters compose with the existing ones.

**Status:** filed Phase 14 E. Frontend ships client-side filtering as the fallback per the established pattern (POSTURE_GATE_UX.md flagged the same concern in advance). The chip + clear-link UX is identical regardless of where the filter is applied; if the substrate adds the param later, the frontend can swap to server-side without churn.

Five real gaps the spec needs and the substrate doesn't ship today.

### Gap #1 — Artifact listing per matter (CLOSED — Phase 13b A)

**Expected:** `GET /api/matters/{slug}/artifacts` returning an array of `MatterArtifact` rows (id, module_id, capability_id, invocation_id, kind, created_at, size_bytes).

**Verification:** `grep -rn "artifacts" backend/app/api/` returned no matches. Not registered.

**Used by:** Journey 04 (matter workspace artifacts panel), Journey 10 (artifact list page).

**Proposed shape:**
```
GET /api/matters/{slug}/artifacts
  → 200 [{id, matter_id, module_id, capability_id, invocation_id, kind, storage_path?, created_at, size_bytes}]
  → 404 (uniform matter-access)
```

Authorisation: matter owner + superuser (Phase 5/7 shape).

### Gap #2 — Artifact read (CLOSED — Phase 13b A)

**Expected:** `GET /api/matters/{slug}/artifacts/{artifact_id}` returning the row + parsed JSON payload.

**Verification:** same grep above. Not registered.

**Used by:** Journey 10 (artifact detail page).

**Proposed shape:**
```
GET /api/matters/{slug}/artifacts/{artifact_id}
  → 200 {id, ..., payload: <parsed json>}
  → 404 (matter-access OR artifact-not-found, uniform)
```

Open question for Reviewer: does reading a privileged artifact audit? See `AUDIT_EMISSION_MAP.md` open question.

### Gap #3 — Admin user listing (CLOSED — Phase 13b B)

**Expected:** `GET /api/admin/users` returning an array of user rows (id, email, role, is_superuser, created_at, last_active?).

**Verification:** `backend/app/api/admin_users.py` ships only the POST role endpoint at line 77. No GET defined.

**Used by:** Journey 12 (admin users page).

**Proposed shape:**
```
GET /api/admin/users
  → 200 [{id, email, role, is_superuser, ...}]
  → 403 admin_required (if caller not is_superuser)
```

### Gap #4 — Admin user detail (CLOSED — Phase 13b B)

**Expected:** `GET /api/admin/users/{user_id}` for the per-user role-mutation page.

**Verification:** not registered.

**Used by:** Journey 12.

**Proposed shape:** parallel to Gap #3 but single-row.

### Gap #5 — First-run user count (CLOSED — Phase 13b C)

**Expected:** `GET /api/admin/users/count` (or `GET /api/system/state`) returning `{user_count, has_superuser}`.

**Verification:** not registered.

**Used by:** Journey 00 (first-run detection — the app needs to know when to show "register first account" vs the normal login flow).

**Proposed shape:**
```
GET /api/system/bootstrap-state
  → 200 {user_count: int, has_superuser: bool}
  → no auth required (it's the gate to the first auth flow)
```

Without this endpoint the SPA has no way to distinguish "fresh fork" from "you're not logged in" — it always shows the login form. Phase 13b might inline this into the SPA's static build (hardcoded `first_run=true` at build time) but that's a hack.

## Open audit-shape questions

Beyond the missing endpoints, the audit-emission map flags these as "verify shape":

1. **fastapi-users emissions** — whether register, login, logout, verify, password-reset emit canonical audit rows. Substrate uses fastapi-users which may or may not stamp.
2. **Settings key operations** — whether add/rotate/remove emit audit rows.
3. **Matter mutations** — whether create, upload-doc, change-posture emit canonical rows.
4. **Artifact write** — Phase 9 follow-up confirmed `write_artifact` emits no audit row. Open whether to add one (`artifact.created`) in Phase 13b or leave reconstruction relying on `module.capability.completed.payload.{motion_artifact_id, evidence_artifact_id}`.

## Phase 13b — Option B (Reviewer ratified)

**Bundled. One phase. All five endpoint gaps + the audit-shape gap-fill, before Phase 14 starts.**

### Sub-step ledger

- **Phase 13b A** — Gaps #1 + #2 (artifact endpoints) — ~2 days
  - `GET /api/matters/{slug}/artifacts`
  - `GET /api/matters/{slug}/artifacts/{id}`
  - Matter-access predicate (Phase 5/7 shape)
  - Reviewer call: does artifact read audit? Default: no audit on read

- **Phase 13b B** — Gaps #3 + #4 (admin user list + detail) — ~1 day
  - `GET /api/admin/users` (superuser-only)
  - `GET /api/admin/users/{user_id}` (superuser-only)
  - Returns email, role, is_superuser, created_at — no plaintext keys

- **Phase 13b C** — Gap #5 (first-run state endpoint) — ~0.5 days
  - `GET /api/system/bootstrap-state` → `{user_count, has_superuser}`
  - No auth required (gate to the first auth flow)

- **Phase 13b D** — Audit-shape gap-fill — ~2 days (substantive, not just verification)
  - Add canonical audit rows to the auth flow: `auth.user.registered`, `auth.user.verified`, `auth.user.logged_in`, `auth.user.logged_out`, `auth.user.password_reset_requested`, `auth.user.password_reset_completed`. The substrate currently emits only structured log lines; Phase 13b D converts them to `audit_entries` rows.
  - Add canonical audit rows to settings key operations: `user.key.configured`, `user.key.revoked`. Security-sensitive; the substrate emits nothing today.
  - Verify Phase 4 module update + revoke emissions (`POST /api/modules/{id}/update`, `POST /api/modules/{id}/revoke`); gap-fill if missing.
  - Decide + implement `auth.user.demo_seeded` and `auth.user.capabilities_auto_granted` audit rows if Reviewer wants them in reconstruction. Default: yes, demo seed is matter-creating and should audit.

### Total scope

~5.5 days of substrate work. Phase 14 starts only when all four sub-steps land.

### Why Option B over Option A or C

- **Option A (three small phases):** sequential delivery means Phase 14 keeps stalling. The substrate ships once, fully.
- **Option C (merge into Phase 14):** couples frontend timeline to backend findings. Phase 14 needs a stable substrate to build against; discovering audit gaps during the frontend phase derails both.
- **Option B:** one focused substrate phase, one ratification cycle, then a clean frontend phase against a complete substrate. Reviewer-preferred.

### Out of scope for Phase 13b

- Sigstore real verification — Phase 11 placeholder; deferred
- Workspace-broad grant endpoint — `POST /api/workspace/grants` reserved; no caller needs it yet
- Bulk endpoints — out
- Async runtime — still parked
- New reference module — Pre-Motion already proved reusability
