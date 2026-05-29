# Handover — Prompt Runtime v1 (DONE, awaiting review)

Built per `docs/handovers/PROMPT_RUNTIME_V1_BUILD_BRIEF.md`. Closes the
headline open item from Lawve Skill Importer v1: prompt-only Lawve skills
now convert to a **valid, governed Legalise module** that can be signed,
installed, granted on a matter, invoked, and produces an audited artifact
— all without a fabricated native/MCP runtime and without executing any
imported script.

**Not merged.** On branch `prompt-runtime-v1` (off `phase-17-crm-pass`).

> A Lawve `SKILL.md` can be imported → converted to a `runtime: "prompt"`
> manifest → validated → signed/installed through the existing ceremony →
> granted on a matter → invoked → writes a `skill_response` artifact →
> appears in audit/reconstruction. Scripts stay unexecuted.

---

## Decision taken

Implemented **Option 1** from the Lawve handover: a first-class `prompt`
runtime, manifest-contained (v1). Rejected (per brief): faking
native/MCP, metadata-only scaffolding, executing scripts, auto-install.

## Schema (`schemas/module.v2.json`)
- `runtime.enum` now `["native", "mcp", "prompt"]`.
- New `entrypoint` oneOf variant **"Prompt skill entrypoint"**:
  `prompt_source: "manifest"` (const) + required `instructions` (minLength 1)
  + optional `references[]` of `{path, content}`. `additionalProperties:false`.
  The oneOf stays exclusive — a prompt entrypoint can't match native/mcp.

## Runtime (`backend/app/core/prompt_runtime.py` — new)
`run_prompt_capability(...)` — the host executes a prompt module directly
(no importable Python entrypoint). Mirrors the canonical native order in
`examples/modules/contract_review/capability.py`, reusing every seam:
1. posture gate — **only if `privilege_posture` is declared in `gates`**
2. read grants enforced (matter-scoped) BEFORE loading any document;
   documents are read only when args supply `document_id`/`document_ids`
   AND the capability declares reads
3. advice-boundary gate at the capability's `advice_tier_max`
4. `module.capability.invoked` audit
5. provider call — skill `instructions` as system prompt; references +
   permitted document text + user `input`/`question` as the prompt
6. `model.invoked` audit (full cost shape)
7. write grants enforced (matter-scoped) BEFORE writing
8. `skill_response` artifact write
9. `module.capability.completed` audit

Dispatch hook: `backend/app/core/runtime.py:dispatch_capability` branches
on `manifest_snapshot["runtime"] == "prompt"` before the importlib path.
No bypass — posture/grants/advice-boundary/gateway/audit all run. All
exceptions it raises (`PostureBlocked`, `CapabilityDenied`,
`ProviderKeyMissing`, `ValueError`) are already translated at the
invocation endpoint.

Artifact kind is **`skill_response`** (chosen, used consistently).

## Lawve importer (`backend/app/core/lawve_import.py`)
- `build_manifest_draft` now defaults `runtime: "prompt"` +
  `entrypoint: {prompt_source: "manifest", instructions: <SKILL.md body,
  frontmatter stripped>}`. Human can still override runtime/entrypoint
  (e.g. to native).
- Adds permitted top-level fields: `description`, `license` (SPDX when
  known), `source_url` (pinned `…/tree/<sha>/skills/<slug>`).
- `needs_runtime_decision` warning repurposed: now only fires if a runtime
  override is supplied without a matching entrypoint.
- Unchanged governance: scripts detected, never imported/executed; AGPL /
  unknown-licence warnings remain; provenance preserved; stateless.

## UI
- `LawveImport.tsx` trust-state: `Validation failed` / `Needs licence
  review` / `Needs script review` / `Ready to sign`. Prompt-only skills
  now usually land on **Ready to sign**. Still no install affordance;
  sign/install only via `/modules/create` + trust ceremony.
- `CreateModule.tsx`: documents `prompt` as a runtime + shows the prompt
  entrypoint shape.

## References limitation (v1)
Reference file **bodies are not embedded** in the manifest by default —
only `instructions` (the SKILL.md body) are. Reference paths are still
surfaced in the importer detail view + a `references_present` warning, and
the schema/runtime DO support embedded `references[]` (override-able). This
keeps manifests small and sidesteps the brief's manifest-size stop
condition. Embedding reference bodies (with a size budget) is the natural
follow-up if real skills need it.

## Manifest-size check (brief's pre-build question)
`manifest_snapshot` is JSONB (handles large text); install validates +
the ceremony signs over canonical JSON; SKILL.md bodies are KB-scale. No
package-storage layer needed for v1 with instructions-only embedding. If
reference bodies get embedded later and manifests grow large, revisit a
module-package storage shape (flagged, not hit).

## Tests
- `backend/tests/test_prompt_runtime.py` (new, 7): schema accepts prompt
  runtime; schema rejects prompt without instructions; invocation happy
  path (200 + `skill_response` artifact + invoked/`model.invoked`/completed
  audit chain); write-grant enforced (no-doc invoke → 403 on
  `matter.artifact.write`); read-grant enforced (doc invoke → 403 on
  `document.body.read`); advice-boundary denial → 403
  `advice_boundary_denied`; missing provider key → 422.
- `backend/tests/test_lawve_import.py` (updated): prompt-only draft now
  validates as `runtime: "prompt"`; native override still validates.
- `frontend` `LawveImport.test.tsx` (updated, 4): prompt-only convert →
  Ready to sign + `runtime: "prompt"` + no install; AGPL → Needs licence
  review.
- Gate: backend full suite **788 passed, 8 skipped, 1 xfailed**; the only
  4 failures are pre-existing env failures unrelated to this work (3
  macOS-only `test_phase3_sandbox` + `test_dev_autoverify_emits_three_audit_rows`
  demo-seed count — all fail on master too). Frontend `tsc` clean,
  vitest 170/170, `vite build` OK.

## Acceptance criteria (brief) — status
- prompt-only skill imports to a valid manifest ✓
- manifest enters the existing sign/install ceremony ✓ (install via
  `source="manifest"`; full ceremony walk)
- installed prompt module granted + invoked on a matter ✓
- invocation produces a matter artifact ✓ (`skill_response`)
- audit/reconstruction shows module/model/artifact chain ✓
- scripts unexecuted ✓ · licence/provenance warnings visible ✓

## Reviewer redlines applied (post-review patch)
- **P1 — `model_access: required` (was `optional`).** An always-model-
  calling runtime under-declaring as optional was too slippery. Imported
  prompt skills now declare the skill capability `model_access:
  "required"` and carry an internal `kind: "provider"` capability
  (`default-provider`, scope `workspace`, model_access `none`) — mirrors
  the Contract Review / Pre-Motion pattern and satisfies the validator's
  required-provider check. Provider kind stays non-invokable (not in the
  invokable-kinds set). Test added: prompt draft validates with
  `model_access: required` + a provider capability present.
- **P2 — advice-boundary denial → 403.** `invocations.py` now translates
  `PermissionError` to a structured `403 advice_boundary_denied` (was an
  untranslated 500). Covers prompt runtime AND the inherited Contract
  Review/Pre-Motion path. Regression test added.
- **P2 — happy-path test pins `model.invoked`** specifically (was
  `startswith("model.")`).

## Remaining limitations / next
- Reference bodies not embedded (see above).
- No MCP runtime yet (separate track).

## For reviewer
Diff-review `prompt-runtime-v1`. Merge call yours — do not expect
auto-merge. Branch base is `phase-17-crm-pass` (carries Lawve importer
backend + UI).
