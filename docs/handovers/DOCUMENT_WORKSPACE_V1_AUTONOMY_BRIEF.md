# Document Workspace v1 — Autonomous Build Brief

Status: ready to hand to Builder.
Branch: `phase-17-crm-pass`.
Goal: deliver a coherent first-class document workspace for matter uploads, with honest backend-gap handling and no fake document/open/download behaviour.

## Why This Is Next

Legalise now has the governed runtime, visible Supervisor Review, and a better Audit Decision Timeline. The next obvious product gap is documents.

Uploaded documents are the source material for Contract Review, Pre-Motion, artifacts, approvals, and audit chains. Today they still feel like rows inside a matter tab rather than first-class legal workspace objects. In normal legal tools, uploaded documents can be opened, inspected, versioned, downloaded, and connected to work product. Legalise needs that standard loop.

This project should make documents feel like real objects in the product without reopening the substrate philosophy.

## Primary Objective

Build Document Workspace v1 end-to-end:

1. A clear document list surface for a matter.
2. A routed document detail page.
3. Open/read extracted text where the substrate supports it.
4. Surface versions, generated outputs, edit/anonymisation controls only where already supported.
5. Connect documents back to artifacts, approvals, and audit where the data exists.
6. File backend gaps honestly when the substrate does not support something, especially original-file open/download.

## Current Context

Recently shipped and live:

- Supervisor Review v1: `/api/matters/{slug}/reviews`, `matter_reviews`, `review.*` audit rows, Approvals tab.
- Audit Decision Timeline v1: decision lane, class chips, invocation chains, review output nodes.
- Phase 18 operator coherence: modules/settings/admin/matter language pass.
- Dormant firm role gates: firm hierarchy code remains, but default evaluator mode should not block B_mixed matters.

Do not undo or bypass these.

## Research Requirement

Before designing, spend a short, bounded pass looking at familiar document-management patterns.

Use available tooling:

- Use the Mobbin MCP if available.
- Look at Harvey, MyCase/MyCase-like legal tools, Clio-like matter/document layouts, Ligora/other legal workspace patterns if accessible.
- If Mobbin is unavailable, use browser/web references sparingly and document what was checked.

Research target:

- Layout grammar only: document tables, detail pages, metadata blocks, version/activity areas, action buttons, empty states.
- Do not copy branding, visual systems, proprietary copy, or unrelated workflows.

Output from research:

- 5-8 bullets in the plan doc under "Reference Patterns".
- Each bullet should say what pattern we are borrowing and why it fits Legalise.

## Mandatory Inspection Before Planning

Inspect the existing code before writing the implementation plan. At minimum:

- `frontend/src/matter/tabs/DocumentsTab.tsx`
- matter routes/router registration
- existing matter sub-nav
- API client document helpers in `frontend/src/lib/api.ts`
- backend document endpoints
- storage/original-file handling
- generated document download route
- document body endpoint
- versions endpoint
- edit-instructions endpoints
- anonymisation endpoints
- any audit emission around document upload/read/edit

Known likely backend facts to verify, not assume:

- There is a `GET /api/documents/{document_id}/body` endpoint.
- There are generated-document routes.
- There are edit/anonymisation routes.
- Original uploaded-file open/download may be missing. Verify before designing a button.

## Deliverable 1 — Plan

Write:

`docs/handovers/DOCUMENT_WORKSPACE_V1_PLAN.md`

The plan must include:

- Current substrate inventory with file/route references.
- Reference Patterns from the research pass.
- Proposed routes.
- Proposed UI shape.
- Backend gaps found.
- What will not be built.
- Testing plan.
- Stop conditions.

Do not start implementation if the plan discovers a real storage/security decision around original files. File that gap and stop for review.

## Preferred Product Shape

Use the existing Legalise IA and tokens.

Likely shape:

- `/matters/{slug}/documents`
  - Matter-scoped document list.
  - Dense, boring table/list.
  - Document title/name, upload status, created date, extracted-text/body availability, generated output availability, version count if available.
  - Clear empty state.
  - Upload affordance can remain compact if it already exists.

- `/matters/{slug}/documents/{document_id}`
  - Document detail page.
  - `PageHeader` with document name and matter breadcrumb.
  - Metadata panel using existing description/list primitives.
  - Extracted text/body viewer if available.
  - Versions section if available.
  - Generated/download links only if backed by real routes.
  - Edit/anonymisation controls only if existing flows support them.
  - Links to artifacts/audit/reviews only where data can be resolved honestly.

If the existing Documents tab is better extended than adding a list page, explain why. The default preference is routed pages because documents should be first-class.

## Design Constraints

- CRM/operator ergonomics.
- Dense, calm, scannable.
- Use existing `PageHeader`, tokens, tables/rows/classes where possible.
- No new visual system.
- No decorative redesign.
- No new module marketplace work.
- No role hierarchy work.
- No provider/settings work.
- No fake "download", "open original", or "view source file" buttons.
- No backend audit vocabulary unless a real backend change is explicitly approved.

## Backend Rule

Default to frontend-first.

Allowed backend work:

- Tiny additive read endpoint only if the inspection proves the UI is blocked and the security/storage semantics are already clear.

Not allowed without review:

- New storage model.
- Original file access policy.
- New audit source.
- New WORM tables.
- New review/approval semantics.
- New document editing substrate.

If a backend gap is found, record it in the plan/handover and continue only around it.

## Testing Cadence

Use risk-based testing, not full-suite delay.

During build:

- Focused frontend tests for new document routes/components.
- Typecheck/build before final.

Only run backend tests if backend changed.

Only run e2e if route/auth/navigation changes are material enough to risk the main journey.

Final handover must state exactly what was and was not run.

## Subagent Guidance

The Builder may spin up subagents, but keep them bounded:

- Research subagent: reference patterns from Mobbin/legal workspace tools.
- Code inventory subagent: document-related routes/endpoints/components.
- Test subagent: focused frontend test gaps after implementation.

Do not let subagents redesign the product or invent substrate.

## Acceptance Criteria

Document Workspace v1 is complete when:

- A user can find matter documents from the matter shell without hunting.
- A user can click a document and land on a stable routed detail page.
- The page shows every supported document datum honestly.
- Unsupported actions are absent, not disabled-fiction.
- Any original-file open/download gap is explicitly logged.
- The UI uses current operator primitives and does not drift visually.
- Focused tests cover the new list/detail surfaces.
- The handover names routes touched, APIs used, tests run, backend gaps, and out-of-scope items.

## Suggested Final Handover Shape

Write:

`docs/handovers/HANDOVER_DOCUMENT_WORKSPACE_V1_DONE.md`

Include:

- Summary of shipped routes/components.
- Backend endpoints used.
- Research patterns applied.
- Gaps found.
- Tests run.
- Risks/residual limitations.
- Next recommended phase.

## Copy-Paste Starter For Builder

Read `docs/handovers/DOCUMENT_WORKSPACE_V1_AUTONOMY_BRIEF.md`. You have autonomy to inspect, research using Mobbin MCP if available, write the plan, and build Document Workspace v1 if the plan stays mostly frontend and does not require a new storage/security decision. Spin up bounded subagents for research, code inventory, and tests as useful. Deliver the plan, implementation, focused tests, and handover. Stop only if original-file retrieval requires a real backend/security decision.
