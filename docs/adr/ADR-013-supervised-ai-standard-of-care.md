# ADR-013 — Supervised AI built to the UKJT standard of care

**Status:** Accepted (positioning + design rationale). External authority, not a code change.

## Context

The UK Jurisdiction Taskforce published its *Legal Statement on Liability for
AI Harms* (LawtechUK, 2026), with a foreword by Sir Geoffrey Vos — Master of
the Rolls and the most senior civil judge in England & Wales (he also chairs
the UKJT). It is not binding law, but it is the most authoritative account that
exists of how English private law applies to AI harm, and judges will lean on
it.

Its holdings bear directly on why Legalise is built the way it is:

1. **No new AI-specific regime.** Existing negligence and contract already
   cover AI. The standard is unchanged: *reasonable skill and care*.
2. **Professionals carry the duty (§B.4).** A professional can be negligent for
   "using an unsuitable model, for failing to conduct proper due diligence, or
   for failing to test AI or **validate its outputs effectively**" — and can be
   negligent for *not* using AI where a competent peer would have.
3. **Liability sits with the deployer, not the frontier lab.** A Foundation
   Model Developer is "unlikely" to be liable for downstream harm; the careless
   user and the applied-tool builder are where it lands.
4. **False statements (§C).** The core negligence is usually the careless
   *acts* (design, testing, deployment decisions) behind an AI's output, not
   the careless *words* themselves.

Source is banked in personal memory (`ukjt-ai-liability-statement.md`); the PDF
is a downloaded copy, not in-repo by default.

## Decision

Treat the UKJT standard of care as the external spec Legalise is built to, and
say so in positioning:

- **Grounding + verbatim citation** answer §B.4's "validate its outputs
  effectively" — retrieval-anchored, honestly-labelled output (see ADR-006,
  and the keyless extractive fallback in ADR-001) means a claim traces to a
  source rather than being trusted on faith.
- **Author/signer legibility + audit hash chain** (ADR-003, ADR-002) answer the
  "who did the diligence, who signed" question the standard turns on.
- **BYO-key, no intermediation** (ADR-001) matches the holding that liability
  sits with the *deploying firm* as data controller — Legalise manages the
  firm's risk without stepping into the model-access path.

Net: the design maps onto the standard of care an external authority — the
Master of the Rolls — has now set out. That is a positioning asset, not just an
engineering one.

## Consequences

- Public copy may cite the Statement as the authority that blesses the
  supervised model — **but public copy is a gated surface** (frozen during
  substrate work). Confirm the gate is open before touching legalise.dev.
- House voice applies: state the claim plainly, no regulatory-landscape
  throat-clearing.
- The same rationale applies to the Atlas/dealroom DD engine (grounding +
  reviewer sign-off) — cross-referenced there.

## What not to change, and why

- **Do not overclaim the authority.** It is a Legal Statement, not binding law;
  Vos is the most senior *civil* judge (not the Lord Chief Justice); and he
  chairs the UKJT that produced it. Keep those precise.
- **Do not weaken grounding/labelling to look slicker.** The honest-labelling
  and source-tracing are precisely what discharge the standard of care — they
  are the product, not friction to sand off.
