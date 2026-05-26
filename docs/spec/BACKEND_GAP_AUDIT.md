# Backend Gap Audit

Verified by reading the current substrate code as of `f03de48`. For each endpoint category the spec needs, names the file:line where it exists, or files it as a structured Phase 13b finding.

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

### Admin (Phase 11)

| Surface | Endpoint | Location |
| --- | --- | --- |
| Change role | `POST /api/admin/users/{user_id}/role` | `backend/app/api/admin_users.py:77` |

## Gap findings

Five real gaps the spec needs and the substrate doesn't ship today.

### Gap #1 — Artifact listing per matter

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

### Gap #2 — Artifact read

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

### Gap #3 — Admin user listing

**Expected:** `GET /api/admin/users` returning an array of user rows (id, email, role, is_superuser, created_at, last_active?).

**Verification:** `backend/app/api/admin_users.py` ships only the POST role endpoint at line 77. No GET defined.

**Used by:** Journey 12 (admin users page).

**Proposed shape:**
```
GET /api/admin/users
  → 200 [{id, email, role, is_superuser, ...}]
  → 403 admin_required (if caller not is_superuser)
```

### Gap #4 — Admin user detail

**Expected:** `GET /api/admin/users/{user_id}` for the per-user role-mutation page.

**Verification:** not registered.

**Used by:** Journey 12.

**Proposed shape:** parallel to Gap #3 but single-row.

### Gap #5 — First-run user count

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

## Phase 13b backlog (proposed)

Reviewer decides between (close now / defer / merge into Phase 14):

- **Phase 13b-A**: Gaps #1 + #2 (artifact endpoints) — small substrate phase, owner + tests; estimated ~2 days
- **Phase 13b-B**: Gaps #3 + #4 (admin user listing + detail) — small substrate phase, ~1 day
- **Phase 13b-C**: Gap #5 (first-run state endpoint) — tiny, ~0.5 days
- **Phase 13b-D**: Audit-shape verification pass — confirm what fastapi-users + settings + matter mutations emit; gap-fill where needed; estimated ~2 days

Total: 3 small substrate phases + 1 audit verification pass = ~5.5 days of substrate work between Phase 13 and Phase 14.

Alternatively: a single Phase 13b that bundles A + B + C + D, accepting all five gaps + the audit-verification pass as one ~5-day phase, then Phase 14 starts on a complete substrate.

Reviewer call.
