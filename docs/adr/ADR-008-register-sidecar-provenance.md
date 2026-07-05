# ADR-008 — The register sidecar: three-grade provenance for external exports

**Status:** Accepted and merged (PR #227, migration 0035). Strategic scope
deliberately narrowed 2026-06-24 — read the whole ADR before extending it.
Grade semantics corrected in PR #256 (2026-07-05, trust-spine audit finding
F1): the original two-grade scheme granted `verified_at_source` on an
*unchecked* manifest hash, so a manifest-only import with arbitrary hashes
rendered as verified. The fix adds a third grade and makes verification a
precondition of the word "verified".

## Context

The register pivot (ratified 2026-06-12): Legalise is "not another AI
workspace — the register underneath them". If the governance layer only
governs work produced *inside* Legalise, it is a workspace feature. To be a
register, it must be able to supervise exports from *other* tools. Mike
(MikeOSS, Will Chen's open-source Harvey-parity workspace) is the first
adapter and the proof-of-concept target; a companion PR (willchen96/mike#181)
adds content hashes to Mike's exports so they can arrive verifiable.

## Decision

- `backend/app/core/external_pack.py` (mounted at `/api/external`) ingests an
  external workspace export via an **adapter registry** (Mike first) into an
  **external matter that is read-only**: created `C_paused`, no model calls,
  no skills. Documents land as WORM artifacts; ingestion writes an
  `external.pack.ingested` audit row. Sign-off and the M13 supervision
  machinery apply to external packs unchanged.
- **Three-grade provenance, recorded per document** — an honesty boundary,
  not a quality score (`external_pack.py`, `HASH_*` constants). Ranked by
  real epistemic strength:
  - `verified_at_source` — the export manifest carried a source-side content
    hash (e.g. a Mike export post-#181), the document bytes ALSO travelled
    (ZIP present), and re-hashing them at ingest matched the claim. **This is
    the only grade granted by an actual check.** A source hash without bytes
    can never earn it.
  - `attested_at_ingest` — bytes travelled; we hashed them at ingest. The
    claim starts at our door, and says so. When the manifest also carried a
    source hash that disagrees with the received bytes, the document lands
    here with `hash_mismatch=true`: the canonical hash is the one this
    workspace computed over bytes it holds, the failed claim is preserved as
    `source_sha256`, and the mismatch is counted and rendered in seal tone on
    the register face. Recorded, never repaired — ingest does not refuse a
    tampered pack, because refusing would discard the evidence.
  - `claimed_by_source` — the manifest carried a source hash but no bytes,
    so nothing was checked. The hash is preserved verbatim as the source's
    own claim, and the register face labels it "Claimed by source —
    unchecked".

  The grade states *which claim is being made*, never upgrades itself, and is
  surfaced on the register face. No schema churn was needed: grades live in
  artifact/audit JSON payloads, not a DB enum.
- **Boundary rules (standing maintainer rule):** only the content-hashes PR
  (#181) ever goes to Mike's upstream repo. The sidecar/register/supervision
  layer is never PR'd into Mike (AGPL — never copy Mike code either).
  Building supervision *inside* another workspace destroys the register's
  independence value ("a workspace certifying its own output is marking its
  own homework") and gives the moat away under AGPL. The surviving strategic
  form is: Mike (and peers) as customer-zero of an *independent* register.
- Strategic status: the code is clean and live; the *thesis* is deliberately
  parked pending a demand signal (nobody in the user intersection asked for
  it yet). Don't delete it; don't extend it speculatively either.

## Consequences

- Legalise can answer the four questions about work it didn't produce — the
  claim that makes "register underneath them" more than copy.
- An interchange-manifest proposal exists (docs/REGISTER_SIDECAR.md) for
  source systems that want `verified_at_source` natively.

## What not to change, and why

- **Never collapse the provenance grades**, and never let a grade render as
  more than it proved. In particular: `verified_at_source` requires a check
  that actually ran (source hash + received bytes + match) — granting it on a
  manifest hash alone is the exact bug fixed in PR #256, and reintroducing it
  lets an importer mint "verified" from an unchecked self-asserted string.
  The distinction IS the honesty of the register; blurring it is the one
  refactor that turns a register into marketing.
- **Never make external matters writable / model-callable / skill-enabled.**
  Read-only C_paused is what makes the supervision independent of the tool
  being supervised.
- **Never push governance code to Mike's upstream** (only #181-class hash
  plumbing, and only with explicit instruction). The independent-register
  position is the strategy.
