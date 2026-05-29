# Matter Desk UX Pass Done

Status: built on `codex/matter-desk-ux-pass`.
Date: 2026-05-29.

## Why

The public demo and matter workspace had started exposing substrate categories instead of the solicitor's working loop. The left nav was acceptable, but page bodies duplicated context and surfaced too much setup: matter stat strips, right-rail assistant, fake demo document controls, raw workflow failure framing, and "Workflows" language that read like implementation.

This pass makes the workspace quieter without changing routes or substrate.

## What Changed

- `Matter desk` replaces `Assistant` as the sidebar label.
- `Actions` replaces `Workflows` in the sidebar, breadcrumb, and assistant composer.
- The matter page no longer renders `MatterRecordSummary` above every tab. The breadcrumb + left matter card already carry that context.
- The right-rail assistant is removed from live matter pages and the public demo. Assistant remains available as its own matter section.
- `MatterPulse` is rewritten from a numeric strip into a calm readiness line: documents loaded, chronology available, governed actions ready, Activity Trail written.
- `AssistantTab` no longer renders a second explanatory panel above existing messages.
- `DocumentsTab` collapses the upload ingress behind `Add documents` once documents exist.
- Demo documents are read-only records, not fake edit/anonymise panels.
- Workflow load errors now show a workspace-facing account CTA instead of a red raw-ish error block.

## Boundaries Held

- Frontend-only.
- No route changes.
- No substrate/API changes.
- No role hierarchy or qualified-solicitor gate.
- No fake document-open/edit controls in the public demo.
- Activity Trail remains the trust spine; it is not hidden.

## Verification

- `npm run typecheck` clean.
- `npm test -- --run` clean: 189 tests / 28 files.
- `npm run build` clean.
- Browser-smoked locally at `http://127.0.0.1:3001/demo`, `/demo/documents`, and `/demo/workflows`.

## Remaining UX Work

- Source Anchors v1 remains the next trust slice: source chips should feed artifact detail, sign-off, and export.
- The full matter "desk" could still be consolidated further after Source Anchors: Work Product / Documents / Activity Trail / Actions may be enough for v1.
- Desktop-width browser review is still useful before merge because the Codex in-app browser screenshot was narrow.

