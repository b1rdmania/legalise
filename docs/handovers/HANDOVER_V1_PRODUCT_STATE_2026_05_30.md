# V1 Product State Handover — 2026-05-30

Branch: `master`
Current head at write time: `4d37368` (`ux: polish public matter demo`)
Production status: CI, e2e, and frontend deploy green for the current head.

This is the current state handover. For navigation rules and archive policy,
see `docs/handovers/INDEX.md`.

It supersedes the recent per-feature handovers for Professional Sign-Off, Export
Gating, Source Anchors, Contract Review Source Anchors, Matter Desk UX, V1 KISS
Compression, Document Ingress, Document Workspace, Original File Retrieval,
Module Standalone/Create, Prompt Runtime, External Skills Loop, Guided Demo
Loop, and Provider Readiness. Those files remain useful history, but this file
is the current product summary.

## Purpose

This handover consolidates the recent V1 shaping work after the product moved from
"governed runtime with many surfaces" toward a simpler solicitor-facing product:

> Legalise is a judgement amplifier. AI prepares work; a solicitor reviews,
> signs, and exports a defensible record.

The important shift is that the gate/sign-off is not secondary compliance UI.
It is the product's core moment: preparation becomes professional work when a
signed human judgement is recorded.

## Current User Loop

The V1 product should read as one loop:

1. Add or open documents.
2. Run governed actions.
3. Review outputs with cited sources visible.
4. Sign the output as professional judgement.
5. Export the matter record.
6. Use Activity Trail as the spine for what happened.

Visible matter navigation is intentionally compressed to:

- `Matter desk`
- `Documents`
- `Actions`
- `Activity Trail`

Outputs and Export remain available from the wider app/sidebar routes, but the
matter rail should not grow back into substrate navigation.

## What Is Live

### Professional Sign-Off

Professional Sign-Off is live and should remain the hero gate:

- author may sign their own AI-prepared output;
- no qualified-solicitor wall in the default product/demo mode;
- sign-off creates append-only records;
- the output hash pins the exact artifact payload;
- sign-off events are foreground Activity Trail events;
- export bundles preserve sign-off status and integrity.

Supervisor Review still exists, but it is the optional firm-mode/second-pair-of-eyes
path. It should not compete with the author sign-off path in V1 copy.

### Source Anchors

Source Anchors v1 is live:

- prompt-runtime outputs always emit server-known document anchors for loaded
  documents;
- model-supplied claim anchors are enrichment, not the source of truth;
- quote matching is an honest `quote_found_in_source` substring check against
  the extracted body Legalise read;
- model-supplied document identity is never trusted;
- sign-off hash and export carry anchors automatically because anchors live in
  the artifact payload.

Contract Review source anchors are also live for the governed module artifact
path. Both prompt-runtime and Contract Review now filter `DocumentBody.kind ==
extracted` when reading source text.

### Modules / External Skills

The external-skill loop is live:

- browse/import Lawve skills;
- prompt-only skills convert to governed `prompt` modules;
- install draft modules through the trust ceremony;
- grant on a matter;
- run to produce `skill_response`;
- sign/review/export outputs;
- Activity Trail reconstructs the chain.

The marketplace thesis is now present, but future marketplace work must keep
install -> grant -> run state legible without exposing registry/grant internals.

### Documents

Documents are first-class:

- routed document detail page;
- body/versions/anonymisation/edit surfaces;
- original file open/download through an owner-only backend proxy;
- `document.original.accessed` audit row on successful access;
- document ingress made calmer in the matter UI.

### Activity Trail

Activity Trail is the trust spine:

- decision-point classes promote review/sign-off/module/model/grant/advice rows;
- background activity is collapsible;
- copy should say "documents referenced", not "documents touched";
- source anchors and sign-off make the trail explain the professional record
  rather than just dump audit rows.

## Latest UX Pass

Commit `4d37368` polished the public matter demo after screenshots showed it
still felt too wireframe/substrate-heavy.

Changed:

- public demo hides posture/firm-role controls and copy;
- `MatterPulse` is now a readiness panel, not a skinny status line;
- public Documents page reads as a loaded matter file rather than a raw upload
  table;
- public Actions page has stronger cards and clearer "what this reads/writes"
  hierarchy;
- assistant messages have quieter card treatment and say `recorded in Activity
  Trail` instead of `audit row written`;
- demo content remains real but less like an implementation dashboard.

Verification:

- `npm run typecheck`
- `npm test -- --run` — 195 passed / 28 files
- `npm run build`
- CI/e2e/frontend deploy green on master.

## Product Rules To Preserve

- Do not reintroduce qualified-solicitor/user hierarchy complexity into the
  default product or demo. Assume every signed-in user can sign as themselves
  unless a future firm-mode project explicitly changes that.
- Do not make clients a product user. The product is for solicitors/operators;
  clients are subjects of matters.
- Do not add surfaces just because substrate exists. If a surface does not help
  a user prepare, sign, export, or trace work, hide it or collapse it.
- Do not claim sources are verified/proven. The honest claim is: cited sources
  are shown for review; quotes may be located or not located in the source body
  Legalise holds.
- Do not call supervisor review "approval" in a way that competes with
  professional sign-off.
- Do not add fake controls, fake model selectors, or dead affordances.

## Known Follow-Ups

### 1. More Visual Polish On Demo

The latest pass improves the public demo, but it may still need a browser-led
design pass after production review:

- make Matter desk feel more like a professional desk, less like a transcript;
- decide whether the demo needs a stronger single hero action;
- ensure Actions cards stay useful without turning into a marketplace inside a
  matter;
- ensure Documents rows are clearly clickable and useful.

Keep this frontend-only unless a real endpoint gap appears.

### 2. Source Anchors Beyond Current Modules

Prompt runtime and Contract Review are source-aware. Any future first-party
module that produces signable output should emit `source_anchors` in its
artifact payload.

Rule: server-known document anchors first; model claim mapping second.

### 3. Marketplace Legibility

Next viable marketplace work:

- make installed / enabled / granted / runnable status read as one continuous
  lifecycle;
- keep Lawve import/search useful without pretending prompt skills are
  automatically safe or signed;
- avoid rebuilding a full marketplace/community queue before V1 unless needed.

### 4. Export / Final Pack Polish

Export now carries sign-off status and source anchors. A later pass could make
the exported README/manifest more polished as a "client/internal file note"
record, but do not block V1 on a decorative export format.

## Current Assessment

The substrate is no longer the weak point. The current risk is product clarity:
too many pages can still drift back toward "substrate wrapped in UI".

The V1 discipline is:

> One coherent professional loop, with technical detail progressively disclosed.

If a future change makes the product feel broader but less legible, reject it or
move it behind a collapsed technical/details surface.
