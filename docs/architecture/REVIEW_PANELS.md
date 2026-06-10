# Review Panels

Review panels are Legalise's user-facing name for multi-perspective
model work inside a governed skill.

This deliberately avoids the public word "agent". A solicitor does not
need a cast list of autonomous workers. They need to know which review
perspectives were applied, what each one checked, what evidence it
relied on, and how disagreement was resolved before sign-off.

## Definition

A **Review panel** is a named set of review perspectives attached to a
skill run. Each perspective is one or more model calls with a narrow job,
for example:

- `evidence reviewer` — finds supporting source text;
- `counter-evidence reviewer` — finds facts that weaken the draft;
- `risk reviewer` — checks legal, procedural, or commercial risk;
- `source verifier` — checks that quoted text appears in the source;
- `synthesiser` — resolves conflicts and writes the final draft.

Internally these may still be implemented as pipeline stages, model
calls, subprocesses, or classes currently named `Agent`. The product
surface says **Review panel**.

## UI Contract

When a skill uses a review panel, the UI should show:

1. Panel name.
2. Current phase or completed phase.
3. Number of model calls or checks completed.
4. Any blocking failure.
5. Link or anchor into the Record once persisted.

Do not show fictional people, job titles, avatars, or autonomous worker
claims. The panel is a quality-control structure, not a law firm.

## Record Contract

Each review-panel run must be reconstructable from the Record:

- skill run id;
- panel id and version;
- perspective id;
- model/provider used;
- source documents or anchors consulted;
- findings, challenges, and synthesis decisions where emitted;
- verification pass outcome;
- errors and retries.

This can be represented initially as existing `model.call`,
`module.capability.invoked`, and `module.capability.completed` rows plus
structured payload fields. A later migration can promote panel events to
dedicated audit action constants if the pattern repeats across skills.

## Fit With Existing Native Modules

Pre-Motion already has the shape:

- optimistic analyst;
- evidence inspectors;
- premortem reviewers;
- synthesiser.

Contract Review already has a simpler sequential panel:

- parser;
- analyst;
- redliner;
- summariser.

Those implementations do not need to be renamed immediately. Future UI
and docs should describe the pattern as a review panel, and future code
should prefer `review_panel` naming at API boundaries where it will not
break existing clients.

## What Not To Build Yet

- No global "agent marketplace".
- No autonomous retainer mode before job limits, privilege posture,
  storage, and notification boundaries are production-ready.
- No user-personified agents in the matter shell.
- No "67 agents" surface. Add perspectives only when they improve a
  skill's review quality or auditability.

