# Contributing

Thanks for considering a contribution.

## Ground rules

1. **Solicitor-in-the-loop is the design assumption.** Every output is a draft. Don't soften this.
2. **Every legal assertion cites authority.** Statutes by short title and section. Rules by CPR Part. Cases by neutral citation.
3. **Audit and privilege are first-class.** New modules must integrate with `app/core/audit.py` and respect `Matter.privilege_posture`. Don't bypass either.
4. **UK-jurisdiction only.** This codebase is England & Wales. Scottish / NI / US contributions belong in separate forks or sibling projects.
5. **Boring stack stays boring.** Don't introduce a new database, new framework, or new language without an issue and discussion first.

## Pre-build state

The repo is currently in pre-build state — plan and skeleton only. Once Week 1 of the build begins, this CONTRIBUTING file will be updated with concrete PR conventions, test requirements, and review process.

For now, the best contribution is a thoughtful issue critiquing the plan documents. Read `EXECUTIVE_SUMMARY.md`, `BUILD_PLAN.md`, `ARCHITECTURE.md`, `SCOPE.md`, `ROADMAP.md`, and `REGULATORY_PLUMBING.md`, then open an issue with structural feedback.

Stack alternatives, scope objections, regulatory plumbing concerns, and three-week-timeline pushback are all welcome. The build is solo for v0.1 but the plan benefits from outside eyes.

## CLA

This project will use a Contributor License Agreement to allow the maintainer to dual-licence the code in future for commercial distribution. By submitting a PR you agree your contribution is licensed under Apache 2.0 *and* granted to the project under terms that permit future relicensing.

## AI-generated contributions

AI-assisted code is welcome. AI-fabricated authority is not. If you used an LLM to draft a module, verify every legal citation and every statutory reference manually before submitting.

## Issues

For:

- Plan critique — structural feedback on the docs in this directory.
- Architecture pushback — disagreements with stack / scope / timeline calls.
- Coverage gaps — modules you'd want to see in v0.2+.
- Corrections — links to authority that says the plan is wrong.

## Code of conduct

Be civil. Disagree with reasoning, not people.
