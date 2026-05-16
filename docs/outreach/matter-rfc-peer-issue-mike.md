# Draft — Issue on willchen96/mike for matter wire-format RFC

**Where to file:** `https://github.com/willchen96/mike/issues/new`
**Title:** Cross-workspace matter portability — RFC at <link>, welcoming counter-proposals

**Filing context for Andy:**
- DM Will first (whatever channel is warm — X, Discord, email) with
  the heads-up. Tone: peer-builder, not pitch.
- File the Issue 24-48 hours after the heads-up.
- Note Mike has 45+ open issues; this one will get some attention
  given the topic. Be ready to engage in the comment thread.
- Mike is AGPL-3.0, Legalise is Apache-2.0. The schema is
  Apache-2.0 — Mike can absorb it freely. Worth mentioning if it
  comes up.

---

## Body

Hi Will — Andy here (`@b1rdmania`).

I've published an RFC proposing a community wire format for matters
across open-source legal AI workspaces. Draft at:

- Schema: https://github.com/b1rdmania/legalise/blob/master/schemas/matter.json
- Discussion: https://github.com/b1rdmania/legalise/discussions/<id-after-filing>

You've got Projects as the matter-equivalent in Mike, with
`shared_with` for per-email sharing and the `cm_number` field for
client/matter numbers. The RFC's core fields overlap with most of
that. Where they diverge is the regulatory-shape stuff (privilege
posture, retention, side) — I've put those in optional extension
packs rather than the core, on the theory that not every workspace
wants opinion on those fields.

A few things I'd particularly value Mike's perspective on:

- **`shared_with` semantics.** Mike does per-email sharing on
  projects; Legalise does per-user slug tenancy with no native
  sharing in v0.1. The schema doesn't currently carry a `shared_with`
  field because I wasn't sure whether to land it as core or as a
  permissions extension. Curious which side you'd put it on.

- **`cm_number`.** Useful real-world field for matters in firms with
  CM systems. I haven't included it in the core because not every
  matter has one, but if Mike (and any firm-shaped consumer of the
  schema) wants it core, easy add.

- **License posture.** The schema itself is Apache-2.0 — Mike can
  absorb it freely under AGPL without contamination. The RFC is a
  community proposal, not a Legalise hill. If you want to propose a
  counter or fork the schema and run it under Mike's banner, I'd
  rather we end up with one shared format than two parallel ones.

I noticed Issue #33 (workflow packs with `jurisdiction` / `language`
/ `version`) and #55 (privilege / sovereignty / DMS) — both touch on
the same "structure that lets jurisdiction-specific layers ride on
top of a portable core" question this RFC is trying to answer. Happy
to coordinate.

Apache-2.0 on the schema. No pressure on timeline.

Thanks for everything Mike's doing for OSS legal AI, Will.

— Andy
