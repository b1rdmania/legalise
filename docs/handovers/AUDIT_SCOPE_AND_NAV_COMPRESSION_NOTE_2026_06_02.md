# Audit Scope and Nav Compression Note — 2026-06-02

This note captures the product decision made during the IA reset and Generic Skill Runner discussion.

## Product Principle

The user-facing Record is a matter-level professional accountability record, not a raw audit explorer.

The backend can continue logging richly. The product should not ask ordinary users to read every technical event, admin action, setup action, view event, or raw reconstruction row.

## User-Facing Record Should Lead With

- skill run started / completed
- model call where it matters to the professional story
- output created
- documents or sources referenced where available
- professional sign-off, rejection, or observations
- supervisor review decision where used
- working pack export / download
- permission or privilege blocks that affected the work

## User-Facing Record Should Not Lead With

- workspace audit
- admin audit
- every page view or click
- raw source rows
- backend reconstruction mechanics
- setup/admin activity unless it affected the matter work

Raw rows and source filters can remain available under Advanced details for operators and debugging.

## Navigation Implication

Global navigation should stay small:

- Matters
- Skills
- Settings

Matter navigation should stay work-focused:

- Chat
- Documents
- Skills
- Record
- Working pack

Admin and workspace audit should not be normal primary destinations. They can live under Settings/Admin for operators.

Signed outputs may eventually collapse into Chat/Record once output viewing and sign-off are fully coherent.

## Guardrail For Future Builds

Do not use "audit" as a catch-all product surface. Use:

- Record = matter proof for the solicitor/user
- Advanced details = raw matter audit drill-down
- Workspace audit = operator/admin tooling, hidden from primary nav

This should be carried into PR7, the Generic Skill Runner work, and tomorrow's visual/product polish pass.
