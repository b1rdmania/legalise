# Methodology — Legal-tech scored screen + opinionated write-up

> Canonical brief. The Stage A/B engine is shared; the output forks two ways.

## What this is
A scored, opinionated screen of a 20-company shortlist (triaged from the ~120 exhibitors
at a 2026 legal-tech event), producing a ranked verdict and a written piece. **Not** 20
narrative essays — a comparable, evidence-backed, *opinionated* sort that drives what gets
featured and how.

## Why (two purposes, one engine)
The same research engine feeds two write-ups. Build once, fork the output:
1. **Critical piece / talk** — thought-leadership in the builder's own POV/name.
2. **Strategic-options memo for "Stella"** — a legal consultancy positioned for exit,
   building an innovation lab. Framed as *moves for them*: acquire / partner / build-instead /
   white-space.

## Audience & the play
- **Primary reader (Stella's principal): light attention** — top-line verdict scannable in 30s.
- **Secondary (his team): read deep** — want evidence + per-company calls.
- Doubles as a value-demonstration / prototype of the lab's output. Must read as **sharp
  principal-grade judgment**, not a sterile research dump. *The verdicts are the product.*

## Thesis lens
"Legalise/Interstellar": AI as **preparation, accountability, supervised autonomy**.
Skeptical of thin LLM wrappers. Technically-real = agentic, interoperable, lives where lawyers
work (API/MCP/CLI/agent-to-agent, real integrations). Basic = dead.

---

## Stage A — Light facts pass (all 20)
Structured, scoreable fields only; every fact cites a primary/reputable source (URL + access
date). ~5 searches/company.
- Founded · HQ
- Total funding · last round (size+date) · lead investor
- Headcount (approx)
- Named customers (public refs only)
- Key integrations (iManage, Word, SharePoint, Salesforce, …)
- **Agentic/interop signals — API / MCP / CLI / agent-to-agent / integration depth**
- One-line tech model (how it actually works)
- Pricing model
- Name-collision check (confirm the right entity)

**Anti-hallucination rule:** any field not found in a credible source is `unknown` — never
inferred or estimated.

## Stage B — Score all 20
Six dimensions, **0–5 each** (no weighted sub-scores — false precision on judgment calls).
Composite weights the first two heavy (×2), rest light (×1).

| Dimension | Weight | Question |
|---|---|---|
| **Uniqueness / moat** | **×2** | Could a frontier-model vendor ship this in a quarter? |
| **Thesis fit** | **×2** | Preparation / accountability / supervised-autonomy? Agentic + interoperable? |
| Investability | ×1 | Funding momentum, backers, traction (kept light: funding ≠ quality) |
| Defensibility vs incumbents | ×1 | Survives Harvey / iManage / LexisNexis entering? |
| Interoperability | ×1 | Lives where lawyers work, or fights them? |
| Team signal | ×1 | Founder pedigree (public bio only) |

**Outputs:**
- Ranked scorecard (all 20, per-dimension + one-line justification).
- **"Really liked"** = top composite (high Uniqueness + Thesis fit) — includes small-and-real gems.
- **"Interesting but flawed"** = high Uniqueness, **low Defensibility/Team** = teardown candidates.
  (Defined by low defensibility, NOT low investability — small/early is a gem, not a flaw.)

## Non-negotiable discipline
A prior run of this pattern confabulated verdicts on thin evidence and got torched.
- Facts guarded by the citing rules above.
- The two **judgment** dimensions (Uniqueness, Defensibility) are where the agent will guess
  from thin signal — human review focuses *hardest* there.
- **Agent scores and gathers; human renders final verdicts.** Scorecard is scaffolding; the
  opinionated calls are injected at human review. Ship as *the builder's read, evidenced by the
  scorecard* — never an unreviewed table.
- Audience knows this space — one confidently-wrong call destroys credibility. Quality over
  coverage.

## Output structure (layered + forked)
- **One-page map up top** — buckets (really-liked / interesting-but-flawed / dead segment / big
  beasts), the 5 to watch, the avoid-list. 30-second read.
- **Teardowns below** — per-company detail for the team.
- Fork the framing: public **critical-piece** cut (POV, named) vs **Stella strategic-options**
  cut (acquire / partner / build-instead / white-space).

## Cut
No Stage C narrative deep-dives (founder bios, competitor maps, burn-vs-valuation). Written
straight from the reviewed scorecard.

## Mechanics
- Parallel agents (~4 companies each) write structured JSON to disk; orchestrator context stays lean.
- Consolidate → scorecard → **human review (focus judgment dims)** → write.
- Every external claim carries source + access date; unverifiable = flagged, not asserted.
