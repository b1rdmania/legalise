# Prompt Runtime v1 — Build Brief

Status: next required build after Lawve Skill Importer v1.
Branch: `phase-17-crm-pass` for planning; implementation may continue from `lawve-skill-importer-v1` after review.
Date: 2026-05-29.

## Why This Exists

Lawve Skill Importer v1 correctly exposes the key substrate gap:

Lawve skills are mostly prompt-only (`SKILL.md` instructions + optional references), but Legalise module v2 currently requires:

- `runtime`: `"native"` or `"mcp"`
- `entrypoint`: native Python module or MCP transport

There is no honest way to make a prompt-only skill installable today without pretending it is native/MCP code. The importer correctly returns `valid: false` + `needs_runtime_decision` instead of fabricating fields.

For the v1 killer feature, that is not enough. We need prompt-only Lawve skills to become installable governed modules.

Headline:

> A Lawve `SKILL.md` can be imported, validated, signed, installed, granted on a matter, run under Legalise gates, produce an artifact, and appear in reconstruction/review/export.

## Decision Call

Choose **Option 1 from the Lawve handover**:

Add a first-class `prompt` runtime to the module schema and runtime dispatcher.

Rejected for v1:

- Wrapping every prompt skill as fake `native` or fake `mcp`.
- Keeping the importer as metadata-only scaffolding.
- Executing imported scripts.
- Auto-installing imported skills.

## Target User Flow

1. User opens `/modules/lawve`.
2. User selects a Lawve skill.
3. User clicks convert.
4. Draft manifest includes:
   - `runtime: "prompt"`
   - prompt entrypoint pointing at imported `SKILL.md` text / source payload
   - conservative capabilities
   - provenance
5. Draft validates.
6. User signs/installs through the existing ceremony.
7. User grants the module on a matter.
8. User runs the prompt module.
9. Runtime builds a prompt from:
   - the imported skill instructions
   - selected matter/document context permitted by grants
   - explicit user arguments
10. Runtime calls the existing model gateway.
11. Runtime writes a matter artifact.
12. Audit/reconstruction/supervisor review/export all work like other modules.

## Non-Negotiables

- No untrusted script execution.
- References are source text/context only, not executable code.
- No auto-install.
- No signing/trust bypass.
- No broad default permissions.
- Per-matter grants remain required.
- Existing posture gate remains honoured.
- Existing provider/BYO-key path remains honoured.
- Existing audit actions should be reused where honest.
- No new audit source.
- No role hierarchy work.

## Schema Work

Update `schemas/module.v2.json`:

- Add `"prompt"` to `runtime.enum`.
- Add a prompt entrypoint variant, for example:

```json
{
  "title": "Prompt skill entrypoint",
  "type": "object",
  "required": ["prompt_source"],
  "properties": {
    "prompt_source": {
      "type": "string",
      "enum": ["manifest"]
    },
    "instructions": {
      "type": "string",
      "minLength": 1
    },
    "references": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "content"],
        "properties": {
          "path": { "type": "string" },
          "content": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

This is intentionally manifest-contained for v1. It avoids adding a new external file store/import persistence layer. If the manifest becomes too large for real-world skills, that becomes a later module package/storage phase.

Question for Builder to verify before coding:

- Does manifest size/create/install path comfortably handle large Lawve `SKILL.md` + references?
- If not, stop and propose a package storage shape before building.

## Runtime Work

Add prompt runtime support where module invocation dispatch currently handles `native` / `mcp`.

Behaviour:

- Load instructions from `manifest.entrypoint.instructions`.
- Load references from `manifest.entrypoint.references`.
- Build a model prompt with:
  - skill instructions
  - references
  - module id / capability id
  - user args
  - permitted matter/document text only through existing grant checks
- Call existing provider/model gateway adapter.
- Write a matter artifact with a generic but useful kind:
  - `skill_response` or `analysis_pack`
  - Pick one and use consistently.
- Return artifact summary through existing invocation response shape.

Important:

- Prompt runtime must use existing `InvocationContext`.
- Prompt runtime must use existing capability checks, not bypass them.
- If document reads are declared, require matching grants before reading.
- If artifact writes are declared, require matching grants before writing.
- Posture gate should run if declared in `gates`.

## Lawve Importer Update

Update Lawve draft generation:

- For prompt-only skills, generate:
  - `runtime: "prompt"`
  - `entrypoint.prompt_source: "manifest"`
  - `entrypoint.instructions`: SKILL.md body or full markdown
  - `entrypoint.references`: only non-script reference files if included/fetched
- Preserve provenance in response and, if schema permits, manifest fields such as:
  - `source_url`
  - `license`
  - `description`
  - `jurisdictions` if derivable, otherwise omit

Still:

- scripts detected but not included/executed.
- AGPL/unknown licence warning remains.
- user confirms permissions.

## UI Work

Update `/modules/lawve`:

- Prompt-only converted drafts should now usually show `valid: true` unless licence/script warnings apply.
- Trust-state should distinguish:
  - `Ready to sign`
  - `Needs licence review`
  - `Needs script review`
  - `Validation failed`
- Still no auto-install.
- Show that imported scripts are excluded.
- Show what references were included.

Update `/modules/create` if useful:

- Mention `runtime: "prompt"` as a supported runtime.
- Prefill/sample manifest should include a small prompt-runtime example.

## Tests

Backend focused:

- Schema accepts prompt runtime entrypoint.
- Schema rejects prompt runtime without instructions.
- Lawve prompt-only draft now validates.
- Scripted Lawve skill still warns and does not include scripts.
- Prompt runtime invocation:
  - requires document read grant when reading docs.
  - requires artifact write grant before writing output.
  - emits/uses existing model invocation audit path.
  - writes artifact.
  - rejects missing provider key through existing path.

Frontend focused:

- Lawve convert shows `Ready to sign` for a simple prompt-only skill.
- Warnings still render for AGPL/scripts.
- Manifest includes `runtime: "prompt"`.
- `/modules/create` prompt-runtime example renders if changed.

Full backend/frontend at merge gate. E2E optional unless a first-run flow is altered.

## Stop Conditions

Stop and ask if:

- Manifest-contained prompt/reference text makes manifests too large for install/update/signing.
- Prompt runtime needs a new module package storage model.
- Existing invocation dispatcher cannot support a prompt runtime without a broad refactor.
- Prompt runtime would require bypassing existing grants/posture/model gateway.
- Imported references include binary/script content that cannot be represented honestly as prompt context.

## Acceptance Criteria

Prompt Runtime v1 is complete when:

- A simple Lawve prompt-only skill imports to a valid manifest.
- The manifest can enter the existing sign/install ceremony.
- The installed prompt module can be granted and invoked on a matter.
- Invocation produces a matter artifact.
- Audit/reconstruction shows the module/model/artifact chain.
- Scripts remain unexecuted.
- Licence/provenance warnings remain visible.

## Suggested Handover

`docs/handovers/HANDOVER_PROMPT_RUNTIME_V1_DONE.md`

Include:

- schema changes
- runtime dispatch changes
- Lawve importer changes
- UI changes
- tests run
- remaining limitations

## Copy-Paste Starter For Builder

Read `docs/handovers/PROMPT_RUNTIME_V1_BUILD_BRIEF.md` and the Lawve importer handover. Build Prompt Runtime v1 so Lawve prompt-only skills can become valid Legalise module manifests and run as governed modules. Keep scripts unexecuted, signing/trust explicit, per-matter grants required, and audit/review/export behaviour integrated. Stop only if manifest-contained prompt/reference text requires a package storage design or if prompt runtime would require bypassing existing grants/posture/model gateway.
