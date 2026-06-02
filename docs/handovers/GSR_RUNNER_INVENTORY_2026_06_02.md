# Generic Skill Runner — Inventory + Routing Decision

**Date:** 2026-06-02
**Status:** decision paper, revised after PR #33 review comments.
No code in this PR. The next PR (GSR-2) is the first build slice;
this document is what it builds against.
**Scope:** product model + workflow surface inventory + first-skill
choice. Does NOT hide anything, does NOT delete anything, does NOT
change UI.

---

## 0. Why this document exists before any code

The Generic Skill Runner Reset's most likely failure mode is jumping
straight into "build a generic runner component" and accidentally
shipping another bespoke surface. We've seen the pattern across IA
reset PRs: an inventory + decision paper before code is what stops
opinion creep.

This PR is the inventory. It produces no UI change. The next PR
(GSR-2) builds the runner against one first-party skill (Letters)
and one imported/prompt skill, and is the moment the architecture
either proves itself or doesn't.

---

## 1. The product model (locked)

> **Open project → select documents → run skill → review typed
> output → sign → record/export.**

That is the entire skill-running loop. There is one of each surface
across the matter, regardless of which skill ran:

| Object | Owner | Contains |
| --- | --- | --- |
| **Matter** | Legalise | documents · chat · skills · outputs · record |
| **Skill** | manifest | reads · writes · required inputs · output kind · model/provider requirement · sign-off eligibility |
| **Runner** | Legalise UI | skill name/description · source selector · args form · provider readiness · run button |
| **Output viewer** | Legalise UI | content rendered by kind · source anchors · sign-off CTA · Record link |
| **Sign-off** | existing | Professional Sign-Off flow attached to every eligible output |
| **Record** | existing | skill run → model call → output → sign-off → export |

---

## 2. The architectural rule (load-bearing)

> The Generic Skill Runner is NOT a big chat box where an LLM does
> everything. It is a manifest-driven legal work runner: source
> selector → run skill → typed output → sign-off → record.

Two consequences flow from this rule:

1. The runner has **typed inputs** (declared by the manifest) and
   **typed outputs** (rendered by kind). Free-text chat input
   belongs in Chat, not in the runner.
2. The LLM is **inside the skill runtime**. Legalise owns the
   professional workflow around it: who reads what, what gets
   recorded, who signs.

If a future skill needs interactive conversational refinement, it
attaches that interaction to Chat (PR 5's surface), not by building
a chat box inside the runner.

---

## 3. Inventory: current workflow surfaces

Five first-party workflow tabs exist today as bespoke UI inside the
matter shell. Plus one already-generic runner for V2 module
capabilities (`InvocationRunner` inside `GrantsPanel`).

### 3.1 Pre-Motion

| Field | Value |
| --- | --- |
| File | `frontend/src/matter/tabs/PreMotionTab.tsx` |
| Endpoint(s) | `POST /matters/{slug}/pre-motion/run-stream` (SSE) · `/pdf` · `/docx` |
| Manifest capability | **none** — hardcoded route, no manifest entry |
| Inputs | `{ depth?: "fast" \| "thorough" }` |
| Document requirements | implicit (uses all matter documents) |
| Output kind | structured `PreMotionRunResult` (verdict + failure scenarios + evidence flags + synthesis + stage telemetry) |
| Sign-off eligibility | **not wired** — exports PDF/DOCX only |
| Runner-fit today | **No.** Multi-stage SSE stream + bespoke result layout + PDF export pipeline. Highest custom-UI surface area. |

### 3.2 Letters

| Field | Value |
| --- | --- |
| File | `frontend/src/matter/tabs/LettersTab.tsx` |
| Endpoint(s) | `GET /matters/{slug}/letters/catalog` · `POST /matters/{slug}/letters/draft` · `/letters/draft/docx` |
| Manifest capability | **none** — hardcoded route, no manifest entry |
| Inputs | `{ letter_type: string; inputs: Record<string, string> }` (free-text fields per letter type) |
| Document requirements | none directly (letter type catalogue is per matter type) |
| Output kind | draft markdown |
| Sign-off eligibility | **not wired** — exports DOCX only |
| Runner-fit today | **Closest fit of the five.** Single-shot call, markdown output maps to existing `motion_draft` artifact kind, no SSE, no document selector needed. |

### 3.3 Contract Review

| Field | Value |
| --- | --- |
| File | `frontend/src/modules/contract_review/ContractReviewTab.tsx` (+ `ResultPanel.tsx`) |
| Endpoint(s) | `POST /matters/{slug}/contract-review/run-stream` (SSE) · `/docx` |
| Manifest capability | **none** — hardcoded route, no manifest entry |
| Inputs | `{ document_id, posture?, contract_type?, counterparty_name?, deal_value? }` (closed enums + free text) |
| Document requirements | exactly one document |
| Output kind | findings + redlines pack (analyses[] + redlines[] + summary) |
| Sign-off eligibility | **not wired** — exports DOCX only |
| Runner-fit today | **Partial.** Output shape maps to `findings_pack`. Inputs are enumerable. Needs document selector + SSE abstraction. |

### 3.4 Tabular Review

| Field | Value |
| --- | --- |
| File | `frontend/src/modules/tabular_review/ReviewsTab.tsx` |
| Endpoint(s) | 7 endpoints: list / create / get / patch / estimate / run / export.docx |
| Manifest capability | **none** — hardcoded route, no manifest entry |
| Inputs | per-review: `{ title; columns_config: ColumnSpec[] }`; per-run: `{ document_ids?, column_keys?, confirm_above_50? }` |
| Document requirements | many documents (rows) × many columns (extracted fields) |
| Output kind | extraction grid (rows × columns); not a document |
| Sign-off eligibility | **not wired** — exports DOCX only |
| Runner-fit today | **No.** Four-step state machine (create → configure → estimate → run). The output is a re-editable table, not an artifact. Different archetype. |

### 3.5 Case Law

| Field | Value |
| --- | --- |
| File | `frontend/src/modules/case_law/ResearchTab.tsx` |
| Endpoint(s) | `POST /matters/{slug}/case-law/search` · citations CRUD |
| Manifest capability | **none** — hardcoded route, no manifest entry |
| Inputs | `{ query, court?, year? }` |
| Document requirements | none |
| Output kind | citations list with picker UI |
| Sign-off eligibility | **not wired** — citations persist, no review |
| Runner-fit today | **Partial.** Stateless search, no doc dependency. But the output feeds an interactive citation sidebar, not a one-shot artifact. |

### 3.6 InvocationRunner (the existing generic runner for V2 modules)

| Field | Value |
| --- | --- |
| File | `frontend/src/matter/InvocationRunner.tsx` (inside `GrantsPanel`) |
| Endpoint | `POST /matters/{slug}/invocations` |
| Manifest capability | **yes** — accepts `{module_id, capability_id, args?}` |
| Inputs | free-form JSON args field |
| Document requirements | none enforced in UI; capability declares `reads` |
| Output kind | `InvocationResponse` rendered by `ArtifactPreview` (knows `motion_draft`, `findings_pack`, `skill_response`, `evidence_list`) |
| Sign-off eligibility | not yet wired through this path |
| Runner-fit today | **This is the seed.** Everything PR GSR-2 will build is a richer shell around this primitive. |

---

## 4. Mapping table (the five questions, condensed)

| Workflow | Manifest cap? | Inputs schema | Doc selector | Output kind | Sign-off ready | Fits generic runner today? |
| --- | --- | --- | --- | --- | --- | --- |
| Pre-Motion | ✗ | `depth` enum | implicit-all | structured | ✗ | ✗ (SSE + bespoke layout) |
| Letters | ✗ | free-text per type | n/a | markdown | ✗ | **✓ with form-builder addition** |
| Contract Review | ✗ | enums + free text | one document | findings_pack | ✗ | ⚠️ needs doc-select + SSE |
| Tabular Review | ✗ | dynamic columns | many docs | grid | ✗ | ✗ (different archetype) |
| Case Law | ✗ | search params | n/a | citations list | ✗ | ⚠️ needs interactive picker |
| InvocationRunner | **✓** | free JSON | not in UI | artifact (4 kinds) | ✗ | ✓ (the seed) |

**Headline finding:** none of the five first-party workflows
declare a manifest capability today. They are routed by hardcoded
matter sub-tabs and hardcoded endpoints. Crucially, **legacy
first-party workflows do not persist their outputs as matter
artifacts**, so they cannot enter the substrate's existing
`ArtifactDetail → Professional Sign-Off → Record / Working Pack
export` path. **Skills own UI AND own output flow, which means
there is no governed loop for these surfaces.** That is the
exact pattern this reset closes.

Note: this is distinct from the V2 prompt/runtime path, which
already writes `skill_response` artifacts via `write_artifact` and
already plugs into Professional Sign-Off and Record. The runner
gap is on the legacy first-party side, not in the substrate.

---

## 5. What is actually missing for a generic runner

Not opinion — what the existing V2 model + `InvocationRunner`
cannot do that these workflows need. **Important:** "artifact
persistence" is NOT a universal gap. V2 prompt/runtime already
writes `skill_response` artifacts via `write_artifact` and already
plugs into the existing `ArtifactDetail → Professional Sign-Off →
Record / Working Pack export` substrate. The gap is specifically
on the legacy first-party workflows, which export inline and never
write an artifact.

| Gap | Needed for | Effort |
| --- | --- | --- |
| **Document selector in the runner shell** | Contract Review, Pre-Motion, Tabular Review | medium — UI work, no backend |
| **Args schema in the manifest** (typed fields, enums, free-text) | Letters, Contract Review, Pre-Motion, Case Law | manifest schema field + form builder; **possibly backend** if validation moves server-side |
| **Streaming/stage telemetry in the runner** | Pre-Motion, Contract Review | medium — SSE wrapper around `InvocationRunner` |
| **Artifact persistence for legacy first-party workflows** | Pre-Motion, Letters, Contract Review, Tabular Review, Case Law | requires manifest-capability wrappers that route through `POST /invocations` and write the right artifact kind. V2 prompt/runtime already does this; legacy endpoints don't. |
| **Output renderer registry by kind** | all artifact kinds | `ArtifactPreview` already supports 4 kinds (`motion_draft`, `findings_pack`, `skill_response`, `evidence_list`); extend or unify with bespoke layouts. |

**Sign-off vocabulary discipline (from PR #33 review):** this
codebase has two distinct concepts — **Professional Sign-Off** and
**supervisor review**. The governed loop GSR-2 must prove is
Professional Sign-Off: an artifact exists, the user reads it, the
user signs it. Supervisor review is a separate flow and is not the
gate for GSR-2.

**Of these, the substantive new work is the manifest-capability
wrappers for legacy workflows.** Once Letters / Contract Review /
Pre-Motion / Case Law each invoke through `POST /invocations` and
write an artifact, the artifact substrate (already present) handles
sign-off, Record, and Working Pack export with no further work.
The brief says no backend unless blocked; GSR-2 should attempt to
prove the runner against the **V2 prompt/runtime path first** —
which already meets the contract — and only attempt Letters once
the runner shape is settled.

---

## 6. First-skill choice (GSR-2) — revised after PR #33 review

GSR-2 must prove the **full governed loop**, not just a generic
form. Acceptance is:

> `select skill → run → artifact exists → typed output renders →
> Professional Sign-Off path reachable → Record deep-link shows the
> trail`.

A transient Letters draft that never enters `matter_artifacts` is
NOT this loop. It would prove only a form shell. The first GSR-2
proof must be a skill that already produces a real artifact.

### 6.1 Primary target: one existing V2 prompt/native module

The cleanest proof is a V2 prompt/native matter-scoped module that
already invokes through `POST /api/matters/{slug}/invocations` and
already writes a `skill_response` artifact via `write_artifact` in
`prompt_runtime.py`. That path is already plumbed end-to-end:

> `/invocations` → artifact → `ArtifactPreview` → Professional
> Sign-Off → Record / Working Pack export

GSR-2 builds the runner shell around this existing path. The
runner reads the manifest, builds a small typed form from the args
schema, invokes the capability, and lets the existing artifact
substrate do the rest. **The runner does NOT special-case any
skill identifier.**

The specific V2 module to test against is a build-time choice for
GSR-2 — whichever matter-scoped V2 capability is currently
installable in the dev fixtures + on the demo matter (Khan v Acme).
If none is currently available, GSR-2's first task is to install
and grant one before any runner code lands.

### 6.2 Secondary target: Letters (conditional)

Letters is only acceptable as GSR-2's second target **if** Builder
first wraps it into a manifest-backed capability that invokes
through `POST /invocations` and writes a `motion_draft` artifact.
Hard rules in that wrapper:

- **No direct call to `/letters/draft`** from the generic runner.
- **No `if (skill === 'letters')` branch** anywhere in the runner.
- **No `draft_markdown` special-case render** path. Letters output
  must enter `ArtifactPreview` as the same shape as any other
  `motion_draft` artifact.
- **No `letters/catalog` adapter** at the runner layer. If the
  catalogue is needed for the form, it lives behind a generic
  manifest mechanism (e.g. the args schema declares a string-enum
  field populated from a backend lookup) — not a Letters-only
  fetch wired into the runner.

If wrapping Letters into manifest+invocation+artifact shape is too
much for one PR, Letters **moves to GSR-3** and GSR-2 proves on
the V2 module alone. The architectural rule is non-negotiable:
**no bespoke adapter in the generic runner.**

### 6.3 The architectural acceptance test

The runner does not know which skill it's running. It reads the
manifest, builds the form, calls `POST /invocations`, and renders
the resulting artifact via `ArtifactPreview`. A code reviewer
should be able to grep the runner files and find:

- zero matches on `letters/draft` direct calls
- zero matches on `if (skill === ...)` branches
- zero matches on `draft_markdown` special-case render branches
- zero hardcoded skill identifiers other than test fixtures

If any of these appear, GSR-2 has not proven the architecture.

### 6.4 Explicitly deferred to later GSR slices

| Workflow | Defer to | Why |
| --- | --- | --- |
| Letters | GSR-3 (or in GSR-2 only with manifest wrapper) | Must shape-match `/invocations` + artifact write before it enters the runner. |
| Case Law | GSR-4 or later | Output isn't artifact-shaped (interactive citation picker). Runner must prove on single-shot artifacts first. |
| Contract Review | GSR-4 or later | Streaming + document selector + closed-enum form builder. Adds three runner features at once. |
| Pre-Motion | GSR-5 or later | Most bespoke result layout + SSE + PDF export. Worst risk-to-value ratio for an early GSR slice. |
| Tabular Review | GSR-6+ | Different archetype entirely — table-extraction state machine. Out of scope for the runner's artifact-shaped loop. |

---

## 7. GSR-2 scope sketch (next PR) — revised

The next PR builds against this inventory and against the
**full governed loop** acceptance from §6. Concrete deliverables:

1. **Runner shell component** — Legalise UI that renders from
   manifest state: skill title, description, args form, provider
   readiness, Run button. Reachable from Chat picker and the
   matter Skills tab. The shell does NOT know which skill it's
   running.
2. **Minimum form builder** — supports string fields + enum
   select. Field types added as later skills migrate.
3. **Run one V2 prompt/native skill end-to-end through the
   runner on the demo matter.** Output must enter
   `matter_artifacts`. Reviewer can click the artifact, render
   it in `ArtifactPreview`, reach the Professional Sign-Off
   path, and follow a Record deep-link back to the run trail.
4. **No-adapter discipline.** No `if (skill === ...)`, no direct
   legacy endpoint call, no special-case render branch (see
   §6.3 architectural acceptance test).
5. **Tests** that pin: the runner invokes `POST /invocations`;
   the output is rendered via `ArtifactPreview` not a bespoke
   layout; no skill-id branch exists in the runner files.

**The golden-path demo gate (mandatory):** after GSR-2 lands, a
reviewer should be able to open the demo matter, pick the GSR-2
skill, run it, and answer three questions without leaving the
product surface:

- What did this run use? (selected sources / args)
- What did it produce? (typed output via `ArtifactPreview`)
- Where is the record? (Record deep-link from the output)

If any of those questions cannot be answered cleanly on the demo
matter, GSR-2 has not landed — regardless of test or CI status.

**Out of GSR-2 scope (explicit):**

- Document selector (deferred to the first skill that needs it)
- Streaming / SSE
- Hiding the legacy routes from primary IA (GSR-3 territory once
  GSR-2 proves the runner)
- Pre-Motion / Contract Review / Tabular Review / Case Law
  migration (GSR-4+)
- Letters migration unless it can ship as a manifest-backed
  capability that already meets the no-adapter discipline in §6.2

## 7.5 UI vocabulary discipline (extends §3 of the IA blueprint)

The runner and the Skills surfaces must NOT lead with raw
capability plumbing language. Forbidden in the primary surface
(consistent with the IA blueprint §3 forbidden list):

- `partial`, `blocked`, `missing capabilities`
- raw capability identifiers like `chronology.read`, `matter.read`,
  `model.invoke`
- `manifest`, `invocation`, `grant`, `capability` as user-facing
  primary nouns

User-facing states stay close to the existing matter Skills tab
vocabulary:

- **Ready in this project**
- **Available to enable**
- **Needs setup**

Raw capability details belong inside a "Details" disclosure, the
install/grant ceremony, or the operator/debug view. The governance
is still fully enforced; it just stops being the first thing a
normal user sees.

## 7.6 Demo matter must run green

For the demo matter (Khan v Acme), the GSR-2 skill must be
pre-granted, provider readiness must be clear, and the golden-path
should run end-to-end without any permission-denial banner on the
first run.

The permission-denial story is an **insider proof demo** ("watch
what happens when I revoke a permission, the runtime refuses the
call and the row lands in Record"). It should not be the first
experience a fresh observer has on the demo matter.

GSR-2's first build task — before any runner code lands — is to
verify or install + grant the chosen V2 module on the demo matter
so the loop runs green out of the box.

---

## 8. Non-actions in GSR-1 (this PR)

- **No UI changes.** Inventory and decision paper only.
- **No route hides.** Every workflow tab still appears in primary
  matter IA exactly as it does today.
- **No deletions.** No legacy components removed.
- **No backend changes.**
- **No manifest schema changes.** Args schema + sign-off
  eligibility fields are sketched here as future work, not added.

The reason to commit this paper without code: the next agent (or
the next instance of this one) opens this file before touching the
runner, and the inventory + first-skill choice is already settled.

---

## 9. Open questions for the human — revised

The Letters sign-off question is resolved by the §6 redline:
Letters is admissible to GSR-2 only when it can shape-match the
existing artifact substrate (writes a `motion_draft` artifact via
`POST /invocations`). If it can't be wrapped in this PR, it moves
to GSR-3. Sign-off eligibility for it then follows the artifact's
existing Professional Sign-Off path — no new opt-in needed.

The remaining open call:

1. **Which specific V2 prompt/native module does GSR-2 prove
   against?** Choice criteria:
   - matter-scoped capability (not workspace-only)
   - already installable through the workspace Skills surface (PR 3)
   - already grantable on the demo matter (PR 4)
   - writes a `skill_response` (or similar) artifact via the
     existing `write_artifact` path
   - keyless or operator-pre-configured provider on the demo matter
     so the loop runs green for a fresh observer

If no currently-installed V2 module meets all five criteria on the
demo matter, GSR-2's first build task is to install + grant one
(workspace trust ceremony → matter grant → optional fixture seed)
before any runner code lands. That setup work is a precondition,
not a separate PR.

---

## 10. Authority

This document is the source of truth for the GSR initiative's
scope and sequencing. Build agents:

- Implement GSR-2 against this paper.
- Cite this paper's sections in subsequent GSR PRs.
- Raise blockers; do not silently expand scope.
- Do not skip ahead to GSR-3 (hide legacy IA) until GSR-2 has
  merged and the runner has proven itself on both Letters and the
  V2 module.

The human (Andy) is the only authority who can amend this paper.
No agent — including the one that wrote it — has standing to
relitigate the locked sections (§1 product model, §2
architectural rule, §6 first-skill choice).
