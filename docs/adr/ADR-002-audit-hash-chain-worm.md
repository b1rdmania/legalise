# ADR-002 — Append-only audit hash-chain + WORM posture, verified in CI

**Status:** Accepted, enforced in DB triggers + role grants + CI.

## Context

The product's entire claim is that the audit trail is a *record*, not a log:
"every step writes to an audit log the application cannot edit or delete"
(README). A regulator/insurer-facing record that the application could quietly
rewrite is worthless. Hostile diligence (IC report, 2026-06) specifically
called out the missing hash chain; migration `0030` closed it.

## Decision

Two independent enforcement layers plus a chain, plus verification:

1. **WORM trigger** (migration `0011_audit_worm.py`): a Postgres trigger
   rejects UPDATE and DELETE on `audit_entries` for every role.
2. **Role split** (`infra/postgres-roles.sql`): the application role
   (`legalise_app`) has UPDATE/DELETE revoked by grant. **Exercised in CI on
   every build** — `.github/workflows/ci.yml` applies the grants and runs
   `infra/verify-worm-role-split.sh`; the build fails if `legalise_app` can
   mutate an audit row. The split is live on hosted prod (flipped ON
   2026-06-30, re-verified read-only against the production database
   2026-07-05: app connects as `legalise_app`, migrations via `MIGRATION_DSN`
   as owner, no mutation grants on audit tables).
3. **Hash chain** (migration `0030_audit_hash_chain.py`): an append-only
   `audit_chain` table, one row per audit row, written synchronously by an
   `AFTER INSERT` trigger. Canonical `len:value` serialisation is defined in
   `backend/app/core/audit_chain.py` and mirrored byte-for-byte in PL/pgSQL —
   two implementations on purpose, so CI catches trigger/verifier drift.
   Chains link per scope (`matter` / `system`), serialised with
   `pg_advisory_xact_lock`. `audit_chain` has its own WORM trigger and
   `ON DELETE RESTRICT` FK.
4. **Verification lives in three places:** `verify_audit_chain` (Python
   re-computation, structured issue codes), `GET
   /api/matters/{slug}/audit/chain` (third-party verification: export the head
   hash, later re-verify), and the matter export bundle. An owner-scoped
   read-only `GET …/audit/verify` powers the one-click "Verify integrity"
   button on Overview.
5. **Exports verify offline** (PR #258): every matter export ships
   `audit_chain.json` (each chain row in the exact canonical string form the
   hashes are computed over, plus a head summary) and `verify_chain.py`, a
   stdlib-only verifier copied verbatim into the zip
   (`backend/app/core/export_chain_verifier.py`). A recipient can prove the
   trail intact on a bare Python 3 install — no app, no network, no database.
   `AuditEntryCanonical.canonical_fields()` is the single source of truth for
   the rendering; two anti-drift tests (a no-DB cross-test and a DB-backed
   round trip that runs the shipped verifier as a subprocess) pin the
   standalone copy to it in CI.

Honest limit, stated everywhere it matters: this is tamper-**evident**, not
tamper-proof. A DB superuser with trigger access can rewrite unanchored
history. External anchoring (e.g. Rekor) and per-entry Ed25519 signing are
specced, deferred, and named as not-built (docs/ARCHITECTURE.md §8).

**Operational trap you must know about (learned twice, 2026-06-29):** the
per-scope `pg_advisory_xact_lock` is held until the request transaction
commits. Any in-session audit write taken *before* a long/fallible operation
(a model call) deadlocks against out-of-band audit writes on separate
committed connections (`audit_failure` / `audit_out_of_band`). This produced a
prod hang twice. The rule, recorded at `backend/app/core/api.py:342` and in
the assistant router: **never hold the chain advisory lock across a long
operation that may spawn separate-connection audit writes** — write
out-of-band, or commit first. Diagnose via `pg_stat_activity` (holder
idle-in-transaction + waiter on advisory).

## Consequences

- Audit-table schema changes are effectively append-only too: the canonical
  serialisation (`audit-chain-entry-v1`) commits to specific columns. Changing
  column semantics or serialisation breaks every existing chain.
- Deleting a matter cannot delete its audit rows (see ADR-010: tombstone, not
  purge, of the record).
- CI is a compliance gate, not just a test gate.

## What not to change, and why

- **Never add UPDATE/DELETE paths to `audit_entries` or `audit_chain`**, never
  "fix" the WORM triggers to allow admin edits, never grant the app role
  mutation rights. Any migration that does this destroys the product's one
  claim.
- **Never change the canonical serialisation or the PL/pgSQL mirror
  independently.** They must stay byte-identical; CI drift-checks assume it.
- **Do not remove the role-split assertion from CI** — it is the proof the
  README points at.
- **Do not move audit writes earlier in request flows** without checking the
  advisory-lock rule above.
- **Do not edit the exported verifier or the canonical rendering
  independently.** `verify_chain.py` in exports is a verbatim copy; the
  anti-drift tests exist because a diverged verifier quietly invalidates
  every previously issued export.
- Note: `REGULATORY_PLUMBING.md` once claimed the hash chain was "not in v1"
  (corrected in PR #254). If a doc drifts that way again, the chain is built —
  fix the doc, don't "implement" the chain a second time. ARCHITECTURE.md and
  TRUST.md are current.
