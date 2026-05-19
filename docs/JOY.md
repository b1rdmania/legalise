# JOY.md — Calm Power Doctrine

> Joy in Legalise does not mean playful. It means a solicitor feels
> unusually in control while AI does useful work.

This is the product-feel doctrine. `DESIGN.md` defines visual and
interface rules; this doc defines what *good* feels like when someone
uses Legalise. When the two conflict, design serves joy, not the other
way round.

## The Core Loop

The shape of every well-formed interaction with Legalise:

1. Open a matter.
2. The workspace already understands the file.
3. Ask a question or run a module.
4. Legalise produces something useful.
5. It shows what it used.
6. It shows what it changed.
7. It writes the audit trail.
8. The solicitor feels safe to keep working.

Every surface should be reachable from somewhere on that loop, and
every surface should leave the user closer to step 8 than when they
arrived. If a screen breaks that flow, the screen is wrong, not the
flow.

## Product Rules

These are not suggestions. They are the floor every surface clears
before it ships.

- Every AI answer should expose sources.
- Every AI action should offer a next action.
- Every privileged operation should leave an audit trail.
- Every blocked state should explain why and how to unblock.
- Every module should say what it reads, what it writes, and whether
  it is available.
- Every demo matter should open in a ready state, not an empty state.
- Never show raw backend errors to users.
- Never show fake controls. Wire it, lock it, or hide it.
- Use legal language, not SaaS fluff.
- Make trust visible but quiet.

## Required Patterns

### Matter Pulse

The Assistant landing for any matter should show, at a glance:

- documents extracted
- chronology events
- workflows available
- audit rows
- privilege posture

The pulse exists because step 2 of the loop ("the workspace already
understands the file") is the moment a solicitor decides whether to
keep using the product. If the workspace cannot demonstrate that it
has read the file, the user falls out of the loop before step 3.

### Suggested Actions

Every matter should show three useful first actions on landing. Not
generic ("Ask anything"). Concrete and matter-shaped ("Draft an LBA
for the dismissal", "Summarise the witness statement", "Run a
pre-motion against the conduct framing").

### Source Chips

Citations should be human-readable and clickable. `Document ·
synthetic-mutual-nda.docx` and `Event · 12 Mar 2026`, not raw IDs or
debug-style markers. Solicitors recognise documents by filename and
events by date; that is the surface they should see.

### Audit Confirmation

After AI work completes, surface "Audit row written" quietly. Not a
toast. Not a modal. A small inline confirmation that the trust layer
fired. The audit is the contract; the user needs to see it without
being interrupted by it.

### Module Cards

Every module card must show:

- reads (what data it touches)
- writes (what it produces)
- last run (provenance)
- availability (granted, partial, blocked, not-installed; posture
  blocking explained)
- primary action

Module cards are the marketplace surface. They have to read as
trustworthy claims, not specsheets.

## Anti-Patterns

These break joy. If you find one in the product, file it as a bug.

- Empty dashboards.
- Raw HTTP errors.
- Debug IDs as primary labels.
- AI prose with no source trail.
- "Ask me anything" as the only prompt.
- Buttons that do not do anything.
- Trust copy that requires reading paragraphs.
- Decorative delight that makes legal work feel unserious.

## What Joy Is Not

Joy is not a rounded corner, a celebration toast, a coloured icon, or
a witty empty state. The visual register in `DESIGN.md` is austere on
purpose. Solicitors do not need to be cheered up; they need to be
trusted with information and to trust the system handing it to them.

Joy in Legalise is the feeling of clicking into a matter at 7pm on a
Sunday, asking a real question, and getting a real answer with real
sources, fast, with an audit trail you can hand to a regulator. That
is what we are optimising for. Everything else is decoration.

## Related

- `DESIGN.md` — visual and interface rules (v0.4 FROZEN).
- `MANIFESTO.md` — product positioning and why this exists.
- `ARCHITECTURE.md` — how the trust layer is actually wired.
