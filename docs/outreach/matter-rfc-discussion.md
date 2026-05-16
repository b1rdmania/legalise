# Draft — GitHub Discussion body for matter wire-format RFC

**Where to file:** `https://github.com/b1rdmania/legalise/discussions/new`
**Category:** Ideas / RFCs (whichever exists on the repo)
**Title:** Community matter wire format — RFC for peer-builder workspaces

---

## Body

Open-source legal AI workspaces are converging on the same primitive — a
**matter**: a slug, a title, a status, parties, key dates, documents,
audit. Stella, Mike, and Legalise have each implemented this in their
own way. The shape overlaps enough that documents and matter metadata
*could* move between workspaces, but no portable wire format exists yet.

This Discussion proposes a minimal cross-workspace matter wire format,
Apache-2.0, designed so any of the three projects (and anyone else
building in this space) can import / export matters without losing
information that matters.

### The draft

The schema lives at `schemas/matter.json` in this repo
([link](https://github.com/b1rdmania/legalise/blob/master/schemas/matter.json)).
It's a JSON Schema draft 2020-12 document.

Required core fields (the portable minimum):

- `slug` — string, scoped per-user
- `title` — string
- `status` — enum: `open | closed | archived`
- `parties` — `{client, opposing[], additional[]}`
- `opened_at` — ISO 8601 date
- `closed_at` — optional ISO 8601 date
- `key_dates[]` — `{label, date}` — flexible per matter type

Optional extension fields (jurisdiction-pack territory):

- `privilege_posture` — Legalise-specific, three-state enum, will live in a UK / E&W extension pack
- `proceedings_ref` — court / tribunal case reference
- `side` — enum: `claimant | defendant | respondent | applicant`
- `case_theory`, `pivot_fact` — Legalise narrative fields
- `retention_until` — Legalise retention field
- Whatever your workspace cares about that isn't in the core — extensions are first-class

### What's intentionally minimal

- **No body content in the matter wire.** Documents travel as a sibling
  folder (`documents/{sha}/...`) with their own metadata; the matter
  references SHAs.
- **No audit log in the wire.** Audit is per-workspace; on import, the
  receiving workspace logs `matter.imported` and starts a fresh trail.
- **No user objects.** The wire format is identity-free at the matter
  level. Permission shape (private / shared / org-readable) is the
  receiving workspace's concern.

### What I'd love peer-builder input on

- Whether the core six fields are right. Anything missing that *every*
  workspace would want?
- Whether `key_dates[]` should be a structured enum (EDT, Day A, Day B,
  ACAS certificate, primary limit, etc.) or stay free-form label+date.
  UK ET work has well-defined dates; civil litigation less so;
  jurisdiction-pluralist workspaces (Stella) need free-form. Probably
  free-form-with-recommended-keys is the answer.
- Whether `parties.client` / `parties.opposing` is the right shape for
  matters with multiple co-claimants, joinder, third-party intervention.
- License: Apache-2.0 for the schema itself. Counter-proposals welcome.

### Adjacent open-source projects building in this space

- **Stella** ([github.com/stella/stella](https://github.com/stella/stella))
  — production-grade workspace with tabular review (Folio); document
  anonymisation + case-law research on roadmap. Apache-2.0. Jan Kubica
  maintains.
- **Mike** ([github.com/willchen96/mike](https://github.com/willchen96/mike))
  — fast-shipping OSS legal AI platform with track-changes editing and
  tabular reviews. AGPL-3.0. Will Chen maintains.

This RFC isn't an attempt to standardise unilaterally. It's a proposal
to start the conversation. If a different shape lands across the three
projects, that's a win — the goal is interop, not authorship.

---

*Filed by Andy Bird ([@b1rdmania](https://github.com/b1rdmania))
on launch day. Comments, counter-proposals, and forks of the schema
all welcome.*
