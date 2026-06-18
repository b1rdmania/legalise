# LegalTechTalk 2026 — Floor Teardown

> **Start here:** [`outputs/REPORT.md`](./outputs/REPORT.md) — the narrative front door (hook, thesis, picks, direction). This README is the process/doctrine layer behind it.

A first-hand, source-anchored teardown of the LegalTechTalk 2026 exhibitor
floor (InterContinental London – The O2, 17–18 June 2026). Triage the whole
floor, kill the dead weight, dissect the interesting ones (model,
interoperability, funding, why it's interesting, where it's flawed), and name
the five worth watching — published as a standalone microsite.

This is a research / opinion artifact. It is **not** part of the Legalise
product; it lives on a research branch for convenience and will be lifted to
its own repo for the public deploy.

## Decisions locked
- **Voice:** named and brutal, public. Picks *and* kills are named.
- **Format:** standalone static microsite, content as structured JSON,
  source-tier visible on the page.
- **Universe:** closed. Every company maps to a real booth in
  [`dataset/exhibitors.json`](./dataset/exhibitors.json) (Tier-1 ground truth,
  transcribed from floor-plan photos). No vendor enters the report otherwise.

## The non-hallucination doctrine
Every claim in the report is visibly one of three tiers, never blurred:

1. **Observed (Tier 1)** — what Andy saw / was told at the booth.
2. **Vendor claim (Tier 2)** — from the company's site / deck / booth
   marketing. Labelled as marketing, never as fact.
3. **Verified (Tier 3)** — independent third-party source, with a URL **and**
   an access date.

A Tier-2 claim never silently graduates to Tier-3. Anything without a source is
stated as "vendor claims" or omitted — never asserted as fact.

## The legal shield (because the voice is brutal)
Under the Defamation Act 2013 (England & Wales), **honest opinion** is
defensible when it is clearly comment and rests on disclosed, true facts.
False **statements of fact** are not. So every kill is structured as:

> **[disclosed facts — Tier-3 cited] → therefore [honest opinion, clearly marked].**

"A thin model wrapper with no defensible moat" = protected comment.
"They have no paying customers / are nearly out of runway / faked their
valuation" = a factual claim that needs a Tier-3 source or does not ship.

## Pipeline
- **Pass 0 — Universe.** `dataset/exhibitors.json`. ✅ done.
- **Pass 1 — Triage.** Every booth → `kill / watch / deep-dive` + one-line
  rationale, against the rubric in [`methodology.md`](./methodology.md).
  Output: `dataset/triage.json`.
- **Pass 2 — Deep-dive.** 10–15 companies, same five fields each, every
  Tier-3 claim cited. Adversarial verification pass falsifies claims and
  catches company-name collisions.
- **Pass 3 — Picks + thesis.** The five, and the essay tying them to a POV.
- **Pass 4 — Microsite.** Static build from the JSON.

## Layout
```
research/legaltechtalk-2026/
  README.md            this file
  methodology.md       doctrine, legal shield, triage rubric, taxonomy
  dataset/
    exhibitors.json    Pass 0 — closed universe (Tier-1)
    triage-schema.json Pass 1 — record schema + worked examples
    triage.json        Pass 1 — output (populated by the triage run)
```
