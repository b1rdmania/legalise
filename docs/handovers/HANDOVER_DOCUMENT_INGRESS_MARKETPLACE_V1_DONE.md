# Handover — Document Ingress + Marketplace Clarity v1

Branch: `codex/document-ingress-marketplace-v1`

Frontend-led pass against `JOY.md`: make the product loop clearer without
adding connector sprawl or new substrate.

## What changed

### Document ingress

- `DocumentsTab` now has a first-class "Bring documents in" ingress panel.
- Supports multi-file selection and drag/drop.
- Uploads still go through the existing `POST /api/matters/{slug}/documents`
  path one file at a time, so every document keeps its own hash, text extraction
  result, and `document.upload` / extraction audit rows.
- Replaced free-text tag input with the backend's real tag vocabulary:
  `disclosure`, `draft`, `cleared`, `signed`.
- Shows upload progress and completion/error state inline.

### Marketplace / module clarity

- `/modules` reference-module cards now expose the trust-relevant basics:
  workspace state counts, search, state filter, and each module's declared
  reads/writes summary.
- Cards explicitly say install state is workspace-level and running still
  happens inside a matter after permissions are granted.
- `GrantsPanel` now shows a visible action readiness strip before the technical
  grants details:
  - `Runnable` when all matter permissions are present.
  - `Needs grant` when an installed/enabled module still needs matter grants.
  - "Grant permissions" opens the setup details and preselects the module +
    capability.
- The raw grants table remains available under "Permissions and setup"; the
  substrate facts are not removed, just progressively disclosed.

## Boundaries

- No new backend endpoints.
- No external connectors yet.
- No marketplace/community registry.
- No fake provider validation.
- No changes to install ceremony, grants substrate, audit vocabulary, or role
  gates.

## Verification

- `npm test -- DocumentsTab ModulesCatalog GrantsPanel`
- `npm run typecheck`

Next sensible follow-ups:

1. Provider-readiness hint from backend truth, so `GrantsPanel` stops deriving
   provider needs client-side.
2. A real connector plan starting with document-source import
   (Google Drive / Microsoft 365 / watched folder), reusing this ingress UI.
3. Source anchors.
