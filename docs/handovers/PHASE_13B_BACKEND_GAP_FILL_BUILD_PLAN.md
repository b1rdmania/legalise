# Phase 13b Build Plan — Backend Gap Fill (Bundled)

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `598ce75` (Phase 13 v2 ratified; sweep 676/8)
**Goal:** Close every backend gap the Phase 13 product spec surfaced, in one bundled substrate phase, so Phase 14 starts against a complete substrate instead of a partly imagined one.

Phase 13b is **strictly substrate work**. It is the last backend phase before frontend.

---

## Hard rules (per Reviewer)

Phase 13b MUST NOT:

- Introduce any frontend code
- Introduce new substrate concepts not already named in the Phase 13 spec
- Unpark async, jobs, streaming, or any deferred Phase 7+ work
- Introduce UI-specific abstractions (no "view models", no presentation-shaped DTOs)
- Add new vocabulary beyond what `AUDIT_EMISSION_MAP.md` v2 names
- Extend matter/module/grant primitives — only fill gaps

Phase 13b MUST:

- Close the five endpoint gaps named in `BACKEND_GAP_AUDIT.md` v2
- Add the audit rows named as **GAP** in `AUDIT_EMISSION_MAP.md` v2
- Update the spec markdown files after implementation so they reflect reality
- Run the full backend sweep green before handover

---

## Scope

**In — five gap closures:**

1. Artifact list + read endpoints (Phase 13b A)
2. Admin user list + detail endpoints (Phase 13b B)
3. Bootstrap-state endpoint (Phase 13b C)
4. Audit gap-fill (Phase 13b D)
5. Spec markdown reflow after implementation (Phase 13b E)

**Out (intentional):**

- Sigstore real verification (Phase 11 placeholder; still deferred)
- Workspace-broad grant endpoint (`POST /api/workspace/grants` reserved; no caller)
- Bulk endpoints
- Async runtime / jobs / streaming
- New reference modules (Pre-Motion already proved reusability)
- Frontend anything
- Component library / route library / UI tooling
- Hot reload / module sandbox extensions
- Cross-workspace concerns
- SRA roll verification on `qualified_solicitor`

---

## Architectural decisions

### Decision #1 — Artifact reads do NOT emit an audit row

The spec's open question from Phase 13: should reading a privileged artifact audit?

**Locked: NO.** Reasons:

- Reads aren't load-bearing state changes. The supervised-autonomy claim is about what got CREATED, not who LOOKED at it.
- Navigating to the artifact via the workspace already emits `audit.reconstruction.viewed` (Phase 5) when the user clicks through the audit trail to find it.
- A read-audit row per artifact view would balloon the audit log with low-signal events. Phase 9's empirical Pre-Motion run already produced two artifacts; a busy week could produce hundreds.
- If a future regulator legitimately needs read-tracking, it lands as a Phase 14+ feature with consent/disclosure UX, not as a silent server-side row.

If Reviewer wants this changed, it lands as a separate phase with explicit posture-aware logic (do we audit `B_mixed` reads but not `A_cleared`?).

### Decision #2 — Admin user endpoints do NOT return password hashes

Self-evident, but worth pinning. The `User` model carries `hashed_password`, `verification_token`, `reset_password_token` — none of those leave the server. The endpoints return a typed `UserAdminRead` DTO with `id`, `email`, `role`, `is_superuser`, `is_active`, `is_verified`, `name`, `created_at`. No tokens. No hashes.

### Decision #3 — Bootstrap-state endpoint is open (no auth)

`GET /api/system/bootstrap-state` returns `{user_count, has_superuser}`. No authentication required — it's the gate to the first-auth flow; an unauthenticated client must be able to call it to know whether registration is open.

The response carries zero sensitive data — just two integers/booleans. A malicious caller learns "this Legalise has N users" and "this Legalise has at least one admin". That's the same information visible from any failed login attempt; not a leak worth gating.

### Decision #4 — Auth audit rows match the existing canonical convention

Eight rows added, all under `auth.*` namespace, all written via `audit.log` from inside the relevant fastapi-users hooks or the post-action handlers:

| Action | Row | Payload |
| --- | --- | --- |
| Register | `auth.user.registered` | `{user_id, email}` |
| Verify email | `auth.user.verified` | `{user_id}` |
| Log in | `auth.user.logged_in` | `{user_id}` |
| Log out | `auth.user.logged_out` | `{user_id}` |
| Password reset requested | `auth.user.password_reset_requested` | `{user_id, requested_at}` |
| Password reset completed | `auth.user.password_reset_completed` | `{user_id}` |
| Profile updated | `auth.user.profile_updated` | `{user_id, fields_changed: [...]}` |
| Demo matter seeded | `auth.user.demo_seeded` | `{user_id, matter_slug}` |
| Capabilities auto-granted | `auth.user.capabilities_auto_granted` | `{user_id, triple_count}` |

`actor_id` is the user themselves for self-actions; `None` for system actions (demo seed, auto-grant). `matter_id` is set for `demo_seeded` only.

### Decision #5 — BYO key audit shape

Two rows:

| Action | Row | Payload |
| --- | --- | --- |
| Configure | `user.key.configured` | `{provider, action: "added"|"rotated"}` (never the key bytes) |
| Revoke | `user.key.revoked` | `{provider}` |

`actor_id` is the user. The `provider` field uses the canonical name from the existing `_KEYED_PROVIDERS` set.

### Decision #6 — Module update/revoke audit verification, fill if missing

Phase 4 endpoints exist at `/api/modules/{id}/update` and `/api/modules/{id}/revoke`. Phase 13b D:

1. Read the implementation; identify what (if any) audit rows emit
2. If missing canonical rows, add: `module.updated` (with version from-to) and `module.disabled`
3. Confirm Phase 4 matter-archive cascade already emits `module.grant.revoked` per cascaded row (it does, but write a regression test if the existing test doesn't cover this assertion)

### Decision #7 — Spec reflow is part of the deliverable

After implementation, the Phase 13b E step rewrites the affected spec files to reflect reality:

- `docs/spec/AUDIT_EMISSION_MAP.md`: every GAP → VERIFIED with file:line refs
- `docs/spec/BACKEND_GAP_AUDIT.md`: every gap → "closed at <commit>"
- `docs/spec/journeys/00_first_run.md`: replace the `GET /api/admin/users/count` placeholder with the actual bootstrap-state endpoint
- `docs/spec/journeys/04_open_khan.md`, `10_inspect_artifacts.md`: drop the ★ markers; update API call references
- `docs/spec/journeys/12_admin_role_promotion.md`: drop the ★ markers

The spec is part of the deliverable, not an afterthought. Phase 14 inherits a consistent spec.

---

## Critical path

```
Step 1: Phase 13b A — artifact endpoints + tests
   ↓
Step 2: Phase 13b B — admin user list/detail + tests
   ↓
Step 3: Phase 13b C — bootstrap-state endpoint + tests
   ↓
Step 4: Phase 13b D — audit gap-fill (auth + keys + module update/revoke verification)
   ↓
Step 5: Phase 13b E — spec markdown reflow (no code; reflects implementation)
   ↓
Step 6: Full backend sweep green
   ↓
Step 7: HANDOVER_PHASE_13B_BACKEND_GAP_FILL_DONE.md
```

~5.5 days. ~30 new tests. Target sweep ~706 passed.

---

## Step 1 — Artifact endpoints (Phase 13b A)

**Files:**
- `backend/app/api/artifacts.py` (new) — both endpoints in one router
- `backend/app/main.py` — register router at `/api/matters` prefix (same pattern as Phase 5 audit + Phase 7 grants)
- `backend/tests/test_phase13b_artifacts_api.py` (new) — ~6 tests

### `GET /api/matters/{slug}/artifacts`

Returns an array of artifact summaries:

```json
[
  {
    "id": "<uuid>",
    "matter_id": "<uuid>",
    "module_id": "examples.contract-review",
    "capability_id": "review",
    "invocation_id": "<uuid>",
    "kind": "findings_pack",
    "created_by_id": "<uuid>",
    "created_at": "2026-05-26T10:00:00Z",
    "size_bytes": 1234
  }
]
```

Sorted by `created_at DESC`. No payload returned at the list endpoint.

### `GET /api/matters/{slug}/artifacts/{artifact_id}`

Returns the same shape plus a `payload` field — the parsed JSON of the file on disk.

Resolution: the endpoint loads the row, opens `MatterArtifact.storage_path`, parses as JSON (the file is always JSON per Phase 6's `write_artifact` contract). 500 if the file is missing on disk (filesystem integrity failure).

### Authorisation (both)

Strict matter-access predicate — owner OR superuser; uniform 404 cross-user. Same `_load_matter_or_404` shape as Phase 5 + Phase 7.

### Tests (~6)

- happy path: list returns N rows in created_at-desc order
- happy path: read returns payload + metadata
- non-owner: 404 uniform (cross-user)
- archived matter: 404
- artifact id not in this matter: 404 (defence-in-depth even though FK already enforces)
- storage file missing on disk: 500 with structured error (rare ops case)

Per Decision #1: NO `module.artifact.read` audit row is emitted by either endpoint.

---

## Step 2 — Admin user list + detail (Phase 13b B)

**Files:**
- `backend/app/api/admin_users.py` — extend with two GET endpoints
- `backend/tests/test_phase13b_admin_users_listing.py` (new) — ~5 tests

### `GET /api/admin/users`

Superuser-only. Returns array of `UserAdminRead`:

```json
[
  {
    "id": "<uuid>",
    "email": "alice@example.com",
    "role": "qualified_solicitor",
    "is_superuser": false,
    "is_active": true,
    "is_verified": true,
    "name": "Alice",
    "created_at": "2026-05-26T10:00:00Z"
  }
]
```

Sorted by `created_at DESC`. No password hashes, no tokens.

Optional query params (small KISS slice):
- `?role=<token>` — filter by role
- `?is_superuser=true` — filter to superusers only

No pagination in Phase 13b (~unlikely to have >100 users in a single workspace; Phase 14+ adds if needed).

### `GET /api/admin/users/{user_id}`

Same shape as a list element. 404 on unknown user; 403 on non-admin caller (same shape as the existing POST role endpoint).

### Tests (~5)

- happy path: list returns all users
- happy path: detail returns single user
- non-admin: 403 admin_required (both endpoints)
- target missing: 404 on detail
- role filter: only matching rows returned
- DTO does not leak password hash / tokens

No audit rows on either endpoint (reads).

---

## Step 3 — Bootstrap-state endpoint (Phase 13b C)

**Files:**
- `backend/app/api/system.py` (new) — single endpoint
- `backend/app/main.py` — register router at `/api/system`
- `backend/tests/test_phase13b_bootstrap_state.py` (new) — ~3 tests

### `GET /api/system/bootstrap-state`

No authentication. Returns:

```json
{
  "user_count": 0,
  "has_superuser": false
}
```

Used by the SPA's first-run detection (Journey 00 Step 1).

### Tests (~3)

- fresh DB: `{user_count: 0, has_superuser: false}`
- after first register, no superuser: `{user_count: 1, has_superuser: false}`
- after bootstrap CLI: `{user_count: 1, has_superuser: true}`

No audit rows (read endpoint).

---

## Step 4 — Audit gap-fill (Phase 13b D)

This is the substantive step. Eight auth rows + two settings rows + module update/revoke verification.

### Files

- `backend/app/core/auth.py` — extend the existing `on_after_register`, `on_after_verify`, `on_after_login`, `on_after_logout`, `on_after_request_verify`, `on_after_forgot_password`, `on_after_reset_password` hooks with `audit.log` calls
- `backend/app/api/settings.py` — extend the existing POST + DELETE endpoints with `audit.log` calls
- `backend/app/api/modules.py` — verify update + revoke emissions; add canonical rows if missing
- `backend/tests/test_phase13b_audit_gap_fill.py` (new) — ~10 tests covering each new row

### Auth rows (8 implementations)

Wrap the existing fastapi-users hooks. Each hook gets one `audit.log` call:

```python
async def on_after_register(self, user: User, request: Request | None = None):
    logger.info("auth.user.registered", user_id=str(user.id))
    async with self._session_factory() as session:
        await audit.log(
            session,
            "auth.user.registered",
            actor_id=user.id,
            module="core.auth",
            resource_type="user",
            resource_id=str(user.id),
            payload={"email": user.email},
        )
        await session.commit()
    # ... existing demo-seed + auto-grant work continues
```

Same shape for each of the 7 fastapi-users hooks + the demo-seed + auto-grant emissions (which are in the same `on_after_register` flow).

Two of the rows are system-acting (no user actor): `demo_seeded` and `capabilities_auto_granted`. Those use `actor_id=None`.

### BYO key rows (2 implementations)

`backend/app/api/settings.py` — extend POST + DELETE:

```python
@router.post("/keys", ...)
async def add_key(...):
    # ... existing encryption + upsert work
    await audit.log(
        session,
        "user.key.configured",
        actor_id=user.id,
        module="core.settings",
        resource_type="user_api_key",
        resource_id=str(row.id),
        payload={"provider": body.provider, "action": "added" if is_new else "rotated"},
    )
    await session.commit()
```

Same shape for DELETE → `user.key.revoked`.

### Module update/revoke verification

Two endpoints already exist (Phase 4 at `backend/app/api/modules.py`). Verify their audit-row emission by reading the code:

- If they already emit canonical rows: write regression tests pinning the action names + payloads
- If they don't: add `module.updated` (Phase 4 expansion path) + `module.disabled` (revoke path)

The Phase 4 matter-archive cascade already emits `module.grant.revoked`; the existing test_phase4 covers that.

### Tests (~10)

One test per new audit row:

1. Register → `auth.user.registered` lands with `actor_id=user.id`
2. Verify email → `auth.user.verified` lands
3. Log in → `auth.user.logged_in` lands
4. Log out → `auth.user.logged_out` lands
5. Forgot password → `auth.user.password_reset_requested` lands
6. Reset password → `auth.user.password_reset_completed` lands
7. Update profile → `auth.user.profile_updated` lands with `fields_changed`
8. First register seeds demo → `auth.user.demo_seeded` lands with `matter_slug`
9. First register grants capabilities → `auth.user.capabilities_auto_granted` lands with `triple_count`
10. Add provider key → `user.key.configured` lands; rotate produces a second row with `action: "rotated"`; remove produces `user.key.revoked`

Plus 2 module verification tests:

11. Module update lands `module.updated`
12. Module revoke lands `module.disabled` + cascaded `module.grant.revoked`

---

## Step 5 — Spec markdown reflow (Phase 13b E)

After Steps 1-4 land, rewrite the affected spec files. **No code; markdown only.**

### `docs/spec/AUDIT_EMISSION_MAP.md`

- Flip every GAP → VERIFIED with file:line of the new emission site
- Remove the "Substrate finding" paragraphs from sections where the gap is now closed
- Update the "Phase 13b D scope" section to "Phase 13b D complete at <commit>"

### `docs/spec/BACKEND_GAP_AUDIT.md`

- For each gap (#1 through #5), add a "Closed at <commit>" note + file:line
- Strip the "Option B sub-step ledger" since it's now historical
- Add a "Post-Phase-13b state" section confirming the substrate is complete

### `docs/spec/journeys/`

- `00_first_run.md` — replace `GET /api/admin/users/count ★` with `GET /api/system/bootstrap-state` (no ★)
- `04_open_khan.md` — drop the ★ on `GET /api/matters/{slug}/artifacts`
- `10_inspect_artifacts.md` — drop the ★ markers on both artifact endpoints
- `12_admin_role_promotion.md` — drop the ★ on `GET /api/admin/users` + `GET /api/admin/users/{id}`

### `docs/spec/PAGE_MAP.md`

- Drop the ★ markers from the four route rows where the gap is now closed

The spec must reflect substrate reality. Phase 14 inherits a clean spec.

---

## Step 6 — Full backend sweep

- Phase 13b only: ~30 new tests (6 artifacts + 5 admin + 3 bootstrap + 12 audit gap-fill + 4 spec-consistency checks if needed)
- Phases 1-13b combined: ~706 tests
- Entire backend stays green

If any new emission breaks an existing audit-reconstruction test (e.g. a test that asserts the exact count of rows for a matter), update the test to match the new shape — but flag any such update in the handover so Reviewer can confirm the test wasn't over-asserting.

---

## Step 7 — Handover

`HANDOVER_PHASE_13B_BACKEND_GAP_FILL_DONE.md` covers:

- Seven architectural decisions for Reviewer ratification
- File-level audit of what shipped (5 endpoints + 10-12 audit-emission additions)
- Spec markdown reflow summary
- Phase 14 entry point: substrate is complete; the spec is the source of truth
- Hand-off line for Reviewer

---

## Out of scope (strict)

Per Reviewer's hard rules:

- Frontend anything
- New substrate concepts (matter sub-types, capability tiers, posture extensions, role tokens)
- Async / job queue / streaming / cancellation
- UI-specific DTO shapes (view models)
- New audit-action vocabulary beyond what `AUDIT_EMISSION_MAP.md` v2 names
- Sigstore real verification (Phase 11 placeholder)
- Workspace-broad grant endpoint
- Cross-workspace concerns
- SRA roll verification
- Bulk endpoints
- New reference modules
- Hot reload
- Module sandbox extensions
- New gates (posture extensions, advice-tier extensions)

If something in this list creeps in during build, push back. Phase 13b is **gap closure only**.

---

## Acceptance criteria

Phase 13b is "done" when:

- [ ] All 5 endpoint gaps closed with tests + audit rows where applicable
- [ ] All 10-12 audit-row gaps closed with tests
- [ ] All 4 spec markdown files updated to reflect reality
- [ ] Full backend sweep green (~706 passed expected)
- [ ] Zero frontend code added
- [ ] Zero new substrate concepts introduced
- [ ] Handover doc with the seven decisions

Phase 14 starts on Phase 13b ratification.

---

*End of Phase 13b build plan. Builder commits this, then waits for Reviewer ratification before Step 1.*
