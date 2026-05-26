# Handover — Phase 11 Done (Admin Role Management)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_11_ROLE_MANAGEMENT_BUILD_PLAN.md`
**Sweep:** 666 passed, 8 skipped, 0 failed

---

## The demo-role gap is closed

Pre-Phase 11, the Phase 8 posture gate's `B_mixed → qualified_solicitor` requirement could only be satisfied by promoting users via direct DB mutation. Demo accounts, hosted-eval signups, anything not the vertical-slice test — none of them could run Contract Review or Pre-Motion on the seeded Khan v Acme matter.

After Phase 11: a real superuser POSTs to `/api/admin/users/{user_id}/role` and the target user can immediately run the full install → grant → invoke loop on `B_mixed` matters.

Test 7 of the negative-path battery proves the end-to-end unlock: a freshly registered user, promoted by an admin via the new endpoint, walks Contract Review against the seeded Khan v Acme NDA and the posture gate accepts.

---

## Deliverables ledger

| Step | Title | Status |
| --- | --- | --- |
| 1 | `api/admin_users.py` — `POST /api/admin/users/{user_id}/role` | done |
| 2 | `main.py` wires the router at `/api/admin` | done |
| 3 | 7 tests in `test_phase11_admin_role.py` | done |
| 4 | Full sweep — 666 / 8 / 0 | done |
| 5 | This handover | done |

---

## Architectural decisions ratified

The five decisions from the plan held without surfacing any redline-after-the-fact. Restating the load-bearing ones:

### Decision #1 — Vocabulary locked in code, not DB

`ALLOWED_ROLES` is a `frozenset` of three tokens defined in `api/admin_users.py`. The `User.role` column stays a free `String(32)`. Future role additions (SRA verification etc.) become a code change in one place, not a migration.

### Decision #2 — Self-promotion forbidden

Caller targeting their own user_id returns HTTP 403 `self_promotion_forbidden`. A misconfigured admin elevating themselves to `workspace_admin` is a quiet ratcheting that the audit-reconstruction view can't always disentangle. The intended UX is that workspace admin roles go through an explicit operator setup action (future env-gated CLI), not a self-grant via this endpoint.

### Decision #3 — Same endpoint handles promotion AND demotion

Any transition between the three tokens uses the same surface. Demoting `qualified_solicitor` → `solicitor` (e.g. SRA roll lapse) is a legitimate operation. The audit row records `from_role` + `to_role` so reconstruction renders either direction.

### Decision #4 — One audit action: `user.role.changed`

Single canonical action. Payload carries `target_user_id`, `from_role`, `to_role`, plus a `reason` field reserved for future structured codes (Phase 11 stamps `"manual_admin_action"`).

### Decision #5 — No new tables

Phase 11 mutates `User.role` directly. The audit table records history; rebuilding past role state is a reconstruction query. Same pattern Phase 5 used for cost columns.

---

## New / modified files

```
NEW
  backend/app/api/admin_users.py
  backend/tests/test_phase11_admin_role.py
  docs/handovers/HANDOVER_PHASE_11_ROLE_MANAGEMENT_DONE.md (this doc)

MODIFIED
  backend/app/main.py   — register admin_users_router at /api/admin
```

---

## Tests added (7 total)

1. **Non-admin → 403** — `solicitor`-role caller posts; gets `admin_required`; DB unchanged.
2. **Self-promotion → 403** — superuser posts targeting their own id; gets `self_promotion_forbidden`; DB unchanged; no audit row.
3. **Unknown role → 422** — `{"role": "banana"}` returns `invalid_role` with the allowed list; DB unchanged.
4. **Target missing → 404** — random UUID returns `user_not_found`.
5. **Successful promotion → 200** — response body shows the new role; DB row reflects.
6. **Audit row recorded** — `user.role.changed` lands with `from_role`, `to_role`, `target_user_id`, `reason=manual_admin_action`.
7. **End-to-end demo unlock** — fresh user registered, admin promotes via the new endpoint, fresh user installs Contract Review, grants caps, invokes against the seeded Khan v Acme NDA (which is `B_mixed`), posture gate passes, invocation returns 200.

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Phase 11 only — 7 tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase11_admin_role.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Demo deployment note

Hosted-demo automation that wants pre-promoted accounts still needs a separate explicit setup action. The plan deliberately rejected a signup-time auto-promotion hook — Phase 11 ships only the admin endpoint. Two operational handles a future deployment can use:

1. **Manual** — operator registers, promotes themselves via direct DB or a future CLI, then promotes other demo accounts via the new HTTP endpoint.
2. **Future env-gated CLI** — an explicit setup script (out of scope here) that reads a list of emails + roles and applies them.

The vertical-slice test's `user.role = "qualified_solicitor"` direct mutation pattern stays — that's a test-fixture convenience, not a production code path. Real demos use the endpoint.

---

## Out of scope at end of Phase 11

- Seed-time signup hook for auto-promotion (deliberately rejected)
- Bulk endpoint for promoting many users
- `GET .../role/history` audit-log surface (use `/audit/reconstruction` instead)
- Frontend admin console → Phase 12
- SRA roll verification on `qualified_solicitor` claims
- `is_superuser` management endpoint (Phase 11 only changes `role`)
- Token / session revocation on demotion (existing sessions stay; gates re-check at invocation time)
- Multi-workspace role propagation
- Cross-org admin federation

---

## Hand-off line for Reviewer

> *Phase 11 (admin role management) implemented end-to-end on `runtime-rewrite`. Full sweep green: 666 passed, 8 skipped. Five architectural decisions request ratification. The demo-role gap Phase 8 flagged is now closed via the HTTP surface — Test 7 (`test_post_promotion_phase10_invoke_on_b_mixed_succeeds`) walks register → promote → install → grant → invoke against the seeded B_mixed Khan matter and the posture gate accepts. Smallest phase since Phase 8: one endpoint, no new tables, no new vocabulary, no signup hook. Ready for ratification.*

---

*End of Phase 11 handover.*
