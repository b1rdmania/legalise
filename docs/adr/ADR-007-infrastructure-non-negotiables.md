# ADR-007 — Infrastructure non-negotiables: Redis, Fly filesystem, Neon, key encryption

**Status:** Accepted. These are standing rules, recorded in the maintainer's
non-negotiables list and enforced/documented in code.

## Context

Hosted topology: Cloudflare (CDN/Pages/R2) → Fly.io `lhr` (backend app +
worker) → Neon London (Postgres) + Upstash Redis. Each rule below exists
because the tempting shortcut it forbids would break a privilege, durability,
or audit promise.

## Decision

1. **Redis never holds matter content.** Redis is a job *queue* only
   (`backend/app/core/jobs.py`, arq): "Workers receive only the job id from
   the queue and read everything else from Postgres" (jobs.py:13,250 — the
   rule is written into the module docstring and the enqueue function).
   Rate-limiting deliberately does NOT use Redis either — auth throttles are
   sliding windows recomputed **from Postgres** so limits hold across
   instances (TRUST.md §10). The one other thing in Redis is the worker
   heartbeat key (PR #257): counters only, never matter content — it exists
   so `doctor`'s `worker.heartbeat` check can tell a dead worker from an
   idle one. Rationale for the rule: Redis is unencrypted-at-rest by
   default, ephemeral, and outside the audit/WORM perimeter; content in Redis
   is content with no privilege posture attached.
2. **The Fly filesystem is never the source of truth.** The matter filesystem
   materialisation (`backend/app/core/matter_fs.py`: `matter.md`,
   `history.md`, `chronology.md` under `matters_root`) is a *mirror* for
   interchange (deliberately matches the Stella matter-folder schema) and
   convenience. Postgres rows are authoritative; document blobs live in
   S3-compatible object storage (R2 hosted / MinIO local), not the Fly
   volume. Forensic/tamper-evidence claims are scoped to the Postgres copy
   only — the `.jsonl`/markdown mirrors carry no tamper protection (known,
   accepted, recorded in the IC-report review). Fly machines are cattle;
   anything only on their disk is one redeploy from gone.
3. **Neon Postgres is the source of truth** for matters, documents metadata,
   audit entries, chain, chunks, vectors, sign-offs, users, and encrypted
   keys. It is UK-region (London), point-in-time-restorable (restore
   rehearsal done 2026-06-30), and the WORM role split is live on it
   (app connects as reduced-privilege `legalise_app`; migrations use
   `MIGRATION_DSN` as owner).
4. **User provider keys are AES-256-GCM encrypted** under a master key from
   `LEGALISE_KEY_ENCRYPTION_SECRET` (32-byte hex), decrypted only at call
   time, never logged. Operational rules learned the hard way:
   - The secret must be **stable and explicitly set** in any real deployment.
     An empty secret makes dev auto-generate per-process → container recreate
     orphans every stored key (this broke chat mid-session once, and an
     invalid placeholder in `.env.example` once broke every fresh fork's
     boot; `.env.example` now ships it EMPTY on purpose — dev auto-generates,
     stored keys don't survive restart, documented).
   - Undecryptable keys raise a typed `KeyDecryptionError` with a "re-add
     your key" message (was a blank-string cryptography error).
   - `doctor` masks DSN passwords in output.

## Consequences

- Losing the master key = stored provider keys unrecoverable (stated in
  TRUST.md §3 — the self-host operator owns this).
- Everything durable funnels through Neon; Neon PITR + the audit chain are
  the recovery and integrity story respectively.

## What not to change, and why

- **Never cache prompts, responses, document text, or chunks in Redis** (no
  "speed up retrieval with a Redis cache" PRs). Job id and heartbeat counters
  only.
- **Never make the Fly volume authoritative for anything** — no
  "read matter.md instead of the DB" optimisations, no accepting writes into
  the mirror. `matter_fs.py` must remain the *only writer* under
  `matters_root`, one-directional DB→disk.
- **Never move rate-limit state to Redis** without accepting that limits
  then reset on Redis loss and diverge across regions — the Postgres window
  was chosen deliberately.
- **Never log or persist decrypted provider keys**, and never ship a
  non-empty `LEGALISE_KEY_ENCRYPTION_SECRET` placeholder in `.env.example`
  (it must be valid hex or empty; the boot assertion rejects junk).
