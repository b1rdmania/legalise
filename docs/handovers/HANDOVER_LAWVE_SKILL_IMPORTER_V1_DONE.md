# Handover — Lawve Skill Importer v1 (DONE, awaiting review)

Built per `docs/handovers/LAWVE_SKILL_IMPORTER_V1_BUILD_BRIEF.md`. Browse
`lawve-ai/awesome-legal-skills` inside Legalise → inspect a skill →
convert it to a **governed Legalise module draft** (manifest v2),
validated through the existing validator. Stateless: no DB persistence.

**Not merged.** On branch `lawve-skill-importer-v1` for diff review.

---

## ⚠️ HEADLINE OPEN ITEM — runtime-representation substrate decision

This is the one thing that needs a call before this feature can produce an
*installable* module from the common case.

**The gap.** Lawve skills are overwhelmingly **prompt-only** (a `SKILL.md`
of instructions + optional reference docs). The Legalise module v2 schema
(`schemas/module.v2.json`) requires every module to declare a `runtime`
(`native` | `mcp`) and an `entrypoint`. There is **no `prompt` runtime**.

**What I did NOT do** (per your stop condition — "the existing manifest
schema cannot represent an imported prompt-only skill without dishonest
fields"): I did not invent a `runtime: "prompt"` or a fake
`entrypoint: {skill: ...}`. Those would pass the eye test and fail the
validator — or worse, pass a loosened validator and lie about what the
module is.

**What I did instead (honest handling):** the draft builder *omits*
`runtime`/`entrypoint` when the source skill has no executable entrypoint.
The draft therefore:
- comes back `valid: false`,
- carries a `needs_runtime_decision` warning,
- shows the real validator errors (`'runtime' is a required property`),
- and the UI labels it **"Imported draft — not yet valid"**, never
  "ready to install".

A human can supply `runtime` + `entrypoint` via draft overrides (the API
accepts them) to produce a valid draft — but the *common prompt-only case
cannot be made valid honestly* until one of these decisions is made:

1. **Add a `prompt` runtime to the v2 schema** (+ an executor that runs a
   SKILL.md as a system-prompt capability under the existing gates). This
   is the "treat skills as first-class" path. Biggest surface, best fit.
2. **Define a canonical prompt→`mcp`/`native` wrapper** (a small native
   entrypoint that loads the SKILL.md text). Smaller schema change, more
   plumbing per import.
3. **Keep importer as "metadata + permission scaffolding only"** — the
   human writes the real entrypoint in `/modules/create`. Lowest effort,
   weakest "killer feature" story.

**Recommendation:** (1). The whole architecture thesis is "any skill,
matter-scoped + permissioned + auditable" — a prompt-runtime capability is
the cleanest expression of that. But this is a schema + executor change
and belongs to you / the reviewer, not an autonomy call.

Everything else below works today regardless of which path you pick.

---

## What landed

### Backend (LSI-1, committed `5c87499`)
- `backend/app/core/lawve_import.py` — importer service. Single stubbable
  GitHub seam `_github_get`. Ref pinned to a commit SHA (`_resolve_ref`),
  in-process 300s TTL cache. `list_skills`, `get_skill`,
  `build_manifest_draft`, `build_draft`. Locked conversion defaults:
  capability `run`, reads `document.body.read`, writes
  `matter.artifact.write`, gates `privilege_posture`, advice_tier_max
  `draft_advice`, 4 standard audit_events. Capability built with all 13
  required fields (`model_access: optional`, `data_movement` local-only,
  etc.). `runtime`/`entrypoint` omitted unless overrides supply them.
- `backend/app/api/lawve_import.py` — 3 authed endpoints under
  `/api/modules`:
  - `GET  /external/lawve/skills`
  - `GET  /external/lawve/skills/{slug}`
  - `POST /external/lawve/skills/{slug}/draft`  (overrides:
    `module_id`, `capability_id`, `capabilities`, `audit_events`, and —
    for the human-confirmed valid path — `runtime`/`entrypoint`)
  - `LawveSourceError` → 502, unknown slug → 404.
- `backend/tests/test_lawve_import.py` — 6 pure service tests, all pass.

### Frontend (LSI-2, on the branch, uncommitted until branch move)
- `frontend/src/modules-v2/LawveImport.tsx` — `/modules/lawve`. List +
  search + filters (licence / has scripts / has references); detail
  (metadata, provenance with pinned SHA + source link, licence, SKILL.md
  preview, **scripts manual-review flag stating scripts are not imported
  or executed**); convert → draft review (trust-state chip, warnings,
  validator errors, manifest copy/download, next-steps pointer to
  `/modules/create` + trust ceremony). **No install affordance.**
- `frontend/src/modules-v2/LawveImport.test.tsx` — 3 focused tests
  (list+search; scripted-skill non-execution flag; convert shows
  "not yet valid" + `needs_runtime_decision`, no install button).
- Wiring: `lib/api.ts` (types + 3 helpers), `lib/route.ts`,
  `router/index.tsx`, `ModulesCatalog.tsx` ("Import from Lawve" link).

## Governance posture (all held)
- Scripts never fetched into runtime, never executed — only **flagged**.
- No auto-install. Draft → human review → existing `POST /api/modules/validate`
  → signing/trust ceremony. The importer never writes a module into runtime.
- Validation never bypassed; the draft is run through `validate_manifest_v2`.
- Licence/provenance surfaced: AGPL-family → `license_review`, missing →
  `license_unknown`; provenance carries repo URL + pinned commit SHA +
  source path; `provenance_mismatch` warning if marketplace vs frontmatter disagree.
- Stateless: no DB rows written.

## Gate
- Backend: `test_lawve_import.py` 6/6 (pre-existing env failures unchanged:
  3 macOS sandbox + 1 demo-seed audit-count, fail on master too).
- Frontend: `tsc -b` clean · `vitest` 169/169 · `vite build` OK.

## Next steps for reviewer
1. Make the **runtime-representation** call above (headline item).
2. Diff-review the branch; merge call yours.
3. If path (1)/(2): a follow-up wires the chosen runtime into the draft
   defaults so prompt-only imports come back `valid: true`.
