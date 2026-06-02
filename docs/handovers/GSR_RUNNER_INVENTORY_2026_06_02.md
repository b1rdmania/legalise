# Generic Skill Runner — Inventory + Routing Decision

**Date:** 2026-06-02
**Status:** decision paper. No code in this PR. The next PR (GSR-2)
is the first build slice; this document is what it builds against.
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
| File | `src/matter/tabs/PreMotionTab.tsx` |
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
| File | `src/matter/tabs/LettersTab.tsx` |
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
| File | `src/modules/contract_review/ContractReviewTab.tsx` (+ `ResultPanel.tsx`) |
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
| File | `src/modules/tabular_review/ReviewsTab.tsx` |
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
| File | `src/modules/case_law/ResearchTab.tsx` |
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
| File | `src/matter/InvocationRunner.tsx` (inside `GrantsPanel`) |
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
matter sub-tabs and hardcoded endpoints. None route their outputs
through `requestReview()` → `SignOff`. **Skills own UI AND own
approval flow, which means there is no governed loop.** That is the
exact pattern this reset closes.

---

## 5. What is actually missing for a generic runner

Not opinion — what the existing V2 model + `InvocationRunner`
cannot do that these workflows need:

| Gap | Needed for | Effort |
| --- | --- | --- |
| **Document selector in the runner shell** | Contract Review, Pre-Motion, Tabular Review | medium — UI work, no backend |
| **Args schema in the manifest** (typed fields, enums, free-text) | Letters, Contract Review, Pre-Motion, Case Law | manifest schema field + form builder; **possibly backend** if validation moves server-side |
| **Streaming/stage telemetry in the runner** | Pre-Motion, Contract Review | medium — SSE wrapper around `InvocationRunner` |
| **Artifact persistence on completion** | all five — none persist artifacts today | requires backend: capability outputs need to land in the artifacts table |
| **Sign-off eligibility flag on capability or output kind** | all five | manifest schema field + runner UX |
| **Output renderer registry by kind** | all five | `ArtifactPreview` already supports 4 kinds; extend or unify with bespoke layouts |

**Of these, only "args schema in the manifest" and "artifact
persistence" are likely to require backend.** The rest is frontend.
The brief says no backend unless blocked; GSR-2 should attempt to
prove the runner against `InvocationRunner`'s existing shape first,
and only escalate if blocked.

---

## 6. First-skill choice (GSR-2)

GSR-2 must prove the architecture against **one first-party skill**
and **one imported/prompt skill** through the same runner.

### 6.1 First-party skill: **Letters**

Why:

- **Simplest state machine.** Single-shot call, no SSE, no
  multi-stage progress. The runner doesn't have to know about
  streaming yet.
- **Output already maps to an artifact kind.** Markdown drafts
  render as `motion_draft` via `ArtifactPreview` with no new code.
- **No document selector required.** Letters draws from a per-matter
  letter-type catalogue, not from documents. The runner can ship
  without the doc-selector affordance and still cover this skill.
- **Form builder is enumerable.** Letter types live in the catalogue;
  per-type input fields are short free-text strings. A minimum
  form-builder primitive (string fields + enum select) covers the
  whole surface.

What GSR-2 must add to support Letters:

- The runner shell renders a skill picker + a small form built from
  the manifest's args schema (initially: `letter_type` enum, then
  one or more string fields per type).
- The runner calls a capability invocation; on success, the typed
  output viewer renders the markdown draft.

What GSR-2 deliberately does NOT touch yet (preserved as legacy):

- The existing `/matters/{slug}/letters` route still works. It just
  stops being the primary path. The hide-from-IA move comes in
  GSR-3 once GSR-2 proves out.

### 6.2 Imported/prompt skill: **one V2 module from the registry**

The Workspace Skills surface (PR 3) already discovers V2 modules
via `getModulesV2()`. PR 4 grants them per-matter via `createGrant`.
The brief's "prompt/imported skill" is exactly this category.

GSR-2 picks **one currently-installable V2 module** (sample:
`examples.contract-review` if registered, or another
matter-scoped V2 capability available in dev fixtures) and runs it
through the same runner shell that Letters uses. The acceptance
test is: **the runner does not know which skill it's running.** It
reads the manifest, builds the form, runs the invocation, renders
the output.

The specific V2 module to test against is a build-time choice for
GSR-2 — whichever one the dev fixtures expose. The architectural
contract is what matters: **two different skill sources, one
runner shell.**

### 6.3 Explicitly deferred to later GSR slices

| Workflow | Defer to | Why |
| --- | --- | --- |
| Case Law | GSR-3 or later | Output isn't artifact-shaped (interactive citation picker). Runner must prove on single-shot artifacts first. |
| Contract Review | GSR-3 or later | Streaming + document selector + closed-enum form builder. Adds three runner features at once. |
| Pre-Motion | GSR-4 or later | Most bespoke result layout + SSE + PDF export. Worst risk-to-value ratio for an early GSR slice. |
| Tabular Review | GSR-6+ | Different archetype entirely — table-extraction state machine. Out of scope for the runner's artifact-shaped loop. |

---

## 7. GSR-2 scope sketch (next PR)

The next PR builds against this inventory. Concrete deliverables:

1. **Runner shell component** — Legalise UI that renders from
   manifest state: skill title, description, args form, provider
   readiness, Run button. Reachable from Chat picker and the
   matter Skills tab.
2. **Minimum form builder** — supports string fields + enum
   select (covers Letters end-to-end). More field types added as
   later skills migrate.
3. **Migrate Letters end-to-end through the runner.** The legacy
   `/matters/{slug}/letters` route stays mounted; the matter
   Skills tab + Chat picker route via the runner.
4. **Migrate one V2 module skill through the same runner.** The
   acceptance test is shape, not styling: the runner does not
   branch on which skill it's running.
5. **Tests** that pin both skills go through the same runner
   component (no `if (skill === 'letters')` branches anywhere).

**Out of GSR-2 scope (explicit):**

- Document selector
- Streaming / SSE
- Artifact persistence and sign-off wiring (the brief says "draft
  vs sign" — GSR-2 produces drafts; sign-off comes once eligibility
  is in the manifest)
- Hiding the legacy routes from primary IA (GSR-3)
- Pre-Motion / Contract Review / Tabular Review / Case Law
  migration (GSR-3+)

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

## 9. Open questions for the human

Two calls that GSR-2 needs before it cuts any code:

1. **Does Letters produce a sign-off-eligible output, or stays
   draft-only for GSR-2?** Today letters export to DOCX with no
   sign-off. The brief says sign-off attaches to every eligible
   output. Eligibility could be:
   - opt-in per skill (manifest declares it)
   - opt-in per output kind (every `motion_draft` is eligible)
   - never in GSR-2 (sign-off arrives in a later slice once the
     runner shape is stable)

2. **Which V2 module is the "imported/prompt skill" GSR-2 tests
   against?** Dev fixtures determine the choice. If no
   matter-scoped V2 capability is currently available in dev,
   GSR-2's first task is to install one (workspace trust ceremony,
   matter grant) before the runner work begins.

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
