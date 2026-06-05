# Scope: tamper-evident audit hash-chaining

**Status:** scoping doc for reviewer sign-off. Not yet implemented.
**Author:** drafted 2026-06-05, grounded in the code at head `e302b17` / migration `0029`.
**Decision authority:** reviewer signs off the design choices in §7 before build.

---

## 1. Why

The audit is the load-bearing claim of the whole product ("defensible record"). Today it is **append-only by Postgres trigger** (`enforce_audit_worm`, migration `0011`) — strong against application bugs and non-privileged actors, but **not tamper-evident**:

- No hash-chain: rows carry per-row `prompt_hash`/`response_hash` but no link between rows. A privileged operator who runs `ALTER TABLE audit_entries DISABLE TRIGGER` can edit, delete, or reorder rows and leave no cryptographic trace.
- The role split (`legalise_app` REVOKE) that would stop the app credential disabling the trigger is a documented no-op on the live single-role stack.
- The `.jsonl` filesystem mirror has no protection at all.

Both the external audit and our own analysis independently named the same fix: **hash-chain the audit rows, then anchor checkpoints to an external transparency log.** This doc scopes that work.

What phase 1 buys, stated honestly: **any post-hoc edit, delete, or reorder of historical rows becomes detectable by recomputation.** It does *not* by itself defeat an attacker who also rewrites the chain — that needs the external anchor (phase 3). We must keep the public claim scoped to exactly this.

---

## 2. The hard constraint that shapes the design

Audit rows are written from **multiple independent transactions**, by design:

| Path | Where | Session |
|---|---|---|
| `http.*` request rows | `core/audit.py` `AuditMiddleware` | its **own** session, commits after the handler |
| Semantic rows (`model.call`, `module.*`, `output.*`, etc.) | routers + `core/model_gateway.py` | the **request** session |
| Failure rows (`model.call.error`, `key_missing`) | `core/api.py` `audit_failure` (line 135) | an **independent committed** transaction, so the row survives the request rollback |

A naïve "read previous hash, append" in application code would have to be added at every one of these sites (and every future one), and would contend across sessions. This is the same "did you cover every boundary?" failure mode the capability layer already shows. **The design must cover all write paths without per-site changes, and must not fight the independent-commit failure path.**

A second hard constraint: the WORM trigger **forbids UPDATE**. So we cannot backfill or fill chain columns *on* `audit_entries` — any approach that UPDATEs existing audit rows is dead on arrival.

---

## 3. Recommended design — separate append-only `audit_chain` table, filled by an AFTER INSERT trigger

Keep `audit_entries` **completely untouched** (no schema change, no backfill-UPDATE, WORM intact). Put the chain in a new append-only table, populated automatically at the DB layer.

```
audit_chain
  audit_id      uuid  PK, FK -> audit_entries.id   (one chain row per audit row)
  chain_key     uuid  NOT NULL, index              (= matter_id, or a fixed sentinel for matterless rows)
  seq           bigint NOT NULL                     (per-chain monotonic position; UNIQUE(chain_key, seq))
  previous_hash char(64)                            (NULL/genesis for the first row in a chain)
  entry_hash    char(64) NOT NULL
  chained_at    timestamptz NOT NULL default now()
```

- **`AFTER INSERT` trigger on `audit_entries`** computes the chain row in the *same transaction* as the audit row:
  1. `chain_key = COALESCE(NEW.matter_id, <SYSTEM_SENTINEL_UUID>)`.
  2. `pg_advisory_xact_lock(hashtext(chain_key::text))` — serialises appends *within one chain*; cross-matter writes stay parallel.
  3. Read the current head (`previous_hash`, `seq`) for `chain_key` from `audit_chain`.
  4. `entry_hash = sha256( canonical(NEW) || previous_hash )` via `pgcrypto` `digest()`.
  5. Insert the `audit_chain` row.
- **Atomicity falls out for free:** if the audit row's transaction rolls back, the chain row rolls back with it — no gap. The `audit_failure` path commits its own transaction, so its trigger fires and chains inside that transaction. Every path is covered with **zero application changes**.
- `audit_chain` gets its **own append-only WORM trigger** (insert-only), mirroring `0011`.

### Why this over the alternatives (for the reviewer to weigh)

| Option | Covers all paths w/o refactor | Atomic (no lag window) | One hashing recipe | Notes |
|---|---|---|---|---|
| **A. App-side synchronous** | ✗ (must route every insert site through one helper) | ✓ | ✓ (Python `hashlib`) | Biggest refactor; easy to miss a future site |
| **B. Deferred Python chainer** (worker fills `audit_chain` after the fact) | ✓ | ✗ (rows chained shortly *after* insert; a delete inside the lag leaves no trace) | ✓ (Python) | Simplest; weaker guarantee; needs a tight loop/trigger to shrink the window |
| **C. AFTER INSERT trigger → `audit_chain`** *(recommended)* | ✓ | ✓ | ✗ (plpgsql+`pgcrypto` for write, Python for verify) | Matches the WORM-trigger philosophy; the one real cost is recipe duplication, contained by a conformance test (§6) |

The recommendation is **C**. The single downside — the hashing recipe exists twice (plpgsql to write, Python to verify) — is neutralised by a conformance test that fails CI the moment they diverge.

---

## 4. The canonicalisation recipe (freeze this — it is permanent)

`entry_hash` covers every immutable data column of the audit row. Once shipped, **the recipe cannot change without invalidating every prior chain**, so it needs explicit sign-off and a `chain_version` tag stored alongside (start at `1`).

- **Covered fields, in fixed order:** `id, timestamp (UTC, ISO-8601 microseconds), actor_id, matter_id, action, module, resource_type, resource_id, model_used, prompt_hash, response_hash, token_count, latency_ms, tokens_in, tokens_out, cost_micros, currency, provider, model_id, payload`.
- **`payload`** (JSONB): hash its canonical text form. `jsonb::text` is deterministic for a given value in Postgres; the Python verifier must reproduce the *same* serialisation (use `payload::text` from the DB as the canonical bytes, or a `json.dumps(..., sort_keys=True, separators=(',',':'))` that is conformance-tested to match — decide in §7).
- **NULL handling:** explicit sentinel (e.g. the byte `\x00`), never an empty string, so `NULL` and `""` cannot collide.
- **Delimiter:** length-prefix each field, or join with a sentinel that cannot appear in the data. Length-prefixing is safest.
- **Genesis:** first row in a chain uses `previous_hash = '0' * 64`.

This recipe lives in **one documented place** (`core/audit_chain.py` docstring) and is mirrored by the trigger.

---

## 5. Phasing (mirrors the audit's own recommendation)

- **Phase 1 — hash-chaining (this doc).** Columns/table + trigger + backfill + verifier + tests + claim update. Closes edit/delete/reorder evidence for historical rows. **~1–1.5 focused days.**
- **Phase 2 — complete the `legalise_app` role split.** Already documented in `0011` and `infra/postgres-roles.sql`; ops work so the app credential cannot `DISABLE TRIGGER`. **~half a day, ops.** Independent of phase 1 but raises the bar on both triggers.
- **Phase 3 — external anchor.** Periodic Merkle checkpoint of chain heads published to Sigstore Rekor (or a notarised timestamp / second-credential store). This is what defeats the privileged-insider-who-also-rewrites-the-chain. Folds into the same Sigstore dependency the manifest-signing hardening already needs. **~1–2 days.**

Only after phase 3 may we say "tamper-evident against a privileged operator." Phase 1 earns "every audit row is hash-chained; any edit, delete, or reorder of history is detectable."

---

## 6. Build checklist (phase 1)

**Migration `0030_audit_hash_chain.py`** (down_revision `0029`):
1. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (confirm Neon allows — it does).
2. Create `audit_chain` table + `UNIQUE(chain_key, seq)` + indexes.
3. Create the canonical-text + `entry_hash` SQL function and the `AFTER INSERT` trigger on `audit_entries`.
4. Create the append-only WORM trigger on `audit_chain`.
5. **Backfill:** insert chain rows for all existing `audit_entries`, ordered by `(timestamp, id)` within each `chain_key`. Pure INSERTs into `audit_chain` — never touches `audit_entries`, so no WORM conflict. (Backfill historical order is best-effort by timestamp; integrity is guaranteed from the backfill genesis forward. State this in the doc.)
6. `downgrade()` drops triggers, function, table.

**Code:**
- `core/audit_chain.py` — the canonical recipe (single source of truth, documented) + the Python verifier `verify_chain(session, chain_key=None) -> Report`.
- `app/tools/verify_audit_chain.py` — CLI: walk each chain by `seq`, recompute, report first break (edit/gap/reorder) or "OK, N rows, M chains."
- `core/audit_reconstruction.py` — optional: surface chain-verified status in the reconstruction view.
- `models/` — add an `AuditChain` model (read-only; document that the app never writes it directly — the trigger does).

**Tests `tests/test_audit_hash_chain.py`:**
1. Continuity — N inserts to one matter → verifier passes; `previous_hash` links hold.
2. Tamper-edit — (as a privileged role, bypassing WORM) edit a payload → verifier flags that `seq`.
3. Tamper-delete — remove a row → gap detected.
4. Tamper-reorder — swap two rows' order → detected.
5. Cross-matter independence — tampering chain A does not break chain B.
6. Concurrency — concurrent inserts to the *same* matter chain produce one linear chain (no fork, no duplicate `previous_hash`).
7. Failure-path — a `model.call.error` row written via `audit_failure` (independent txn, after a rolled-back request) chains correctly.
8. Backfill — pre-existing rows get a valid chain; verifier passes from genesis.
9. **Conformance — `python_recompute(row) == db_stored entry_hash`** across all column types, NULLs, and unicode payloads. This is the guard against plpgsql/Python recipe drift.
10. WORM intact — chain work introduces no UPDATE path; both triggers still block mutation.

**Docs (claim discipline — public copy is otherwise frozen, so reviewer approves the wording):**
- `docs/TRUST.md`, `REGULATORY_PLUMBING.md`, `docs/CLAIM_BOUNDARY.md`: update the audit line to "hash-chained, tamper-evident within Postgres (edit/delete/reorder detectable); external anchoring is phase 3." Keep `.jsonl` mirror scoped out (forensic claim applies to Postgres).

**Verify cadence (per house rules):** focused `pytest tests/test_audit_hash_chain.py` + typecheck per sub-step; full backend suite at the phase checkpoint. Run vitest/build only if the reconstruction UI is touched.

---

## 7. Open decisions for the reviewer

1. **Design A / B / C** — recommend **C** (AFTER INSERT trigger → separate `audit_chain`). Confirm, or take B if we'd rather keep one Python-only recipe and accept the chaining lag.
2. **Chain granularity** — recommend **per-matter chains + one system chain** (matterless rows: signup, admin, anon `http.*`). Confirm the system-sentinel approach.
3. **`payload` canonical form** — `payload::text` from Postgres as the canonical bytes, vs a sorted-keys Python dump that is conformance-tested to match. Pick one; it's frozen.
4. **NULL sentinel + delimiter** — approve length-prefixing (recommended) vs sentinel-join.
5. **Backfill ordering** — accept `(timestamp, id)` as best-effort historical order, integrity guaranteed forward. Confirm acceptable, or require a stronger ordering signal.
6. **`.jsonl` mirror** — phase 1 scopes the forensic claim to Postgres (recommended). Confirm we are *not* chaining the shards in this phase.
7. **`pgcrypto` on Neon** — confirm the extension is permitted in the prod cluster (expected yes).

## 8. Risks

- **Recipe drift** (plpgsql write vs Python verify) — mitigated by test #9; must stay green forever.
- **Recipe is permanent** — any future change invalidates all chains; hence `chain_version` and reviewer sign-off on §4.
- **Per-chain serialisation** — the advisory lock serialises writes within one matter's chain. Fine at current/single-firm scale; note it as a known scaling consideration (per-matter keys keep it parallel across matters).
- **Backfill on a large table** — runs once in the migration; for the current data size this is trivial, but the migration should batch if the table is ever large.
- **Scope creep into phase 3** — resist anchoring/Merkle in this phase; phase 1 is chaining + verification only.
