# ADR-003 — Author ≠ signer: sign-off legibility as a product invariant

**Status:** Accepted. Legibility always on; separation opt-in.

## Context

The regulatory story (SRA supervision, post-Mazur guidance): AI can draft, but
a named human must stay accountable, and a workspace that lets AI-authored
work be silently rubber-stamped — or lets an author quietly certify their own
output — has no supervision story. This is the thesis: *the machine signs its
own record; the human signs the work.* It is a product invariant, not a
workflow preference, because it is the thing competitors structurally don't
have (sign-off + posture on an output is "the lane none of them occupy").

## Decision

Precision matters here — the invariant is **legibility**, not mandatory
separation:

- Sign-off (`backend/app/core/signoff.py`) records `signed` /
  `signed_with_observations` / `rejected`; non-clean decisions require
  reasoning. Each sign-off **pins the exact output by hash** (SHA-256 of
  canonical `{artifact_id, kind, payload}`) and is append-only (a new decision
  never mutates a prior one; the live decision derives from newest row).
- **By default, an author MAY sign their own work** — the design target is the
  sole practitioner. But the record never hides it: `signer_is_author`
  (computed against `artifact.created_by_id`, `signoff.py:264`) is written
  into the audit payload and rendered in UI/exports as "author — self-signed,
  not independent review".
- Firms needing four-eyes set `SIGNOFF_AUTHOR_MUST_DIFFER` (default `false`,
  `config.py:99`): signing your own work raises `AuthorCannotSign` (403) —
  **rejecting your own work is always allowed** (blocking self-rejection would
  be perverse).
- In the Mike-fork experiment the same rule appears as: `signer_is_author` is
  forced false when the version is AI-authored — a human signing AI output is
  author≠signer by construction.
- **Rubber-stamp detection (M13):** first open of a sign surface writes an
  idempotent `output.review.opened` row; review latency is derived at read
  time; an implausibly fast sign-off is flagged `implausible_speed` on the
  payload — **recorded, not blocked**. Admin surface shows scrutiny bands.

## Consequences

- "Who stayed accountable, and did they actually look?" is answerable from the
  record alone. That is the pitch to regulators/insurers.
- Sign-off history can grow long on contested outputs; that is intentional
  (disciplinary-record semantics — rejections recorded as faithfully as
  approvals, or the standing claim dies).

## What not to change, and why

- **Never make sign-offs mutable or collapse the history to "latest wins" at
  the storage layer.** Derive-latest at read time is the pattern.
- **Never drop or default-hide `signer_is_author`** from payloads, UI, or
  exports. Hiding self-signing converts the record from honest to misleading.
- **Do not make M13 blocking.** It is deliberately record-not-block: the
  product's stance is legibility over enforcement (a blocked signer just waits
  out a timer; a *flagged* signer is visible to their supervisor forever).
- **Do not "simplify" by making `SIGNOFF_AUTHOR_MUST_DIFFER` default true** —
  it kills the sole-practitioner loop the eval release targets.
- **Do not let any new output path (new artifact kinds, external packs, chat
  "save as draft" when built) bypass sign-off/pinning.** Every reviewable
  output must be hash-pinned at decision time.
