# Document Engine Parity Plan — 2026-06-04

## North Star

Legalise needs a first-class document workspace: open a project, open a document, read it, search it, edit it, comment on it, run a skill against it, sign the output, and export the record.

The target is Mike-calibre document experience, but built from proven packages and Legalise primitives:

- TipTap / ProseMirror for rich editing.
- `docx-preview` for Word original preview.
- `react-pdf` / PDF.js for PDF original preview and text layer.
- Existing Legalise document versions, redlines, review notes, skills, sign-off, record, and export.

Do not vendor Mike code. Do not build a weak clone by hand. Assemble a professional document product from stable packages, then wrap it in Legalise governance.

## Product Contract

The document engine is not a side page. It is the working surface for a matter.

The happy path:

1. Open a project.
2. Open Documents.
3. Find or upload a file.
4. Open the document workbench.
5. Read/search the original or extracted text.
6. Edit or annotate with review notes.
7. Run a ready skill on the selected document.
8. Open the produced output.
9. Sign it or leave it as draft.
10. View the Record / Working Pack.

If the path above is not clearer after a change, the change waits.

## Non-Negotiables

- The surface must feel like a document app, not an admin panel.
- Metadata is available, but never the first thing a user sees.
- Search, comments, versions, and redlines stay on the document surface.
- Skills run from the document context using the generic runner.
- Audit/Record is the receipt, not the product.
- Capability IDs, grant rows, manifests, and raw audit jargon stay behind details.
- Demo users must be able to open and inspect sample documents without signing in.
- Do not add bespoke first-party workflow pages as the main experience.

## Existing Foundation

Already shipped:

- Document library upload and search/filter.
- Routed document detail/workbench.
- Original file open/download through audited backend proxy.
- PDF original preview/search and quote-to-note.
- Word original preview/search and quote-to-note.
- TipTap editor with formatting, tables, outline, find, copy/download text, keyboard shortcuts, local draft recovery, save as version.
- Version history, version upload, restore, compare, DOCX download from saved versions.
- AI suggested redlines with accept/reject into saved versions.
- Review notes with selected-quote anchoring.
- Honest active-session presence.
- Document-scoped generic skill runner.
- Record links and source-anchor arrival notes.

## Build Sequence

### P1 — Workbench Composition

Goal: one calm workspace, not stacked panels.

Deliver:

- Header answers: what document, what status, what primary action.
- Main canvas defaults to the editor/reader.
- Right rail has three compact groups:
  - Review: notes, redlines, active sessions.
  - Skills: ready document skills and current run.
  - Versions: current version, save/export shortcuts.
- Metadata moves fully behind details.
- Reduce repeated boxes and counters.

Acceptance:

- A fresh user can say: "I am reading/editing this document, with review and skills beside it."
- No raw capability or audit language in the primary view.

### P2 — Reader / Editor Quality

Goal: the editor and preview behave like a real document surface.

Deliver:

- One stable command bar for editor actions.
- Find status and outline feel integrated, not bolted on.
- Original preview search mirrors editor search where possible.
- Save/version/download actions are predictable.
- Keyboard shortcuts shown quietly.

Acceptance:

- User can search, edit, save, and download without hunting through panels.

### P3 — Review Notes and Redlines

Goal: comments and suggested edits feel native.

Deliver:

- Review queue in the rail is the entry point.
- Notes list is compact and anchored.
- Redlines are opened in the main canvas, not buried.
- Resolve/accept/reject actions are obvious.

Acceptance:

- User can create a note from selected text or a source hit, find it again, and resolve it.

### P4 — Document-Scoped Skills

Goal: skills feel like document actions, not a separate module product.

Deliver:

- Ready skills appear in the rail.
- Running a skill keeps the user on the document.
- Output links go to artifact/sign-off/record.
- Empty state explains setup in plain English.

Acceptance:

- User can run a skill on this document and understand what was produced.

### P5 — Demo Document Flow

Goal: public demo shows the document product without sign-in.

Deliver:

- Demo Documents shows a realistic file list.
- Demo document reader has search and source-ready copy.
- Demo Skills links back to documents where relevant.
- No sign-in dead ends in the demo path.

Acceptance:

- Someone sent `legalise.dev` can click Demo → Documents → open a file → search/read → understand that skills use these files.

### P6 — Visual Excellence Pass

Goal: Mike-class calm, not admin-table utility.

Deliver:

- More deliberate spacing and type scale.
- Clear active surface.
- Softer rail hierarchy.
- Stronger document canvas.
- Consistent buttons and control density.

Acceptance:

- Browser walkthrough feels like a polished document workspace, not a set of backend features.

## Deferred Unless Needed

- True multiplayer CRDT editing.
- Native DOCX pagination fidelity beyond `docx-preview`.
- PDF annotation persistence.
- Full track-changes import/export parity with Word.
- Mike integration or plugin layer.
- New backend document format abstractions.

These are important, but they are not required before the document workspace feels coherent.

## Review Gate

For every PR in this track:

1. Does it improve the happy path?
2. Does it hide plumbing unless requested?
3. Does it use an existing package or Legalise primitive where possible?
4. Does it avoid bespoke first-party workflow pages?
5. Does it keep the demo path free of sign-in dead ends?

If not, stop and cut scope.
