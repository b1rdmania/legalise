# Phase 11 Build Plan — Admin Role Management

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `19c7cdc` (Phase 10 follow-ups; sweep 659/8)
**Goal:** Close the role-promotion gap Phase 8 flagged. Today a superuser can only promote another user via direct DB mutation (the vertical-slice test does this; a real admin can't). One small endpoint closes it.

KISS rule per Andy's redirect: this phase is **just the admin promote endpoint**. No seed-time signup hook, no env-gated bulk promotion, no auto-promotion at registration. If hosted-demo automation needs solicitor accounts pre-seeded, that becomes a separate explicit setup command later — not a slip-stream into normal registration.

---

## Scope (deliberately tiny)

**In:**
- `POST /api/admin/users/{user_id}/role` — superuser-only, body `{role}`
- Role vocabulary locked to the three tokens already in use: `solicitor` (default), `qualified_solicitor`, `workspace_admin`
- Self-promotion forbidden (the caller cannot promote their own account)
- Audit row `user.role.changed`
- 7 tests (the list below)

**Out (parked, KISS):**
- Seed-time signup hook for auto-promotion — separate explicit setup command if a real hosted-demo need surfaces
- Role demotion to `solicitor` works through the same endpoint (no separate path)
- Bulk endpoints — not yet
- Role audit-log surface (`GET /api/admin/users/{user_id}/role/history`) — Phase 12+ if needed; the audit-reconstruction view already covers it
- New audit-reconstruction filter for role events — out
- Frontend admin console — Phase 12
- SRA roll verification (Phase 1 docstring named it "Phase 2 wires SRA"; still parked)
- Async / batch processing — still parked

---

## Pre-build findings

- `User.role` is a `String(32)` column with `default="solicitor"` (`backend/app/models/user.py:26`). No enum constraint at DB level; the column accepts any string today. Phase 11 keeps that — vocabulary enforcement happens at the endpoint layer.
- Three role tokens are in active use across the substrate:
  - `solicitor` — default on registration
  - `qualified_solicitor` — required for `B_mixed` posture (Phase 8) and for direct creation of `supervised_legal_advice` (advice-boundary tier transitions)
  - `workspace_admin` — required (alongside `qualified_solicitor`) for the `approved_final_advice` transition
- `any_authenticated` is a requirement token in `role_satisfies()`, NOT a stored role. Phase 11 does not accept it as a settable role.
- `User.is_superuser` is the existing admin gate other endpoints use. Phase 11 reuses it; no new admin primitive.

### Architectural decisions taken pre-code

**Decision #1 — Vocabulary locked to three tokens in code, not DB.**

The endpoint accepts only `solicitor`, `qualified_solicitor`, `workspace_admin`. Anything else returns 422 `invalid_role`. Locking at the endpoint (not the DB) means a future tier extension (e.g. SRA verification adding a fourth token) is a code change in one place, not a migration. Matches the Phase 8 `POSTURE_POLICY` constant pattern.

**Decision #2 — Self-promotion forbidden.**

Superusers can promote other users but not themselves. Two reasons:

1. A misconfigured admin elevating themselves to `workspace_admin` is a quiet ratcheting that audit-rebuilds can't always disentangle.
2. The intended UX is that a workspace's first admin role goes through an explicit operator action (a future env-gated CLI command), not a self-grant.

If the caller is the target, return HTTP 403 `self_promotion_forbidden`. This is small but worth pinning — a future variation might allow self-demote-to-solicitor; that's out of scope here.

**Decision #3 — Same endpoint for promotion and demotion.**

Any transition between the three roles goes through `POST .../role`. Demoting `qualified_solicitor` → `solicitor` is a legitimate operation (e.g. an SRA roll lapse) and uses the identical surface. The audit row records the from-and-to values so reconstruction can render the timeline either way.

**Decision #4 — One audit action.**

`user.role.changed` is the single canonical action name. Payload carries `target_user_id`, `from_role`, `to_role`, `actor_id`, plus a `reason` field reserved for future structured codes (left empty / "manual_admin_action" in Phase 11). Naming follows the existing primitive convention — though `user` isn't strictly a substrate primitive, the action shape mirrors what the audit reconstruction view renders for everything else.

**Decision #5 — No new tables.**

The role lives on the existing `User.role` column. Phase 11 mutates it directly. The audit table records the history; rebuilding past role state is a reconstruction query, not a separate audit table. Same pattern Phase 5 used for cost columns.

---

## Critical path

```
Step 1: api/admin_users.py — POST /api/admin/users/{user_id}/role
   ↓
Step 2: main.py wires the router under /api/admin
   ↓
Step 3: Tests — 7 cases
   ↓
Step 4: Full sweep green
   ↓
Step 5: HANDOVER_PHASE_11_ROLE_MANAGEMENT_DONE.md
```

~1-2 days. Smaller phase than any of the substrate ones.

---

## Step 1 — `api/admin_users.py`

**File:** `backend/app/api/admin_users.py` (new)

Single endpoint:

```python
ALLOWED_ROLES: frozenset[str] = frozenset({
    "solicitor",
    "qualified_solicitor",
    "workspace_admin",
})


class RoleChangeRequest(BaseModel):
    role: str


@router.post(
    "/users/{user_id}/role",
    response_model=UserOut,
)
async def change_user_role_endpoint(
    user_id: uuid.UUID,
    body: RoleChangeRequest,
    session: AsyncSession = Depends(get_session),
    caller: User = Depends(current_user),
) -> UserOut:
    # 1. Superuser-only
    if not caller.is_superuser:
        raise HTTPException(
            status_code=403,
            detail={"error": "admin_required"},
        )
    # 2. Role must be in the locked vocabulary
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "invalid_role",
                "allowed": sorted(ALLOWED_ROLES),
            },
        )
    # 3. Target must exist
    target = await session.scalar(
        select(User).where(User.id == user_id)
    )
    if target is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "user_not_found"},
        )
    # 4. No self-promotion (Decision #2)
    if target.id == caller.id:
        raise HTTPException(
            status_code=403,
            detail={"error": "self_promotion_forbidden"},
        )
    # 5. Idempotent — same role is a no-op (returns 200 with no audit row)
    if target.role == body.role:
        return _row_to_payload(target)
    # 6. Mutate + audit
    from_role = target.role
    target.role = body.role
    await audit.log(
        session,
        "user.role.changed",
        actor_id=caller.id,
        module="core.admin_users",
        resource_type="user",
        resource_id=str(target.id),
        payload={
            "target_user_id": str(target.id),
            "from_role": from_role,
            "to_role": body.role,
            "reason": "manual_admin_action",
        },
    )
    await session.commit()
    return _row_to_payload(target)
```

~120 LOC. Same matter-access-style audit pattern Phase 7 grants used.

---

## Step 2 — Wire into `main.py`

One line:

```python
app.include_router(admin_users_router, prefix="/api/admin", tags=["admin"])
```

Mounted under `/api/admin/` so the user-id path doesn't collide with the existing `/auth/users/...` account surface. Future admin endpoints (audit-log viewer, etc.) land alongside.

~3 LOC.

---

## Step 3 — Tests

**File:** `backend/tests/test_phase11_admin_role.py` (new)

The seven tests Andy specified, in order:

1. **Non-admin → 403.** A `solicitor`-role user posts to the endpoint; gets 403 `admin_required`.
2. **Self-promotion → 403.** A superuser posts targeting their own id; gets 403 `self_promotion_forbidden`. Confirms no DB mutation.
3. **Unknown role → 422.** Superuser posts `{"role": "banana"}`; gets 422 `invalid_role` with the allowed list. Confirms no DB mutation, no audit row.
4. **Target missing → 404.** Superuser posts targeting a random UUID; gets 404 `user_not_found`.
5. **Successful promotion → 200.** Superuser promotes another `solicitor` user to `qualified_solicitor`; response body shows the new role; DB row reflects it.
6. **Audit row recorded.** Same successful promotion as (5); confirms `user.role.changed` row landed with `from_role`, `to_role`, `target_user_id` payload fields.
7. **Phase 10 invoke works on `B_mixed` after promotion.** End-to-end regression: register a fresh user, register an admin, admin POSTs to promote the fresh user to `qualified_solicitor`, the fresh user then installs Contract Review + grants + invokes against a `B_mixed` matter — and the posture gate passes. This is the proof that Phase 11 closes the demo-role gap end-to-end.

~250 LOC across the seven tests.

---

## Step 4 — Full sweep

- Phase 11 only: 7 tests
- Phases 1–11 combined: ~666 tests
- Entire backend stays green.

---

## Step 5 — Handover

`HANDOVER_PHASE_11_ROLE_MANAGEMENT_DONE.md` covers:
- Five architectural decisions for Reviewer ratification
- The end-to-end demo unlock: after Phase 11, a real admin can promote a fresh registration to `qualified_solicitor` and the Phase 8 posture gate stops blocking the Khan demo
- Note: hosted-demo automation still needs a separate explicit setup action; Phase 11 deliberately doesn't auto-promote at signup
- Hand-off line for Reviewer

---

## Out of scope (intentional)

- Seed-time signup hook for auto-promotion
- Bulk endpoint for promoting many users at once
- `GET .../role/history` audit-log surface
- Frontend admin console
- SRA roll verification on `qualified_solicitor` claims
- Async / batch processing
- Role demotion as a separate endpoint (the same endpoint handles both directions)
- Cross-workspace role propagation (no multi-workspace concept yet)
- Token revocation on role demotion (existing sessions stay; tier-gated calls re-check at invocation time anyway)

---

*End of Phase 11 build plan. Builder commits this, then waits for Reviewer redline before Step 1.*
