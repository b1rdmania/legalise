<!-- One conceptual change per PR. Why, not just what. -->

## What and why

## Checklist

- [ ] Backend changes have tests; frontend type-checks and builds (`npm run build`)
- [ ] Any legal assertion cites authority (statute short title + section, CPR Part, neutral citation), verified manually even if AI-drafted
- [ ] New or changed model-calling paths write audit rows and respect `Matter.privilege_posture`
- [ ] Voice check on touched chrome strings and docs: `rg -n "—|–" frontend/src/ README.md docs/*.md` returns nothing new
- [ ] Catalogue rows only: skill repo is public, SKILL.md at the stated path, ground rules in `docs/CATALOGUE.md` met

<!-- By submitting, you agree to the CLA terms in CONTRIBUTING.md. -->
