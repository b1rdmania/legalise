# Supervisor Review v1 — mini-plan

**Status:** RATIFIED 2026-05-28 — build all four substeps. Decisions locked below.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Assumes:** 18-G is live. Acceptance walk can run in parallel; this design is **not** blocked on it.

## Ratification (Reviewer, 2026-05-28)

- **Q1 — manual "Request review".** Auto-on-produce is too magical; manual request makes the loop legible.
- **Q2 — advisory + audited, NOT hard-gating.** v1 claim is "Legalise supports a review/approval loop and reconstructs it" — *not* "prevents unapproved work from being used." Hard enforcement is a much bigger product contract (what is downstream use, blocked downloads, override semantics, bypass roles) — deferred.
- **Q3 — reviewer ≠ author holds by default, even in demo mode.** Self-review weakens the concept. Solo-evaluator friction → use two demo accounts, OR allow a **superuser override that is itself explicitly audited**. Default rule proves separation of review.
- **Q4 — "Approvals" tab.** (Not "Reviews" — Tabular Review owns that.)
- **Added redline — "Approved does not mean legally correct."** UI copy must carry: "Approved in Legalise", "Reviewed by [user]", "Decision recorded", "Not legal advice certification". Audit/reconstruction for each decision must surface: **artifact hash, reviewer, decision, notes, timestamp, source-artifact link, invocation link.**

Build all of SR-1 → SR-4.

## Why this is the next build

Supervised autonomy is the product thesis, but today it is invisible: posture gates, advice tiers, and dormant roles are *guards*, not a visible "AI produced an output → a human reviewed it → a decision was recorded → the audit reconstructs the chain" loop. This phase turns that thesis into one concrete, narrow, real workflow. Narrow but real — not a generic workflow engine.

## Grounding (what's already in the substrate)

- `matter_artifacts` — append-only, **WORM-enforced** (Postgres trigger, migration 0018). Fields: `id, matter_id, module_id, capability_id, invocation_id, kind, storage_path, created_by_id, created_at`. **No content hash column.**
- Audit reconstruction (`audit_reconstruction.py`) unions three action-prefixed sources: `audit`, `state_machine.transition.*`, `advice_boundary.decision.*`. New `review.*` audit rows ride the existing `audit` source — **no 4th reconstruction source needed**.
- `advice_boundary_decision` models advice-*tier* classification, **not** human review decisions — so this is net-new, not advice-boundary reuse.
- The `"reviews"` matter tab key is **already taken by "Tabular Review"**. The supervisor surface must be named **"Approvals"** (`approvals` tab key) to avoid collision.
- User/admin substrate + Phase 17.5 dormant firm gates: default mode treats everyone as able to act; no `qualified_solicitor` wall.

## The 10 points

### 1. First reviewed output type
**Contract Review findings-pack artifact** (one bounded `kind`). Artifact-backed, understandable, already produced into `matter_artifacts`. Exactly one `kind` is review-eligible in v1; everything else is untouched.

### 2. Review object model
New table **`matter_reviews`** (the review row is *mutable current-state*; the immutable history lives in the audit rows it emits — consistent with "audit is the receipt"). It is **not** WORM, unlike `matter_artifacts`.

| column | purpose |
|---|---|
| `id` | pk |
| `matter_id` | FK matters |
| `artifact_id` | FK matter_artifacts (the reviewed output) |
| `invocation_id` | provenance of the output |
| `module_id` / `capability_id` / `kind` | snapshot of what was reviewed |
| `artifact_hash` | sha256 of the artifact payload, **computed at request time** (net-new — artifacts have no hash) — pins *what* was reviewed even if storage changes |
| `state` | `pending` \| `approved` \| `rejected` \| `changes_requested` \| `overridden` |
| `requested_by_id` / `requested_at` | who sent it for review |
| `decided_by_id` / `decided_at` | who decided |
| `note` | reviewer note (mandatory on reject / changes / override) |

State machine: `pending → {approved, rejected, changes_requested, overridden}`. Terminal on decision; a re-review is a *new row* (so history is append-only at the row level too). Invalid transitions (e.g. deciding an already-decided review) 409.

### 3. Reviewer identity
Default mode: **any authenticated user may review**, with **reviewer ≠ requester/author** (segregation of duties — you cannot approve your own output, mirroring the admin self-promotion guard). **Not** `qualified_solicitor`. Firm mode can later tighten to a named reviewer role behind `LEGALISE_FIRM_ROLE_GATES_ENABLED`. *(Open question Q3: is reviewer-≠-author the right v1 default, or too strict for a single-evaluator demo?)*

### 4. UI surface
A matter-level **"Approvals"** tab (key `approvals` — **not** `reviews`, which is Tabular Review). Two sections: **Pending** and **Decided**. Reachable from the matter sub-nav (the 18-D sidebar) and surfaced as a count if pending > 0.

### 5. Review screen
For one review, the reviewer sees:
- the artifact/output — reuse `ArtifactPreview`;
- source refs / citations — from the artifact payload;
- model / provider metadata — from the invocation;
- permission / gate history — grants + posture at produce time;
- **audit reconstruction deep-link** — reuse the existing `/matters/{slug}/audit?invocation_id=…` link.

### 6. Actions
`approve` · `reject` · `request changes` · `override with note`. Override = approve-despite-a-flag, **note mandatory** — the explicit, heavily-audited supervised-autonomy escape hatch. Reject and request-changes also require a note.

### 7. Audit events
Every transition emits an `audit_entries` row: `review.requested`, `review.approved`, `review.rejected`, `review.changes_requested`, `review.overridden` — carrying `review_id`, `artifact_id`, `invocation_id`, `actor`, `note`, `artifact_hash`. These appear in matter reconstruction automatically (source `audit`). Add to the audit-action constants so there's no string drift.

### 8. No legal overclaim
Copy says **"Reviewed in Legalise"** / **"Approved by {reviewer} in Legalise"** — never "legally approved", "SRA approved", or "cleared for client use". The Approvals tab carries the standing claim-boundary line.

### 9. Reuse audit
- **Reuse:** `matter_artifacts` (artifact-backed), `ArtifactPreview`, `audit_entries` + reconstruction (`review.*` on the existing `audit` source), user/admin substrate, posture/grant history, the existing audit deep-link.
- **Net-new (justified custom):** `matter_reviews` table + state machine; the `requires_review` eligibility flag for the one `kind`; artifact-hash computation; the Approvals UI; the `review.*` audit actions. **Explicitly acknowledged:** `advice_boundary` does **not** model human review decisions, so this is net-new product/substrate, not advice-boundary reuse.

### 10. Tests (risk-based)
- **Model/transition unit tests:** valid transitions, invalid-transition 409, reviewer-≠-author guard, note-required on reject/changes/override.
- **API auth/transition tests:** 401 unauth, 403 author-reviews-own (if guard holds), idempotent/again-decide 409, audit row emitted per transition.
- **One focused UI test:** Approvals panel renders a pending item and an approve emits the action.
- **e2e** only at the merge/release gate (the supervisor-review smoke the v1 plan already lists).

## Scope

**IN:** the one Contract Review findings-pack `kind`; manual "Request review" action on that artifact; `matter_reviews` + state machine + `review.*` audit; the Approvals tab + review screen + four actions.

**OUT (v1.1 unless Reviewer pulls forward):**
- Auto-creating a pending review when the module produces the artifact (v1 is a manual, explicit "Request review" — simplest, no coupling into the module completion path). *(Open question Q1.)*
- **Hard-gating** downstream use (export, further runs) until approved. v1 is **advisory + visible + audited** — the review state is recorded and shown but does not block other actions. Enforcement is a stronger claim we haven't built. *(Open question Q2.)*
- More than one reviewed output type.
- Multi-reviewer / quorum / assignment.

## Non-negotiables
- No `qualified_solicitor` wall in default mode (Phase 17.5 holds).
- No legal overclaim (point 8).
- The review row is current-state; the **audit rows are the immutable record** — never claim the review table itself is forensic.
- Honest about advisory-vs-enforcing (point Q2): copy must not imply approval blocks anything it doesn't.

## Open questions for Reviewer
1. **Trigger:** manual "Request review" (proposed) vs auto-create-on-produce for the eligible kind?
2. **Advisory vs enforcing:** v1 advisory+audited (proposed) vs hard-gate downstream use until approved?
3. **Reviewer-≠-author:** enforce segregation of duties in default mode (proposed) or allow self-review for single-evaluator demos?
4. **Tab placement:** "Approvals" as its own matter tab (proposed) vs a section inside an existing tab?

## Build substeps (frontend-first where possible; this one needs backend)
- **SR-1 — substrate:** `matter_reviews` model + migration, state-machine service, `review.*` audit actions + constants, artifact-hash helper. Unit tests.
- **SR-2 — API:** `POST /matters/{slug}/reviews` (request), `POST /matters/{slug}/reviews/{id}/decide` (approve/reject/changes/override), `GET …/reviews`. Auth + transition + audit tests.
- **SR-3 — UI:** Approvals tab (pending/decided), review screen (reuse ArtifactPreview + audit deep-link), four actions, claim-boundary copy. One focused UI test.
- **SR-4 — gate:** supervisor-review e2e smoke; full frontend test/build; docs/claim-parity.

Verification cadence per [[legalise-verification-cadence]]: focused tests + typecheck per substep; full vitest + backend pytest at the phase gate; e2e at merge.
