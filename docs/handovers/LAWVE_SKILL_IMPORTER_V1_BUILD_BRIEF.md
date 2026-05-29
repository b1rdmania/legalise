# Lawve Skill Importer v1 — Build Brief

Status: ready for Builder plan + build.
Branch: `phase-17-crm-pass`.
Date: 2026-05-29.

## Why This Is v1

Legalise now has the governed runtime: matter-scoped permissions, signed installs, artifacts, review decisions, audit reconstruction, export, and lifecycle controls.

The product still needs the marketplace wedge:

> Import legal AI skills from the open web and turn them into governed, auditable Legalise modules.

Lawve is the first concrete source. It already publishes a structured legal-skill repository at:

- `https://github.com/lawve-ai/awesome-legal-skills`

This should be treated as a first-class v1 feature, not a post-launch nice-to-have.

## Source Facts Verified

The Lawve repo is public and structured enough to import.

Repository:

- `lawve-ai/awesome-legal-skills`
- default branch: `main`
- description: "A curated list of awesome Agent Skills for automating legal work"

Important paths:

- `.claude-plugin/marketplace.json`
- `skills/<skill-slug>/SKILL.md`
- `skills/<skill-slug>/LICENSE.txt`
- optional `skills/<skill-slug>/references/`
- optional `skills/<skill-slug>/scripts/`

Marketplace metadata shape:

```json
{
  "name": "lawvable",
  "version": "1.0.0",
  "description": "Bundled agent skills for legal work",
  "plugins": [
    {
      "name": "contract-review-anthropic",
      "description": "Review contracts against your organization's negotiation playbook...",
      "version": "2026.01.30",
      "author": { "name": "Anthropic" },
      "license": "Apache-2.0",
      "source": "./skills/contract-review-anthropic"
    }
  ]
}
```

Sample `SKILL.md` shape:

```md
---
name: contract-review-anthropic
description: Review contracts against your organization's negotiation playbook...
metadata:
  author: Anthropic
  license: Apache-2.0
  version: 2026.01.30
---

# Contract Review Skill

...
```

Licences vary. Some skills are permissive (`Apache-2.0`); some are copyleft (`AGPL-3.0`). Licence must be surfaced before conversion/install.

## Existing Legalise Surfaces To Reuse

Do not build a second module system.

Reuse:

- `/modules` — standalone integrations home.
- `/modules/create` — validate-and-explain page.
- `POST /api/modules/validate` — read-only manifest validation.
- Existing v2 module registry/discovery.
- Existing install ceremony and signing/trust surfaces.
- Existing matter-scoped grants/run/review/audit/export.

Current module decisions remain locked:

- Catalogue/registry split is not silently unified.
- Workspace installed state is distinct from per-matter grant/readiness.
- Create Module is scaffold + validate + explain, not a full visual builder.
- Signing remains explicit; no silent install.

## Goal

Build **Lawve Skill Importer v1**.

A user should be able to:

1. Browse/search Lawve skills from inside Legalise.
2. Inspect a selected skill's metadata, licence, source, `SKILL.md`, references/scripts flags.
3. Convert the skill into a Legalise module draft.
4. Review and confirm proposed permissions/audit events.
5. Validate the generated manifest with the existing validator.
6. Get a clear next step to sign/install through the existing ceremony/CLI.

The user should understand:

- Lawve skill != Legalise module until converted, validated, signed, and installed.
- Imported scripts are not executed.
- Licence/provenance matter.
- Per-matter grants still apply after install.

## Architecture Direction

Prefer a small backend-backed importer over pure browser GitHub calls.

Reasons:

- Keeps GitHub fetch/parsing/provenance consistent.
- Lets the backend pin source commit SHA.
- Lets tests stub one service boundary.
- Avoids browser CORS/rate-limit awkwardness.

Suggested backend surface:

### `GET /api/modules/external/lawve/skills`

Returns searchable/listable Lawve skill catalogue.

Can fetch from GitHub live for v1, or cache lightly in process if needed. Do not add a DB cache unless the build proves it is necessary.

Response row should include:

- `source`: `"lawve"`
- `repo`: `"lawve-ai/awesome-legal-skills"`
- `ref` / commit SHA if available
- `slug`
- `name`
- `description`
- `version`
- `author_name`
- `license`
- `source_path`
- flags:
  - `has_references`
  - `has_scripts`
  - `script_review_required`
- maybe category if derivable; do not invent if absent.

### `GET /api/modules/external/lawve/skills/{slug}`

Returns detail:

- catalogue row fields
- `skill_markdown`
- parsed frontmatter
- references index (names/paths, not necessarily full text unless simple)
- scripts index (names/paths, no execution)
- licence text if present
- provenance:
  - repo URL
  - commit SHA/ref
  - source path

### `POST /api/modules/external/lawve/skills/{slug}/draft`

Returns a Legalise module draft, not an installed module.

Body can include confirmed mapping overrides:

```json
{
  "module_id": "lawve.contract-review-anthropic",
  "capability_id": "run",
  "capabilities": {
    "reads": ["document.body.read"],
    "writes": ["matter.artifact.write"],
    "gates": ["privilege_posture"],
    "advice_tier_max": "draft_advice"
  },
  "audit_events": [
    "module.capability.invoked",
    "model.invoked",
    "module.capability.completed",
    "posture_gate.check.blocked"
  ]
}
```

Response:

- `manifest`
- `valid`
- `errors`
- `source_provenance`
- `warnings`
- `next_steps`

Important: this endpoint must not write a module into the runtime registry unless explicitly approved later. Draft means draft.

## Conversion Policy

The importer should generate a conservative draft.

Default assumptions:

- runtime: use the existing Legalise module runtime pattern where possible.
- one capability: `run` unless a better obvious capability can be derived.
- reads: `document.body.read` if the skill is document/contract/review oriented.
- writes: `matter.artifact.write`.
- gates: `privilege_posture`.
- `advice_tier_max`: `draft_advice`.
- declared audit events:
  - `module.capability.invoked`
  - `model.invoked`
  - `module.capability.completed`
  - `posture_gate.check.blocked`

Warnings:

- if licence is `AGPL-3.0` or unknown, show "licence review required".
- if `scripts/` exists, show "script review required; scripts will not be imported/executed in v1".
- if references exist, show "references included as source material / manual review".
- if frontmatter is missing or inconsistent with marketplace metadata, show a provenance warning.

Do not claim legal correctness from an imported skill. Copy should say it is converted into a governed module draft requiring review/signing.

## Frontend Surface

Add to modules area.

Preferred route:

- `/modules/lawve`

Could also be a tab/section inside `/modules`, but a route is better for a large catalogue.

UI:

1. Header:
   - "Lawve skill import"
   - Explain: "Import open legal AI skills into Legalise as governed module drafts."

2. Search/list:
   - search by name/description/author/license
   - filters: licence, has scripts, has references
   - cards: name, description, author, version, licence, flags

3. Detail drawer/page:
   - skill metadata
   - source/provenance
   - licence
   - `SKILL.md` preview
   - references/scripts flags
   - "Convert to module draft"

4. Conversion review:
   - proposed module id
   - proposed permissions
   - proposed gates
   - declared audit events
   - warnings
   - validate result

5. Output:
   - show generated manifest JSON
   - copy/download manifest
   - link to `/modules/create` or reuse its validation display
   - sign/install instructions

No one-click silent install in v1.

## Trust / Safety Queue

Keep lightweight.

Imported skills have a visible state:

- `Imported draft`
- `Needs licence review`
- `Needs script review`
- `Ready to sign`

Do not build a full moderation product unless it naturally falls out of the model. A frontend warning/state is acceptable for v1.

If adding persistence is necessary, stop and plan it. The preferred v1 is stateless draft generation + user downloads/copies the manifest.

## Non-Negotiables

- Do not execute imported scripts.
- Do not auto-install imported skills.
- Do not silently grant broad access.
- Do not bypass `POST /api/modules/validate`.
- Do not bypass signing/trust ceremony.
- Do not treat external skill text as trusted runtime code.
- Do not ignore licence/provenance.
- Keep per-matter grants.
- No admin/superuser shortcut.
- No role hierarchy work.
- No new audit source.

## Stop Conditions

Stop and ask if:

- GitHub access/rate limits make live fetch unusable and a DB cache is required.
- The Lawve licence terms block redistribution/import in a way that changes product copy.
- Draft generation needs to write files into the runtime module directory.
- Installing imported modules requires bypassing signing/trust ceremony.
- The existing manifest schema cannot represent an imported prompt-only skill without dishonest fields.

## Testing

Focused backend:

- marketplace fetch parses `.claude-plugin/marketplace.json`.
- detail fetch parses `SKILL.md` frontmatter/body.
- scripts/references flags detected.
- draft endpoint returns manifest + warnings.
- draft validates via existing validator.
- no DB writes / no audit rows.

Focused frontend:

- list/search renders skills.
- detail shows provenance/licence/flags.
- scripts flag blocks/marks as manual-review.
- conversion shows proposed permissions/audit events.
- validation errors render.
- generated manifest copy/download visible.

Run typecheck/build before final.

Full backend/frontend at merge/CI gate. E2E only if routing/auth affects the main demo path.

## Deliverables

1. Plan/inventory update if the Builder discovers a source-format mismatch.
2. Backend importer service/endpoints.
3. Frontend `/modules/lawve` surface.
4. Tests.
5. Handover:
   - endpoints shipped
   - source format handled
   - conversion policy
   - trust/licence handling
   - tests run
   - limitations

## Suggested Handover Name

`docs/handovers/HANDOVER_LAWVE_SKILL_IMPORTER_V1_DONE.md`

## Copy-Paste Starter For Builder

Read `docs/handovers/LAWVE_SKILL_IMPORTER_V1_BUILD_BRIEF.md`. Build Lawve Skill Importer v1: browse/search `lawve-ai/awesome-legal-skills`, inspect `SKILL.md` + metadata/provenance/licence, convert into a Legalise module draft, validate using the existing manifest validator, and present sign/install next steps. Do not execute scripts, auto-install, bypass signing, or write imported modules into runtime without explicit approval. Use focused tests and stop only if source format/licensing/cache requirements force a new substrate decision.
