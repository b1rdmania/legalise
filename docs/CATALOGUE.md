# Community skill catalogue

Skills for Legalise live in their authors' own repositories and import
through the trust ceremony at a pinned commit. This file is the index.
Listing here is a one-row PR; the skill itself never enters this repo.

**A listing is not an endorsement.** Every import runs the full
inspection ceremony regardless of what this file says, and every output
is a draft for solicitor review. The maintainer checks that a listed
skill imports cleanly and meets the ground rules below at the pinned
ref, nothing more.

## Ground rules for listing

1. England & Wales. Every legal assertion cites authority: statutes by
   short title and section, rules by CPR Part, cases by neutral
   citation.
2. The SKILL.md states plainly that output is a draft for solicitor
   review. Nothing softens the sign-off assumption.
3. Prompt-runtime only. The skill declares what it reads and writes in
   its frontmatter; it does not ask users to run scripts.
4. Citations verified manually by the author, including any drafted
   with AI assistance. AI-fabricated authority gets a listing pulled.
5. Public repo, importable at the stated ref via GitHub import.

To use a listed skill: in the app, open Skill library, choose "Any
public GitHub repo", and paste the skill's repo link. The import runs
the full trust ceremony before anything can run.

To list a skill: open a
[skill submission issue](https://github.com/b1rdmania/legalise/issues/new?template=skill_submission.yml)
for pre-flight, then PR a row to the table below. Authoring guide:
[`BUILDING_SKILLS.md`](./BUILDING_SKILLS.md).

## Skills

| Skill | Author | What it does | Pinned ref |
|---|---|---|---|
| [pre-motion](https://github.com/b1rdmania/pre-motion) | [@b1rdmania](https://github.com/b1rdmania) | Adversarial premortem for E&W civil litigation: builds the strongest version of a case, then attacks it from four angles to find where it loses. | `main` (pin on import) |

## Reference implementations (in-repo, not importable)

[`examples/modules/`](../examples/modules/) holds Contract Review,
Pre-Motion, and example-tab as reference implementations of the
governance order. They show the shape; they are not installed modules.
