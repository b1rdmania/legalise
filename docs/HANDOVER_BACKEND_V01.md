# Backend handover — Legalise v0.1 → v0.2

**For:** the reviewer agent (and Andy for context).
**As of:** 2026-05-19. Master on `b535356`. Design v0.4 shell is FROZEN; the chat redesign + reviewer hardening pass shipped today.
**Scope:** what backend exists, what's queued, and the open questions Andy wants a second opinion on before scope freezes.

This is a *scoping* handover, not a build plan. Push back on priority, scope, and shape — that's the point.

---

## 1. What exists today

FastAPI + Postgres + pgvector + fastapi-users (cookie sessions + DB-backed access tokens) + SQLAlchemy 2.x async. Deploys: Fly.io `lhr` backend + Neon Postgres London (live demo); Docker Compose for self-host.

API surface (all under `backend/app/api/`):

| Module | Endpoints (auth-gated unless noted) |
|---|---|
| `auth.py` | fastapi-users register / login / logout / password-reset; cookie session |
| `matters.py` | matter CRUD, chronology read, audit read, posture toggle |
| `documents.py` | document upload, list, body extract |
| `modules.py` | `GET /api/modules` (authed) — installed skill catalogue from `PLUGINS_ROOT`. `GET /api/modules/{plugin}/{skill}` — raw `SKILL.md` body. Disable/enable per workspace via `WorkspaceDisabledSkill`. |
| `settings.py` | profile, API keys CRUD, password change |
| `submissions.py` | unauth `POST /api/modules/submit` (Turnstile + per-IP rate-limit; opens a draft PR on `b1rdmania/claude-for-uk-legal`) |
| `workspace.py` | per-workspace skill capability grants |

Models:
- `User` (fastapi-users base + `name`, `role`, `default_model_id`, `default_privilege_posture`, `created_at`)
- `Matter`, `MatterDocument`, `Event`, `MatterCitation`
- `AuditEntry`, `DocumentBody`, `DocumentEdit`, `DocumentVersion`
- `WorkspaceSkill`, `WorkspaceDisabledSkill`, `WorkspaceSkillCapabilityGrant`
- `AssistantMessage`, `TabularReview`

The plugin substrate exists. Capability grants exist. The audit log is real. The privilege gateway is wired through `model_gateway`. None of the four queued items is greenfield — they all plug into surfaces that already speak the right vocabulary.

---

## 2. Frontend TODOs that need backend work

These four are filed in `docs/BACKEND_TODOS.md`. They surfaced during the v0.4 design pass; the frontend currently fakes them with static data or `window.confirm`.

### A. `TODO(public-modules)` — public catalogue endpoint

Today: `#/modules` unauth catalogue and the in-matter Workflows cards both render from a hardcoded `WORKFLOW_TABS` constant in `frontend/src/matter/tabs/types.ts`. Five workflows, same for every unauth visitor regardless of what's actually installed at `PLUGINS_ROOT`.

Shape:
```
GET /api/modules/public
→ { source: {repo, ref}, skills: [{plugin, skill, name, description, capabilities, source_url, trust_posture, ...}] }
```

Read-only, no auth, no rate-limit beyond standard ingress. Frontend swaps the constant for fetched data and the catalogue starts reflecting reality.

### B. `TODO(workflow-state)` — per-matter workflow state

Today: every workflow card on `WorkflowsTab` renders `Status: installed`, `Last run: never`, `Availability: ok` as static strings. Frontend already has the colour-coded display ready and the new human `description` field per workflow.

Shape:
```
GET /api/matters/{slug}/workflows
→ [{key, grant, last_run_at, availability}]
  grant:        "installed" | "blocked" | "not-installed"
  last_run_at:  ISO | null
  availability: "ok" | "blocked-by-posture" | "blocked-by-grant"
```

### C. `TODO(plan)` — User.plan field

Today: Settings renders a hardcoded "Free" badge. No source of truth.

Shape: add `plan: Mapped[str]` to `User` (default `free`). Surface on `/api/users/me`. No gating wired yet.

### D. `TODO(delete-account)` — DELETE /api/users/me

Today: the danger-zone button in Settings calls `window.confirm` then logs to console.

Shape: `DELETE /api/users/me` that handles the user record, the session, and any matters owned by the user. Exact semantics are an open question (see §4).

---

## 3. Recommended order, with reasoning

1. **public-modules** first. Highest leverage: the Modules page is already shipping unauth and currently lies about what's installed. Smallest endpoint, no new schema, no new auth path. Removes the most visible faked surface in the product. Frontend wiring is one fetch.
2. **workflow-state** second. Cards are already rendering the slots; the data shape is decided; needs a small denorm or a query against the audit log. Medium effort.
3. **plan** third. One-column schema change, one /me field surface. Decision-light unless we want plans to gate behaviour now (§4.C).
4. **delete-account** last. Real policy work hides here (matter retention, audit-entry actor anonymisation, GDPR alignment). Better to ship the lighter three first so the policy conversation isn't blocking unrelated unblocks.

Serial, not parallel — they share no code surface so parallelisation buys little, and the matter-retention decision for delete-account benefits from `plan` being landed first (refund / pro-rate edge cases).

---

## 4. Open questions where Andy wants a second opinion

### A. public-modules — what do we expose, and how cacheable?

- **Field set:** the authed `GET /api/modules` returns `declared_capabilities` + `granted_capabilities` + `enabled`. The public version has no workspace, so `granted` and `enabled` make no sense. Keep `declared_capabilities` + `trust_posture` + `source_url`? Or strip down to just `name`/`description`/`capabilities`?
- **Plugin source URL:** show or hide the GitHub origin? Showing it makes "you can fork and write your own" obvious; hiding it keeps the marketplace surface less developer-shaped.
- **Cache TTL:** the catalogue mutates on git push to `claude-for-uk-legal`, not on user action. Worth caching aggressively (5 minutes? 1 hour?) — open question whether to do an in-process LRU, Redis, or HTTP `Cache-Control`. Probably HTTP `Cache-Control: public, max-age=300` is enough.
- **Rate limit:** public endpoint, very small payload. Standard ingress probably fine. Worth a token bucket if scrapers are a worry, but unlikely at v0.1.

### B. workflow-state — where does each field live?

- **`grant`:** derive from `WorkspaceDisabledSkill` + `WorkspaceSkillCapabilityGrant` at query time, or denormalise? Probably derive — it's cheap and the source-of-truth is already there.
- **`last_run_at`:** scan the audit log per workflow key, or maintain a denorm column on a `WorkflowRun` table? Scan is simplest for v0.1 (audit log is small per matter); denorm is more honest as workflows multiply. Reviewer call.
- **`availability`:** computed live (matter posture × workflow declared capabilities) or stored? Almost certainly computed — it's a function of two fields we already have. Locking it down in a table would be premature.
- **Auth shape:** scope to current_user's matters, or `matter_id` alone? Matters already have an owner; reusing the existing matter-access check is the right call.

### C. plan — minimum or proper schema?

- **Just a string on `User`** (`free` / `pro` / `team`) versus a proper `subscriptions` table with periods, statuses, Stripe references etc.
- The minimum unblocks the frontend display. The proper schema makes billing wiring later less painful. Reviewer's view on premature schema design vs. throwaway code matters here.
- **Enforcement:** does `free` actually limit anything at v0.1 (e.g., one matter, no API keys)? Or just a display field for now? Andy's instinct is *display only* until billing wires; the constraint is "no lying about the plan."

### D. delete-account — the actual policy questions

These are not implementation questions. They're decisions Andy wants the reviewer to weigh in on.

- **Soft vs hard delete.** Soft (mark `is_active=False`, retain rows) is GDPR-friendly only with a documented retention window and a real hard-delete job. Hard delete is cleaner but destroys audit-trail attribution. Most legal-adjacent products do soft + scheduled purge.
- **Matter retention.** When a solicitor-user deletes their account, what happens to their matters? Options: (1) cascade delete the matters; (2) anonymise the owner field, keep matters; (3) refuse delete if matters exist and require manual takedown. (3) is brutal but defensible for v0.1 — solicitors don't accidentally delete their account. (1) is the consumer default.
- **Audit-entry attribution.** `AuditEntry.actor_id` points at the user. If the user is hard-deleted, the audit entries become orphaned. Anonymising `actor_id` to a sentinel UUID preserves the trail. This is probably non-negotiable: audit must outlive user identity.
- **GDPR right-to-be-forgotten alignment.** Soft delete with a retention window probably satisfies UK GDPR Art 17 given the "legitimate interest" carve-out for legal records. Worth a documented stance; not a v0.1 blocker.

Andy's current lean: **soft delete + (3) refuse if matters exist + anonymise actor_id on the eventual hard purge.** Wants the reviewer to call out anything broken in that.

---

## 5. Out of scope for this pass

- Live workflow execution from the workspace (`POST /api/matters/{slug}/workflows/{key}/run`). That's a different conversation; v0.1 demos use the seeded fixture in `frontend/src/demo/snapshot.ts`.
- Billing surfaces (Stripe wiring, plan upgrades, invoice history). `plan` is just the field; the buy-flow comes later.
- A real public modules write path. Submissions already go through `POST /api/modules/submit` → draft PR; merging stays a Git workflow.
- Multi-workspace / team accounts. v0.1 is single-workspace-per-user.

---

## 6. What Andy is asking the reviewer

Three questions, in priority:

1. **Order.** Is public-modules → workflow-state → plan → delete-account the right serial sequence, or should one move forward / drop / split?
2. **Scope of each.** For each TODO, does the shape in §2 look right, or is there a smaller / sharper version?
3. **The four delete-account decisions in §4.D.** Specifically the "refuse if matters exist" call — does that read as defensible v0.1 behaviour, or paranoid?

Reviewer is the canonical decision authority on backend shape, same as on design. Sign-off here is what locks the scope before Andy hands the build to me.

---

## 7. Related

- `docs/BACKEND_TODOS.md` — terse version of the four queued items
- `docs/HANDOVER_DESIGN_V04.md` — design doctrine, FROZEN
- `docs/ARCHITECTURE.md` — full backend architecture (long form)
- Memory: `legalise.md` (parent), `legalise-design.md` (design v0.4)
