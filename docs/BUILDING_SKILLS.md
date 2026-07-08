# Building a skill

A Legalise skill is a public GitHub repo with a `SKILL.md` at the root.
You own the repo; Legalise imports it at a pinned commit, converts the
frontmatter into a governed module draft, and walks it through the
trust ceremony before anything runs. No code from your repo executes:
imported skills are prompt-runtime, meaning your instructions become
the system prompt inside the full governance seam (posture gate, read
grants, advice boundary, invocation audit, provider call, model audit,
write grants, artifact write, completion audit).

An evening is enough. The work is legal, not infrastructural: a good
skill is a well-scoped instruction set with verified citations.

## 1. Write the SKILL.md

Frontmatter first, instructions after:

```markdown
---
name: limitation-checker
description: Flags limitation issues in an E&W civil matter from the chronology and pleadings.
metadata:
  version: 0.1.0
---

You are preparing a limitation analysis for solicitor review...
```

`name` and `description` are what the importer reads; keep them exact.
The body is your prompt. House rules that apply to the body:

- England & Wales only. Statutes by short title and section
  (Limitation Act 1980, s 11), rules by CPR Part, cases by neutral
  citation.
- The output must present itself as a draft for a named solicitor to
  review and sign. Do not soften this.
- Say what the skill reads (documents, chronology) and what it
  produces, so the manifest draft declares honest capabilities.

## 2. Import it locally

Run the stack (`docker compose -f infra/docker-compose.yml up --build`,
see [CONTRIBUTING.md](../CONTRIBUTING.md)), then import your repo by
URL from the Skills surface. Accepted shapes:

- `https://github.com/you/your-skill` (SKILL.md at the root)
- `https://github.com/you/your-skill/tree/<ref>/<path>` (SKILL.md under a subdirectory)

The importer pins the commit SHA for provenance and builds a
manifest-v2 draft. It arrives as a draft, never installed.

## 3. Walk the trust ceremony

Enabling the draft runs the inspection: manifest, signature, publisher,
permissions, data movement, gates, then trust and grant. Unsigned
community skills take the full 7-step path by design. Read what it
shows you; if the permission step surprises you, your frontmatter is
claiming more than the skill needs.

## 4. Test against the sample matter

The Khan v Acme matter seeds on signup. Run your skill against it,
read the output as if you were the supervising solicitor, and check the
Activity tab shows the invocation and model audit rows.

## 5. Verify every citation

Manually. Every statute, rule, and case your prompt references or your
output tends to produce. AI-assisted drafting is welcome;
AI-fabricated authority is the one thing that gets a catalogue listing
pulled without discussion.

## 6. Get listed

Open a [skill submission issue](https://github.com/b1rdmania/legalise/issues/new?template=skill_submission.yml),
then PR one row to [`CATALOGUE.md`](./CATALOGUE.md). The maintainer
imports your skill at the pinned ref and checks the ground rules before
merging.

## Native modules are different

Skills are the community surface. Native Python modules
(`backend/app/modules/`) are core substrate: they need tests, audit
integration, and a discussion issue first. If your idea needs code
rather than a prompt, start with an issue; `examples/modules/` shows
the shape a native module takes.
