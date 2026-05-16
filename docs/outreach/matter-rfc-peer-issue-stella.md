# Draft — Issue on stella/stella for matter wire-format RFC

**Where to file:** `https://github.com/stella/stella/issues/new`
**Title:** Cross-workspace matter portability — RFC at <link>, welcoming counter-proposals

**Filing context for Andy:**
- DM Jan on X first with a heads-up that this is coming + the link
- File the Issue 24-48 hours after the heads-up so Jan isn't ambushed
- Add no labels; let Jan label it
- Subscribe to the issue so you see any reply fast

---

## Body

Hi Jan — Andy here (`@b1rdmania`).

I've just published an RFC proposing a community wire format for
matters across open-source legal AI workspaces. The draft is at:

- Schema: https://github.com/b1rdmania/legalise/blob/master/schemas/matter.json
- Discussion: https://github.com/b1rdmania/legalise/discussions/<id-after-filing>

Stella, Mike, and Legalise each have a matter primitive with the same
rough shape. The RFC is a first cut at a portable schema; the goal is
that a matter could be exported from one workspace and imported into
another without information loss in the core fields, with
workspace-specific fields living in extension packs.

A few things I'd particularly value Stella's perspective on:

- **Free-form vs structured `key_dates[]`.** UK ET work has a small set
  of well-defined dates (EDT, ACAS Day A, Day B, primary limit). For
  jurisdiction-pluralist workspaces like Stella, that structure
  doesn't generalise. I've gone free-form-with-recommended-keys, but
  if Stella's existing matter model has a different shape, I'd rather
  align with you than fork unnecessarily.

- **The parties shape.** I've gone with `{client, opposing[],
  additional[]}` — enough for the typical adversarial-matter case but
  not necessarily right for transactional / corporate matters where
  "client" and "opposing" don't apply cleanly. Curious how Stella
  handles this.

- **Whether to publish a matching schema on Stella's side**, or
  whether you'd prefer to land on a shared schema we both reference.
  Either works; I'd love to know which is easier for you.

No pressure on timeline — happy to iterate, happy to fork the schema
if you'd rather propose a counter, happy to leave it as just-Legalise
if Stella's matter model is far enough away that interop isn't worth
the complexity.

Apache-2.0 on the schema. Permissive on everything.

Thanks for everything Stella's putting into the open-source legal AI
space, Jan.

— Andy
