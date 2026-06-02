# Legalise IA Reset White Paper

**Date:** 2026-06-02
**Status:** decision paper for review, not a build plan
**Scope:** product model, information architecture, and UX hierarchy
**Non-scope:** backend architecture, substrate primitives, connector work,
module runtime changes, legal-quality evals

## Executive Summary

Legalise has a strong backend substrate and a coherent product thesis, but the
current frontend exposes too many substrate concepts as equal destinations.
The result is not an ugly product. It is an under-directed product: users can
click between dashboard, matter desk, documents, actions, activity trail,
outputs, export, modules, workspace audit, admin, and settings without a clear
sense of where the work actually happens.

The core issue is structural:

> Legalise currently presents itself as a governed workspace dashboard. It
> should present itself as a project folder where legal AI skills work on the
> user's documents.

The user-facing loop should be reduced to:

1. Open project.
2. Install skill.
3. Chat or run the skill inside that project.

Everything else remains available, but it stops being first-class navigation.
Audit, sign-off, source anchors, export, grants, posture, provider readiness,
and module lifecycle are not removed. They become supporting proof and
configuration around the main work loop.

This paper argues for an IA reset before further frontend building. It should
be reviewed by other agents before any code lands.

## Problem Statement

The current UI feels chaotic because it lets the user move between internal
concepts too freely and too early. It assumes the current nouns are correct:

- Matter desk
- Documents
- Actions
- Activity Trail
- Outputs
- Export
- Modules
- Workspace audit
- Dashboard
- Admin
- Settings

Those nouns are not all wrong, but they are at different levels of abstraction.
The product currently flattens them into one menu. That creates three problems:

1. **No stable sense of place**
   The user does not feel like they are "inside a project folder." They feel
   like they are navigating a control panel.

2. **No obvious primary action**
   The system asks the user to understand governance before it gives them the
   simple first job: add a document, ask a question, or run a skill.

3. **Substrate vocabulary leaks into product experience**
   Audit, modules, outputs, grants, posture, and workspace state are important.
   But presented as top-level destinations, they make the product feel more
   complex than the actual user task.

## ELI15 Product Model

Legalise should be explainable like this:

> Legalise is a folder for legal AI work.
>
> You open a project.
> You add documents.
> You install skills that are allowed to work in that project.
> Then you chat or run a skill.
> Legalise keeps the record in the background.

That is the whole product.

The sophisticated claim is still there:

- skills declare what they need;
- the project grants access;
- outputs cite sources;
- the solicitor signs the result;
- the record can be reconstructed and exported.

But the user should discover those facts as confidence builders, not learn
them as navigation prerequisites.

## Current Structural Diagnosis

### What Is Working

- The backend substrate is serious.
- The audit, sign-off, source-anchor, and export chain is defensible.
- The `/demo-loop` comprehension pass helps explain the governed loop.
- Documents are first-class enough to inspect and retrieve.
- Modules/skills can be imported, installed, granted, and invoked.
- The product thesis is sharper now: AI prepares, a human signs.

### What Is Not Working

- The logged-in experience has no single "home" inside a project.
- The dashboard competes with the project.
- The sidebar lists internal concepts as peers.
- Documents, actions, outputs, activity, and export are treated like separate
  products rather than states inside one project.
- "Modules" is global, while "Actions" is project-local, but the connection is
  not obvious.
- "Activity Trail" and "Workspace audit" are both visible, which makes audit
  feel like a destination rather than a record.
- The user can jump between projects/global surfaces too easily, so project
  containment is weak.

## Proposed Product Model

The product should be rebuilt around three user-facing objects:

1. **Projects**
   The container. A project is the user's folder. It contains documents,
   installed skills, chat, outputs, and the record.

2. **Skills**
   Tools that can be installed into a project. A skill can read certain project
   material, write certain outputs, and run under the governance substrate.

3. **Chat / Work**
   The primary work surface. The user asks, runs, reviews, signs, and sees the
   result in context.

Everything else is secondary:

- documents are assets inside a project;
- audit is the project record;
- outputs are work produced inside the chat/work flow;
- export is an action on the project record;
- settings/admin are workspace configuration;
- modules marketplace is the place to browse and install skills.

## Proposed IA

### Global Navigation

Keep global navigation extremely small:

- Projects
- Skills
- Settings

Optional for admins only:

- Admin

Do not show "Workspace audit" as normal primary navigation. It can live inside
Admin or Settings for operators.

### Project Navigation

Once a user opens a project, the app should feel like they are inside that
folder. Navigation inside the project should be:

- Chat
- Documents
- Skills
- Record

That is enough.

The current surfaces map as follows:

| Current Surface | Proposed Home | Notes |
| --- | --- | --- |
| Matter desk | Chat or Project overview | Do not keep as a major noun unless renamed. |
| Documents | Documents | Keep, but make it feel like project assets. |
| Actions | Skills or Chat | Actions are how installed skills appear inside a project. |
| Outputs | Chat and Record | Latest outputs shown in Chat; archive in Record. |
| Activity Trail | Record | Rename to Record or Proof; not a primary work tab. |
| Export | Record action | Export is an action, not a tab. |
| Modules | Skills | Global marketplace plus project-installed skills. |
| Workspace audit | Admin / Settings | Operator-only proof surface. |
| Dashboard | Projects index | Do not make it a separate conceptual workspace. |

## Target User Journey

The happy path should be:

1. User opens Legalise.
2. User sees Projects.
3. User opens a project.
4. User lands on Chat.
5. User sees documents already in the project, or drops a document.
6. User installs or enables a skill if needed.
7. User asks a question or clicks "Run skill."
8. Legalise produces sourced output inline.
9. User signs or rejects the output.
10. User can open the Record to see what happened.
11. User can export the project record.

The product should not require the user to visit Activity Trail, Outputs,
Export, Workspace audit, or Admin before the primary loop makes sense.

## What To Hide, Not Delete

This reset is not a substrate cut. It is progressive disclosure.

Hide or de-emphasise:

- Workspace audit
- raw audit filters
- grant tables
- posture internals
- module manifest details
- output metadata
- export internals
- admin role controls

Keep accessible:

- proof drawer / record view;
- source anchors;
- sign-off hash;
- export ZIP;
- module install ceremony;
- provider key readiness;
- admin audit for operators.

The principle:

> Governance should be visible at the moment it builds trust, not before the
> user understands the work.

## Naming Rules

The current names mix legal, product, and substrate vocabulary. The reset
should use a small vocabulary.

Recommended user-facing names:

- Project
- Skill
- Chat
- Documents
- Record
- Sign-off
- Export

Avoid in primary user navigation:

- Matter desk
- Actions
- Outputs
- Activity Trail
- Workspace audit
- Grants
- Invocation
- Capability
- Posture

These words can remain in admin, developer docs, API, tests, and substrate
interfaces. They should not drive the default product IA.

## Design Rules For The Next Build

1. **One project at a time**
   The user should always know which project they are inside. Moving to another
   project should feel like changing folder, not clicking another row in a
   dashboard.

2. **Chat is the front door**
   The default project route should be the place where the user asks questions
   and runs skills.

3. **Skills are installed into a project**
   The global skills marketplace exists, but the project should show which
   skills are active here.

4. **Record is proof, not workflow**
   The record matters, but it should support the work loop. It should not be the
   first thing the user has to understand.

5. **No new backend unless a route truly lacks data**
   Most of this is IA and presentation. Backend must remain stable.

6. **No new product nouns**
   If the reset requires more names, it is probably not a reset.

7. **Do not preserve routes just because they exist**
   Routes can stay technically mounted, but the primary navigation should hide
   them if they are not part of the simplified workflow.

## Build Strategy

Do not jump straight into a large redesign PR. Sequence it.

### PR 0: UX Master Spec

No code. Produce:

- current route inventory;
- proposed route hierarchy;
- rename table;
- hide/de-emphasise table;
- primary user flow;
- backend-touch risk assessment;
- screenshots of current confusion points;
- proposed first build PR.

### PR 1: Navigation And Containment

Goal: make the app feel like a project folder.

Likely changes:

- Global nav: Projects, Skills, Settings.
- Project nav: Chat, Documents, Skills, Record.
- Hide Workspace audit from normal users.
- Collapse Export into Record.
- Rename Modules to Skills in UI.
- Rename Activity Trail to Record or Proof.

No backend changes.

### PR 2: Project Chat Front Door

Goal: one obvious first screen.

Likely changes:

- project opens to Chat;
- document summary shown inline;
- installed skill readiness shown inline;
- latest output shown inline;
- ask/run input is the dominant action;
- proof/sign/export links are secondary.

No backend changes unless a missing data field is proven.

### PR 3: Documents As Project Assets

Goal: document reader feels like opening a file inside the project.

Likely changes:

- stronger document reader;
- clearer back-to-project behavior;
- fewer metadata blocks by default;
- original/extracted/version details behind disclosure;
- source-anchor behavior tied into the reader.

Backend should remain untouched.

### PR 4: Record And Export Compression

Goal: proof and export become one coherent record layer.

Likely changes:

- Record view groups activity, sign-offs, sources, and export;
- export button lives in Record;
- raw audit filters behind advanced details;
- human-readable proof first, raw rows second.

No backend changes unless export history is genuinely unavailable.

## Risks

### Risk 1: Breaking The Substrate By Moving UI

Mitigation:

- treat this as route/navigation/presentation first;
- do not delete routes initially;
- hide from nav before removing;
- use existing API clients and tests.

### Risk 2: Dumbing Down The Product

Mitigation:

- do not remove governance;
- reveal it as proof at the right moment;
- keep source anchors, sign-off, record, and export strong.

### Risk 3: Creating Yet Another IA Layer

Mitigation:

- use only Projects, Skills, Chat, Documents, Record;
- archive or hide older nouns from main nav;
- write the master spec before coding.

### Risk 4: Agent Drift

Mitigation:

- every PR must state which IA rule it implements;
- no PR may introduce a new top-level nav item;
- backend changes require explicit approval;
- no Kramer carry-over work unless separately opened.

## Questions For Other Agents To Challenge

1. Should the user-facing noun be **Project** or **Matter**?
   - Project is clearer to general users.
   - Matter is legally precise.
   - Recommendation: UI says Project in general navigation, with matter metadata
     visible where legal precision matters.

2. Should Chat and Skills be separate inside a project?
   - Separate improves clarity of installed tools.
   - Combined reduces navigation.
   - Recommendation: Chat is primary; Skills is project setup.

3. Should Record replace Activity Trail?
   - Activity Trail is technically accurate but substrate-flavoured.
   - Record better matches professional output/export.
   - Recommendation: Record.

4. Should Export be a tab?
   - Export is important but not a daily workspace.
   - Recommendation: no. Export is an action inside Record.

5. Should Modules become Skills everywhere?
   - Modules is developer/substrate language.
   - Skills is user language and matches Lawve.
   - Recommendation: Skills in UI, modules in API/docs where needed.

6. Should Dashboard survive?
   - If it is a project picker, yes.
   - If it is a status dashboard, no.
   - Recommendation: Projects index replaces dashboard as the landing surface.

7. Should the reset happen before architecture rewrite work?
   - Recommendation: yes. The rewrite should inherit a clearer IA, not the
     current flattened model.

## Non-Negotiables

- Do not start with CSS polish.
- Do not add new backend primitives.
- Do not add new demo paths.
- Do not resume Kramer carry-overs automatically.
- Do not delete audit, sign-off, source anchors, export, or module governance.
- Do not let global admin/operator surfaces pollute the project work loop.
- Do not preserve current navigation just because tests know it.

## Recommended Next Action

Ask another agent to produce **PR 0: UX Master Spec**.

Prompt:

> Read this white paper, current routes, and current screenshots. Produce a UX
> master spec for Legalise around Open Project -> Install Skill -> Chat. Do not
> build. Inventory every current route and classify it as primary, secondary,
> admin, hidden, or deprecated. Propose the exact navigation hierarchy, route
> renames, and first build PR. Backend must remain untouched unless a missing
> data field is proven.

Only after PR 0 is ratified should a build begin.

## Final Position

Legalise does not need more product surface. It needs a stricter product model.

The backend says:

> governed legal AI work is possible.

The frontend should say:

> open a project, install a skill, chat with your documents, and keep the
> signed record.

That is the V1 user experience.
