# Handover: open-source contribution restructure (2026-07-08)

Goal: make external contribution a designed surface, not an accident.
The architecture already supported it (manifest v2 with `community`
visibility, trust ceremony, prompt-runtime skill import, agent-kit
evals). What was missing was the on-ramp. This work order adds it and
lists the GitHub-side actions still to run.

## Shipped in this change

- `.github/ISSUE_TEMPLATE/` — bug report, skill submission, eval case
  proposal, practitioner feedback (auto-applies `provenance:practitioner`),
  config with private security-report link.
- `.github/PULL_REQUEST_TEMPLATE.md` — house checklist (tests, citations,
  audit/posture, voice check, catalogue rules).
- `docs/CATALOGUE.md` — community skill index. Skills stay in authors'
  repos; listing is a one-row PR. Seeded with `b1rdmania/pre-motion`.
- `docs/BUILDING_SKILLS.md` — evening-sized authoring guide:
  SKILL.md, local import, trust ceremony, sample-matter test,
  citation verification, listing.
- `CONTRIBUTING.md` — "Ways in, easiest first" ladder at the top
  (feedback, eval cases, skills, docs, core).
- `README.md` — Contributing section pointing at the ladder and
  catalogue.

## Design decisions

- **Contribution unit = catalogue row + eval row, not core code.**
  Users of a legal tool are practitioners, not PR authors; the ladder
  gives them a no-code rung (feedback issues) and gives builders an
  evening-sized rung (skills in their own repos, indexed here).
- **Catalogue in-repo** so each listing is a merged PR from an external
  contributor: community signal that accrues to this repo.
- **A listing is not an endorsement**; the ceremony still runs on every
  import. Stated in CATALOGUE.md.

## Still to do (GitHub-side, needs maintainer)

1. Create a `skill-catalogue` and an `evals` label (templates reference
   both):
   ```bash
   gh label create skill-catalogue -R b1rdmania/legalise --color 5319e7 --description "Community skill catalogue listings"
   gh label create evals -R b1rdmania/legalise --color 0e8a16 --description "agent-kit eval cases"
   ```
2. Seed good-first-issues (drafts below), label them
   `good first issue` + `help wanted`.
3. Pin the pre-motion catalogue row to a commit SHA.
4. Enable GitHub Discussions if feedback volume warrants it (optional).
5. Announce: the ladder gives the LinkedIn/X post a concrete CTA
   ("PR one eval row" / "list your skill").

## Good-first-issue drafts

Review, edit, then create. Each is deliberately evening-sized or
smaller.

```bash
gh issue create -R b1rdmania/legalise \
  --title "Eval: B_mixed posture rows for posture_refusal" \
  --label "evals,good first issue,help wanted" \
  --body "dataset.jsonl covers C_paused (refuses), A_cleared (allows), and unknown-posture fail-closed. Add rows pinning the B_mixed contract of core/posture_gate._evaluate_posture so a future change to mixed-posture handling trips an eval, not a user. Data-only PR; shape of existing rows in evals/agent-kit/dataset.jsonl. See evals/agent-kit/README.md for how to run."

gh issue create -R b1rdmania/legalise \
  --title "Eval: retrieval_grounding negative case (no matching documents)" \
  --label "evals,good first issue,help wanted" \
  --body "Add a dataset.jsonl row for retrieval_grounding where the query matches nothing in the Khan sample matter, asserting source_count 0 and well_formed true. Pins the empty-result contract of core/retrieval.search_documents. Data-only PR."

gh issue create -R b1rdmania/legalise \
  --title "Skill wanted: limitation checker (Limitation Act 1980)" \
  --label "skill-catalogue,good first issue,help wanted" \
  --body "A prompt-runtime skill that reads the matter chronology and flags limitation issues: cause of action accrual, applicable period (Limitation Act 1980 ss 2, 5, 11, 14A), s 33 discretion factors where relevant. Output is a draft limitation analysis for solicitor review. Build it in your own repo per docs/BUILDING_SKILLS.md, then list it in docs/CATALOGUE.md. Legal drafting matters more than code here; practitioners especially welcome."

gh issue create -R b1rdmania/legalise \
  --title "Skill wanted: pre-action protocol compliance reviewer" \
  --label "skill-catalogue,good first issue,help wanted" \
  --body "A skill that reads correspondence in a matter and checks a letter of claim against the relevant Pre-Action Protocol (start with the Practice Direction on Pre-Action Conduct and the Debt Protocol): required content present, response windows stated correctly, proportionality of threatened steps. Draft output for solicitor review. docs/BUILDING_SKILLS.md has the authoring path."

gh issue create -R b1rdmania/legalise \
  --title "Skill wanted: witness statement compliance check (CPR 32 / PD 57AC)" \
  --label "skill-catalogue,good first issue,help wanted" \
  --body "A skill that reviews a draft witness statement for PD 57AC compliance in Business and Property Courts matters: statement of own knowledge vs belief, documents referred to, the required confirmations, opinion/argument creep. Output flags issues with rule citations for the supervising solicitor. Build in your own repo, list via docs/CATALOGUE.md."

gh issue create -R b1rdmania/legalise \
  --title "Docs: trust-ceremony walkthrough screenshots for BUILDING_SKILLS.md" \
  --label "documentation,good first issue,help wanted" \
  --body "docs/BUILDING_SKILLS.md describes the import and 7-step inspection in text. Add captioned screenshots (or a short GIF) of importing a skill by GitHub URL and walking the ceremony, using the example skill or pre-motion. Pure docs PR; run the stack per CONTRIBUTING.md."
```

Existing issues worth relabelling for visibility: #244 (DocumentDetail
god-file split) as `help wanted`; #194 (refactor remainders) as
`good first issue` if the E5/E7 helpers are genuinely self-contained.

## Follow-up (added at review)

Two catalogues now exist: the in-product Skill library (Lawve feed +
GitHub import) and docs/CATALOGUE.md. Cross-links ship in this change
(the library's GitHub-repo cell points at the community catalogue; the
catalogue explains the in-app import path). The real convergence, when
community listings grow: teach the product's catalogue endpoint to read
docs/CATALOGUE.md as a source, so the repo file becomes the canonical
community feed and the two surfaces cannot drift.
