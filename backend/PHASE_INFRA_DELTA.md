# Phase Infra Delta Sheet — Legalise broader v0.1

**Base head:** `be8af63` on `master` (Phases A + B + C committed; B + C through Codex R3; Contract Review SSE UI wiring lands P2.8). Phase D + E still pending.
**Scope:** reconcile `HANDOVER_INFRA_REVIEW.md` Batches 1–5 against `BUILD_PLAN_BROADER.md` §4g–§4j (PHASE_D + PHASE_E) and the deferred App.tsx split. Output a single execution path to v0.1 launch.
**Budget:** ~2,800–3,400 LoC net new for the reconciled infra + D + E work (delta over the standalone D + E plan: +~700–900 LoC).
**Working scratch — delete on launch commit.**

---

## 0. Reading guide

This sheet supersedes the work-ordering hints at the top of `PHASE_D_DELTA.md` and `PHASE_E_DELTA.md`. The scope inside those two sheets stays intact; what changes is (a) what is folded into D from the infra review and what runs parallel, (b) when the App.tsx split lands, (c) what is explicitly v0.2.

The product lock is unchanged: privilege posture, audit semantics, matter/module legal shape, Python/FastAPI, gateway posture-aware provider selection. P0 items from §"Do Not Replace These" stay bespoke.

---

## 1. Reconciled execution order — HEAD `be8af63` → launch

Days are working-day estimates at AI-pair-programming velocity; the reviewer-round-trip overhead is in the build-plan §5 "15–22 days" envelope.

| # | Unit | Source | Days | Blocks | Thin-proof vs credible-demo |
|---|---|---|---|---|---|
| 1 | **Batch-1 parser libs + audit centralisation** (PyYAML / python-frontmatter / jsonschema; sweep direct `AuditEntry(...)` to `audit.log()` helper) | infra-batch-1 + infra-P6 | 1.0–1.5 | unblocks PHASE_D W2 export envelope schema-validation, unblocks PHASE_D W1 catalog filter on disabled skills | Thin: parsers swapped + audit helper covers all module routers. Credible: `module.json` rejected with structured 422 in Modules page. |
| 1a | **Structured-output helper** — `backend/app/core/structured_output.py::parse_model_json(raw, model)`; four ad-hoc regex sites retire (`contract_review/agents.py`, `document_edit/pipeline.py`, `pre_motion/agents.py`, `anonymisation/prompts.py`). Lives **outside** `model_gateway.py` — gateway routes/audits, parsing is a consumer concern. | infra-P3 (helper half) | 0.25 | unblocks Phase E W2 evals having stable parsing surface; provider-native tools is v0.2/v0.3 gateway upgrade | Thin: helper + four call-site swaps. Credible: same. |
| 2 | **W0 — App.tsx split** (Phase B's deferred W0) | build-plan-phase-B W0 | 1.0 | bridge between Phase C and any further frontend work; unblocks PHASE_D W1 UI cleanly, unblocks deferred buttons (Letters/Pre-Motion `.docx`, Anonymise) without monolith collision | Binary (build green, pixel-identical, ~3,450 lines moved across ~25 files). No defer. |
| 3 | **PHASE_D W1 — Workspace enable/disable lifecycle (§4i)** + **wire the three deferred buttons** (Letters .docx, Pre-Motion .docx, Anonymise) inside the post-split tabs | build-plan-phase-D + Phase B/C deferred UI | 1.5–2.0 | catalog filter relies on Batch-1 audit helper; deferred buttons need post-split DocumentsTab + LettersTab + PreMotionTab files | Thin: toggle endpoints + UI; deferred buttons land. Credible: disabled-pill on Modules tab + audit-tab `module` filter. |
| 4 | **Batch-2 module manager v0.1 — folded into PHASE_D W1** (manifest discovery becomes load-bearing; declared capabilities are schema-validated and displayed for review; enable/disable enforced at the `(plugin, skill)` layer — runtime per-capability enforcement is v0.2 doctrine) | infra-batch-2 (folded) | +0.5–1.0 on top of #3 | matches Phase D W1 acceptance bar; reframes the bar from "skill toggle" to "schema-validated module manifest + enable/disable enforcement" | Thin: existing `(plugin, skill)` toggle + `module.json` schema validation displayed in UI. Credible: declared capabilities rendered as trust-posture badges per skill row. **Do not describe v0.1 as "capability-gated."** |
| 5 | ~~PHASE_D W2 — Matter wire-format RFC + importer/exporter (§4g)~~ **CUT to v0.3 (Andy 2026-05-15)** — no real second user / second matter to pressure-test the wire format at v0.1. Doctrine moves to `docs/ROADMAP.md` v0.3+ with the locked two-mode framing. | — | — | — |
| 6 | **PHASE_D W3 — Public module submission flow (§4h)** | build-plan-phase-D | 1.5–2.0 | needs `GITHUB_SUBMISSION_TOKEN` (`b1rdmania`-scoped PAT, NOT `ziggythebot`) + Turnstile keys provisioned. Schema validation of submitted SKILL.md frontmatter uses Batch-1 `python-frontmatter`. | Thin: form + endpoint opens draft PR via PAT; IP rate-limit only. Credible: Turnstile + preview pane + submission_enabled config gate. |
| 7 | **Batch-3 frontend state cleanup — DEFERRED to v0.2** (TanStack Router + Query migration) | infra-batch-3 (deferred) | 0 in v0.1 | n/a — see §2.3 below | n/a |
| 8 | **Batch-5 docx templates — partial fold into PHASE_E W1** (template directory exists; LBA letter ships as the one template-driven export for solicitor-cold-read launch screenshots) | infra-batch-5 (partial) | 0.5–1.0 | depends on the Phase B `generate_docx` plumbing being stable; lands inside Phase E W1 screenshot polish day | Thin: LBA-only template; Pre-Motion + Contract Review stay procedural. Credible: all three solicitor-facing exports template-driven. Recommendation: thin-proof for v0.1. |
| 9 | **PHASE_E W1 — Documentation rewrite** (README + PEERS + MANIFESTO sweep + ROADMAP + ATTRIBUTIONS) | build-plan-phase-E | 1.0 | foundation; all later launch artifacts cross-link here | Binary (solicitor-first README is launch-gate). |
| 10 | **PHASE_E W2 — Four smoke evals** (matter-portability eval cut with #5 — Andy 2026-05-15) | build-plan-phase-E | 1.0 | none (#5 cut) | Existing-surface evals: audit-row, posture-routing, redline-anchor, NDA-parse. |
| 11 | **PHASE_E W3 — Pre-flight + Day-15 deploy delta** (add `presidio-analyzer`, `spacy en_core_web_sm`, `GITHUB_SUBMISSION_TOKEN`, `TURNSTILE_*`, plus the new Batch-1 deps to Dockerfile) | build-plan-phase-E | 0.5 | Pre-flight runbook must surface new env vars + Python deps before Andy hits a 500 | Binary. |
| 12 | **PHASE_E W4 + W5 — Launch posture + Day-18 coordination** (HANDOVER_LAUNCH rewrite + Will/Jan DM refines + HN/X/LinkedIn final drafts) | build-plan-phase-E | 1.0 | Andy files all DMs, issues, discussions. Agent refines drafts only. | Binary. |
| 13 | **Batch-3 (TanStack), Batch-4 (jobs), Batch-5 remaining (Pre-Motion + Contract Review templates)** | v0.2 | — | Post-launch infra hardening. | — |

**Total v0.1 build days from HEAD `be8af63`:** ~10.5–14 working days. Within build-plan §5's "15–22 days" envelope (which already absorbs reviewer rounds + Andy's other commitments).

**Critical sequence constraints:**
- #1 must precede #5 (`jsonschema` is load-bearing on §4g import validation).
- #2 must precede #3 (deferred-button JSX surgery into the monolith is harder to review than into post-split tab files; this was the explicit recommendation across Phase B + C handovers).
- #4 is **folded** into #3, not parallel — the module manager v0.1 *is* §4i, raised to include capability declarations.
- #11 must precede Day-15 deploy (Andy needs the env-var list before flipping Fly secrets).

---

## 2. Conflict resolutions

### 2.1 Batch-1 parsers vs PHASE_D W2 importer/exporter — **resolve by sequencing**

**Conflict:** PHASE_D_DELTA W2 says "no new backend deps" and uses stdlib `tarfile`/`gzip` for the matter tarball. Infra review P4 says swap to `PyYAML` / `python-frontmatter` / `jsonschema`. These are not mutually exclusive but the dep additions land in the wrong order if D ships first.

**Resolution:** Batch-1 parsers land **before** PHASE_D W2. Specifically:
- `jsonschema` validates the imported `matter.json` envelope in `POST /api/matters/import` using `Draft202012Validator(schema).iter_errors(payload)`; each `ValidationError` is converted to `{path: "/" + "/".join(map(str, e.absolute_path)), message: e.message}` and surfaced in the 422 body. `jsonschema.validate()` is not sufficient — it raises a blunt exception. Replaces hand-rolled Pydantic-only validation of the schema-versioned envelope.
- `PyYAML` (or `ruamel.yaml`) generates `matter.md` frontmatter inside the exporter and parses on the importer. Hand-rolled YAML rendering inside `core/matter_fs.py` retires.
- `python-frontmatter` parses SKILL.md frontmatter inside `adapters/plugin_bridge.py` discovery — used by **both** PHASE_D W1 capability surfacing and PHASE_D W3 submission preview (submission flow synthesises a SKILL.md from form input; backend authoritative builder uses the library so the round-trip is symmetric).

**Rationale:** parser bugs in homemade YAML / frontmatter are not the Legalise thesis. Doing this before the export/import RFC means the wire format ships with library-validated parsing on day one — peer reviewers (Stella / Mike maintainers) inspecting the RFC see boring parsers, which strengthens the "regulator-shape wedge, not parser code" argument.

### 2.2 Batch-2 module manager vs PHASE_D §4h + §4i — **fold, not parallel**

**Conflict:** Infra review P7 + Batch-2 frames module manager v0.1 as "manifest discovery + enable/disable + capability gates." PHASE_D §4h is submission flow; PHASE_D §4i is enable/disable. They overlap but the infra review adds the capability-declaration dimension that the build plan stops short of.

**Resolution:** Fold Batch-2 into PHASE_D W1 (§4i). Concretely:
- The existing W1 `(plugin, skill)` toggle stays as-is.
- `module.json` schema gets two new optional fields surfaced (not enforced): `capabilities: list[str]` and `trust_posture: "trusted" | "third_party" | "experimental"`. Schema in `schemas/module.json`; validation via Batch-1 `jsonschema`.
- Modules page renders capability list + trust posture per skill row (read-only display).
- **v0.1 claim, exact wording:** module enable/disable is enforced; declared capabilities are schema-validated and displayed for review. Runtime per-capability enforcement is v0.2 doctrine — manifest capabilities become enforceable policy then. Do not use "capability-gated" anywhere in v0.1 launch copy, README, or UI.
- PHASE_D §4h (submission flow) stays separate — it ships as W3 unchanged; the form gains an optional capabilities multi-select that lands in the generated SKILL.md frontmatter, parsed back via `python-frontmatter`.

**Rationale:** the infra review's "build the cool bit, not npm" is exactly aligned with the existing §4i acceptance bar. Folding (rather than paralleling) avoids two competing toggle surfaces. The capability-declaration upgrade is +~150 LoC on top of W1's ~350; well inside the Phase D envelope.

### 2.3 Batch-3 TanStack vs App.tsx split — **split now, TanStack v0.2**

**Conflict:** Infra review P1 says move to TanStack Router + Query (already in deps). Build plan defers App.tsx split; Phase B + C handovers flag it as overdue. Executing agent's note: TanStack on a monolith is 3–5 days of churn.

**Resolution:**
1. Ship the **App.tsx split now** (work unit #2 above, ~1 day mechanical). This is Phase B W0 paid down, not new scope. No data-layer change.
2. **TanStack Router + Query is deliberately v0.2.** Reasons: (a) the executing agent's 3–5 day estimate is honest — that is a separate phase on the post-split tree, with real reviewer-round risk; (b) the launch artifact is solicitor-cold-read, not developer-cold-read, so reviewer-grade route plumbing is not on the launch path; (c) post-split, individual tabs can migrate to TanStack Query piecemeal at v0.2 without further churn.
3. The post-split tree keeps the existing hash router (`lib/route.ts`) and the existing `lib/api.ts` fetch client. No new dependencies removed; the installed `@tanstack/react-query` + `@tanstack/react-router` remain unused-but-installed until v0.2. (Acceptable — they cost ~0 bytes on the dev tree and ~0 on the prod bundle if not imported.)

**Rationale:** the split is the bridge. TanStack is the next bridge. Trying to ship both before launch would burn 4–6 days on plumbing the cold reader never sees.

### 2.4 Batch-5 docx templates vs PHASE_E launch positioning — **superseded 2026-05-15**

**Original conflict (kept for the record):** Infra review P5 wanted template-driven `.docx` for solicitor-facing artefacts before launch screenshots. PHASE_E W4 wanted screenshots of Letters + Pre-Motion + Contract Review.

**Current resolution (supersedes the original):** see §4 decision 4 below. `docxtpl` rejected for v0.1 (LGPL-2.1 not worth the licence-explanation friction on an Apache-2.0 launch). LBA stays on the existing procedural `generate_docx` path. Templating library returns to the v0.2 backlog if document polish becomes more important than licence simplicity.

**Rationale:** the LBA is the highest-frequency solicitor-cold-read artifact (it's the Khan demo's headline output). Procedural Word assembly for *one* document is the high-ROI swap; doing all three at launch is 1–3 days the launch path cannot absorb. Pre-Motion + Contract Review templates land in v0.2 once a real solicitor reviewer has signalled which one matters most.

**Andy's call to make:** the recommendation rests on the assumption that solicitors will see the LBA cold at launch (it's screenshot-able from the Khan seed) but Pre-Motion + Contract Review will mostly be demoed live (where layout polish matters less). If Andy expects cold-read screenshots of all three, push Pre-Motion template into v0.1 too (+0.5 day).

---

## 3. Per-batch concrete scope (surviving batches)

### 3.1 Batch-1 — parser libs + audit centralisation (work unit #1)

**Backend deps (new in `backend/pyproject.toml`):**
- `pyyaml>=6.0` (or `ruamel.yaml>=0.18` if round-trip ordering matters)
- `python-frontmatter>=1.1`
- `jsonschema>=4.21`

**Modify:**
- `backend/app/core/matter_fs.py` — replace hand-rolled `matter.md` frontmatter renderer with `yaml.safe_dump` block between `---` fences. Replace any in-place parser with `frontmatter.loads`. **Audit payload shape unchanged.** ~40 LoC delta.
- `backend/app/adapters/plugin_bridge.py` — SKILL.md frontmatter parsing via `frontmatter.loads`. Currently hand-rolled in `_parse_skill_metadata` (or equivalent). ~30 LoC delta.
- `backend/app/api/modules.py` — `GET /api/modules` validates each discovered `module.json` against `schemas/module.json` via `jsonschema.validate`. Invalid manifests surface a structured `{plugin, skill, errors: [...]}` row in the response so the Modules page can render a "broken manifest" warning. ~50 LoC delta.
- `schemas/module.json` — add `capabilities: list[enum]` and `trust_posture: enum` fields (optional, additive only). Folds into Batch-2.

**Audit centralisation sweep — infra-P6:**

Touch every file in the `AuditEntry(` grep list and route through `audit.log()` (the `_AuditAPI.log` helper already in `core/api.py`). Files to sweep:
- `backend/app/api/documents.py` (multiple sites)
- `backend/app/api/matters.py`
- `backend/app/modules/letters/router.py`
- `backend/app/modules/pre_motion/router.py`
- `backend/app/modules/anonymisation/pipeline.py`
- `backend/app/modules/contract_review/router.py`
- `backend/app/modules/case_law/service.py`
- `backend/app/modules/case_law/router.py`
- `backend/app/modules/chronology/router.py`
- `backend/app/modules/document_edit/pipeline.py`
- `backend/app/modules/document_edit/resolver.py`
- `backend/app/core/tools/edit_document.py`
- `backend/app/core/tools/replicate_document.py`
- `backend/app/core/tools/generate_docx.py`

**Constraints (per infra-P6 + product lock):**
- Action names + module names + actor IDs + resource_type + resource_id + payload shape are **unchanged**. The helper takes them as explicit kwargs.
- Allowed direct `AuditEntry(...)` survivors (four): `backend/app/core/audit.py` (the helper layer); `backend/app/core/api.py` (the `_AuditAPI.log` helper constructs `AuditEntry(...)` here); `backend/app/models/audit.py` (model definition); the audit middleware. Everything else routes through `audit.log(...)`.
- **Required v0.2 follow-on:** action-name constants module (`app/core/audit_actions.py` with `MODULE_LETTERS_DOCX_EXPORTED = "module.letters.docx.exported"` etc.) — call sites import. v0.1 keeps strings (launch-path churn budget); v0.2 is not negotiable.

**Pydantic / type changes:** none. The helper signature already matches.

**Acceptance:**
- `grep -rn "AuditEntry(" backend/app/ --include="*.py"` returns only the four permitted sites (`core/audit.py`, `core/api.py` helper, `models/audit.py`, audit middleware).
- Every **module-semantic** audit row has non-null `module` (the column added in Phase A; Codex R1 enforcement preserved). Middleware `http.*` rows are allowed to remain `module=null` — they are infrastructure, not module activity.
- `python -m compileall backend/app` clean.
- Existing audit-row evals (Phase E W2) stay green when run after this batch.

**LoC:** ~250 backend (most of it 1-line `AuditEntry(...)` → `await audit.log(...)` swaps).

### 3.1a Work unit #1a — Structured-output helper

**New:** `backend/app/core/structured_output.py`.

```python
def parse_model_json(raw: str, model: type[BaseModel]) -> BaseModel:
    """Extract JSON from a model response (handles ```json fences, leading prose)
    and validate against `model`. Raises StructuredOutputError on parse/validate
    failure with the raw text attached for audit."""
```

Call-site swaps:
- `backend/app/modules/contract_review/agents.py`
- `backend/app/modules/document_edit/pipeline.py`
- `backend/app/modules/pre_motion/agents.py`
- `backend/app/modules/anonymisation/prompts.py`

**Boundary doctrine:** the gateway routes and audits model calls; structured-output parsing is a consumer concern. Do not co-locate inside `model_gateway.py`. Provider-native schema/tool-calling is a v0.2/v0.3 gateway upgrade — it interacts with R2/R3 posture-aware provider selection and must not be rushed.

**LoC:** ~80.

### 3.2 Work unit #2 — App.tsx split (Phase B W0)

Scope verbatim from `PHASE_B_DELTA.md` §"W0 — App.tsx split." Target structure under `frontend/src/{app,auth,landing,matter,modules,ui,modules-page,lib}/` already specified there. ~3,450 lines moved (current size 3,448; Phase C added ~14 over Phase B baseline of ~3,343).

**Mechanical-only.** No behaviour change, no new components, no data-layer touches. Build green; pixel-identical UI before/after.

**Gotcha (per PHASE_B_DELTA):** lift `AuthProvider` + `useAuth` together into `app/App.tsx` root — not one component at a time.

**LoC:** 0 net. ~3,450 moved.

### 3.3 Work unit #3 — PHASE_D W1 + deferred buttons + Batch-2 fold

Backend per `PHASE_D_DELTA.md` §"W1 — In-app module install lifecycle" unchanged. Adds:

**Manifest declaration surface (Batch-2 fold):**
- `backend/app/api/modules.py::GET /api/modules/me` response includes per-skill `capabilities: list[str]` and `trust_posture: str` from the manifest (parsed by Batch-1's `frontmatter` + `jsonschema`-validated `module.json`).
- `frontend/src/modules-page/Modules.tsx` (post-split) renders capability badges + trust-posture pill per skill row, labelled as **declarations under review** — not enforcement.
- **Enforcement in v0.1 is the `(plugin, skill)` enable/disable check.** v0.1 does not gate per-capability at the call site (v0.2 doctrine — see §5).

**Deferred buttons (Phase B + C follow-ups):**
- `frontend/src/matter/tabs/LettersTab.tsx` (post-split) — wire `Download .docx` button per the Phase B handover §"What's NOT in this commit." Backend endpoint exists since Phase B.
- `frontend/src/matter/tabs/PreMotionTab.tsx` (post-split) — same.
- `frontend/src/matter/tabs/DocumentsTab.tsx` (post-split) — wire `Anonymise` button per the Phase C handover §"What's NOT in this commit." Endpoints exist since Phase C; `AnonymiseButton` / `RedactedToggle` / `MappingTable` components already shipped in `frontend/src/modules/anonymisation/`.
- `frontend/src/modules/tabular_review/api.ts`, `frontend/src/modules/case_law/api.ts`, `frontend/src/modules/anonymisation/api.ts`, `frontend/src/modules/contract_review/api.ts` — consolidate verbatim into `frontend/src/lib/api.ts` (low-cost follow-up flagged in Phase B + C handovers).

**Note:** Phase B's `2a082eb` already shipped the three deferred buttons in App.tsx as inline JSX. The post-split move re-homes them into the right tab files; no net new UI wiring beyond the consolidation pass.

**Audit conventions (PHASE_D_DELTA preserved):**
- `module.skill.disabled` → module=`module_lifecycle`
- `module.skill.enabled` → module=`module_lifecycle`
- (capability render is read-only; no new audit events)

**LoC:** ~450 (Phase D W1's ~350 + ~100 for the consolidation diffs + capability-render component).

### 3.4 PHASE_D W2 + W3 (work units #5, #6)

**No scope change** vs `PHASE_D_DELTA.md`. Two refinements:

W2 importer (`backend/app/api/exports.py`):
- Schema-validates `matter.json` against `schemas/matter.json` via `Draft202012Validator(schema).iter_errors(payload)` (Batch-1 dep). Each error converted to `{path: "/" + "/".join(map(str, e.absolute_path)), message: e.message}`; the full list returned in the 422 body. Do not use `jsonschema.validate()` — it raises on first error.
- Generates `matter.md` via `yaml.safe_dump` between frontmatter fences.

W3 submission flow (`backend/app/api/submissions.py`):
- Backend SKILL.md builder uses `frontmatter.dump(post, handler=frontmatter.YAMLHandler())` rather than string concatenation. Eliminates YAML-injection risk (PHASE_D_DELTA W3 Gotcha 9 paid down by library rather than by hand-validation).

**LoC delta from Batch-1 fold:** ~–50 across W2 + W3 (parser code retires).

### 3.5 Batch-5 partial — LBA template (work unit #8)

**Backend deps:** none (revised 2026-05-15 — `docxtpl` LGPL-2.1 rejected per §4 decision 4).

**Path A (recommended):** drop unit #8 entirely for v0.1. LBA ships on the procedural `generate_docx` path that already serves the other letter types. No new code. Templating-library decision returns to v0.2.

**Path B (if visual LBA polish proves load-bearing for launch screenshots):**
- New `backend/app/templates/docx/lba.docx` (Word template authored by Andy in Word; uses `{{ matter_title }}` / `{{ counterparty }}` / `{{ effective_date }}` / `{{ body_paragraphs }}` / etc.; checked in as binary).
- New `backend/app/modules/letters/lba_template.py` — small internal helper using `python-docx` directly (already a runtime dep) to walk the template's runs/cells and substitute `{{placeholders}}`. ~60 LoC. No LGPL dep.
- Modify `backend/app/modules/letters/router.py::POST /{slug}/letters/draft/docx`: when `letter_type == "lba"` render via the internal helper; all other `letter_type` values fall through to existing `gateway.invoke_tool("generate_docx", ...)` path.
- Audit row unchanged: `module.letters.docx.exported`, module=`letters`, payload gains `template_name="lba"`.

**Constraint:** the audit shape is unchanged. The `/generated/{file_uuid}` download endpoint authorisation chain (Phase B W1 gotcha 1) keeps working unchanged.

**LoC:** 0 (Path A) or ~60 backend + 1 binary template (Path B).

---

## 4. Decisions (locked by Andy, 2026-05-15)

These are doctrine, not launch compromises. Launch compromises are called out explicitly.

1. **YAML library — PyYAML.** Doctrine: YAML is presentation/export packaging, not canonical state. Canonical matter/module contracts are JSON Schema + DB. ruamel.yaml is not on the roadmap.

2. **`module.json` capability set — flat closed set for v0.1.** Closed set: `matter.read`, `document.body.read`, `document.generated.write`, `model.invoke`, `chronology.read`, `chronology.write`, `citation.write`, `audit.emit`. Jurisdiction is metadata, not capability — surface as `jurisdictions: ["EW", "UK", ...]` in the manifest if/when needed. Not v0.1.

3. **Capability enforcement — v0.1 declarations only; enable/disable enforced.** v0.1 launch copy must say "module enable/disable is enforced; declared capabilities are schema-validated and displayed for review." Doctrine for v3.x: manifest capabilities become enforceable policy at the call site. Do not let launch copy imply enforcement exists yet.

4. **Docx templates — LBA only for v0.1; no `docxtpl` (LGPL-2.1).** Doctrine: solicitor-facing **final** documents become template-driven. Procedural exports remain acceptable for **analysis artefacts** until replaced. Pre-Motion + Contract Review templates are v0.2. **Reviewer decision 2026-05-15:** do NOT add `docxtpl` for v0.1 — the LGPL-2.1 surface is not worth the licence-explanation friction on an Apache-2.0 clean-room launch. Two acceptable v0.1 paths: (a) keep LBA on the existing procedural `generate_docx` path — recommendation; (b) if a template-like LBA is still wanted, use `python-docx` directly with a tiny internal placeholder-replacement helper over an Andy-authored `.docx` containing `{{placeholders}}`. Templating-library decision returns to the v0.2 backlog if document polish becomes more important than licence simplicity.

5. **App.tsx split now; TanStack v0.2.** Durable direction: TanStack Router + Query is the frontend architecture. v0.1 defers; v0.2 does not reopen the choice. Installed deps stay unused-but-installed.

6. **Jobs — v0.2, but the choice is locked: `arq` + Redis + `jobs` table as source of truth.** Doctrine: long-running module runs become jobs, not router-local `asyncio.create_task`. Implementation is v0.2; direction is fixed now. Day-15 deploy smoke in `infra/deploy/cloudflare.md` must include an SSE-disconnect-during-Contract-Review-run check so brittleness surfaces before launch.

7. **Structured-output helper — internal helper now, provider-native tools later.** Add **work unit #1a** (+~80 LoC, +0.25 day): `backend/app/core/structured_output.py` exporting `parse_model_json(raw: str, model: type[BaseModel]) -> BaseModel`. Called from `contract_review/agents.py`, `document_edit/pipeline.py`, `pre_motion/agents.py`, `anonymisation/prompts.py` — the four ad-hoc regex sites retire. **Lives outside `model_gateway.py`**: the gateway routes and audits model calls; structured-output parsing is a consumer concern. Provider-native schema/tool-calling is a gateway v0.2/v0.3 upgrade and interacts with R2/R3 posture-aware provider selection — do not rush.

8. **Audit-action constants — strings in v0.1, constants required in v0.2.** Not optional. Doctrine: the audit model stays bespoke; the action taxonomy becomes constants/enums in `backend/app/core/audit_actions.py` by v0.2. Stringly-typed action names are a v3.x liability.

---

## 5. Deliberately deferred to v0.2 (and v0.3 for matter portability)

**Cut to v0.3 (Andy 2026-05-15):**
- **Matter export / import surface (PHASE_D W2 / units #5 + #10b).** No real second user or second matter at v0.1; building the wire format with zero real exports to pressure-test against is over-engineering for a trust signal. v0.3 ships with two explicit modes on the wire: `full_internal` (full audit + payloads + bodies; same-posture guard) and `shareable` (privilege-aware redaction matrix; audit payloads stripped, hashes retained; disclosed-document bodies replaced with placeholders; `cpr_31_22_locked` flag preserved). The eight matrix detail decisions (B_mixed cross-user, C_paused refused, schema_version 1.0 pinned, slug-collision 409 with suggested rename, etc.) deferred with the surface — landed when there's evidence of demand.

**Deferred to v0.2:**

- **TanStack Router + Query migration** (infra-batch-3). Post-split tree migrates piecemeal. Estimated 3–5 days; not on launch path.
- **Redis-backed job runner** (infra-batch-4 / P2). **Direction locked:** `arq` + Redis + `jobs` table as source of truth (no Dramatiq/RQ branch left open). Per-module migration off router-local `asyncio.create_task`. Estimated 3–6 days; v0.2 unless Day-15 SSE-disconnect smoke proves brittle earlier.
- **Provider-native structured output / tool calling** (infra-P3 second half). v0.2 gateway upgrade. Interacts with R2/R3 hardening; do not rush.
- **`sse-starlette` swap.** Bespoke SSE frames stay v0.1; library swap is v0.2 inside the job-runner work.
- **Capability runtime enforcement** (infra-P7 done-state items 5 + 6). v0.1 ships declaration surface only; v0.2 doctrine: declared capabilities become enforceable policy at every access path.
- **`module.json` signed manifests.** Already in build-plan §4j v0.2.
- **Docx templates for Pre-Motion + Contract Review** (Batch-5 remainder). v0.1 ships LBA only. v0.2 expands.
- **`generate_docx` markdown-table extension.** Flagged across Phase B + C handovers. v0.2.
- **Action-name constants module.** **Required v0.2** (not optional). `backend/app/core/audit_actions.py` becomes the authoritative taxonomy; module call sites import constants. Audit model stays bespoke.
- **Audit-tab UI filter by `module` column.** Phase E polish if time; otherwise v0.2.
- **Multi-instance Redis-backed rate-limiter for submission flow.** In-memory token bucket sufficient on single-Fly-instance v0.1.
- **GitHub App for submission flow.** PAT-based v0.1; App-based v0.2 (auto-rotating installation token).

---

## 6. Cross-cutting

### Dependencies summary

**Added in this delta:**
- Backend: `pyyaml`, `python-frontmatter`, `jsonschema` (3 new — all MIT/BSD/Apache). `docxtpl` removed per §4 decision 4 (LGPL-2.1 not worth the launch-copy friction).
- Frontend: none.

**Already added in Phase C, document in pre-flight:**
- Backend: `presidio-analyzer`, `presidio-anonymizer`, `spacy`. Dockerfile post-install: `python -m spacy download en_core_web_sm`.

### Migration

**None.** All four new Python deps are pure code-layer additions. Phase D §4i existing `workspace_disabled_skills` table (Phase A) is sufficient for the folded module manager v0.1. No `0008_phase_infra.py`.

### Settings / Fly secrets (additions vs PHASE_E_DELTA W3.1)

No additions over what PHASE_E_DELTA W3.1 + W3.2 already enumerate. The Batch-1 deps require no env vars. Pre-flight delta in Phase E W3 already covers Presidio + spaCy + GitHub PAT + Turnstile.

### Audit-row hygiene

The audit centralisation sweep (work unit #1) preserves every existing audit-row contract verbatim. The Phase E W2 smoke evals act as the regression net — they should all pass against the post-sweep tree without modification. If any eval fails after the sweep, the sweep is wrong, not the eval.

### Hard rules preserved

- No agent files public issues, discussions, or DMs. Outreach drafts live under `docs/outreach/`. Andy files.
- `b1rdmania`-scoped PAT only for `GITHUB_SUBMISSION_TOKEN`. NOT `ziggythebot`.
- Privilege posture / audit semantics / matter-module legal shape / Python+FastAPI / gateway posture-aware provider selection — all bespoke, all unchanged.

---

## 7. LoC budget summary

| Work unit | Backend | Frontend | Docs / template | Total |
|---|---|---|---|---|
| #1 parsers + audit sweep | ~250 | 0 | 0 | ~250 |
| #2 App.tsx split | 0 | 0 net (~3,450 moved) | 0 | 0 net |
| #3 Phase D W1 + deferred buttons + Batch-2 fold | ~250 | ~300 | 0 | ~550 |
| #5 Phase D W2 | ~500 | ~50 | ~300 | ~850 (–50 from parser fold) |
| #6 Phase D W3 | ~280 | ~300 | 0 | ~580 (–20 from frontmatter fold) |
| #8 LBA template | ~80 | 0 | 1 binary template | ~80 |
| #9–#12 Phase E W1–W5 | ~470 (evals) | 0 | ~840 markdown | ~1,310 |
| **Total v0.1 from `be8af63`** | **~1,830** | **~650** | **~1,140** | **~3,620** |

Well inside the cumulative per-phase ~2,500 LoC envelope established across A → B → C, given this combines two phases (D + E) with infra fold.

---

## 8. Acceptance summary (v0.1 launch gate)

- Cold reader of README → solicitor-first, peer-credited to Stella + Mike.
- `grep -rn "AuditEntry(" backend/app/` returns only the four permitted helper/model/middleware sites (`core/audit.py`, `core/api.py` helper, `models/audit.py`, audit middleware).
- `module.json` schema-validated on discovery; broken manifests surface in Modules page.
- `matter.md` frontmatter generated + parsed via PyYAML; SKILL.md via python-frontmatter.
- App.tsx ≤ 350 lines; tabs / modules / auth / ui all live under their own folders.
- Letters Download .docx + Pre-Motion Download .docx + Anonymise per-document button all wired (post-split moves them into the right tab files; Phase B's `2a082eb` shipped the JSX into the monolith).
- LBA letter renders via the procedural `generate_docx` path (Path A, recommendation locked 2026-05-15 — no `docxtpl`). Template-driven LBA returns in v0.2.
- Phase D W1 + W2 + W3 acceptance bars (per `PHASE_D_DELTA.md`) green.
- Phase E W1–W5 acceptance bars (per `PHASE_E_DELTA.md`) green.
- Four smoke evals (Phase E W2) green against the integrated tree (matter-portability eval cut with #5 to v0.3).
- Day-15 deploy: every new env var (`GITHUB_SUBMISSION_TOKEN`, `TURNSTILE_*`, plus existing `ANTHROPIC_API_KEY` / Postgres / Presidio model) provisioned per PRE_FLIGHT.

---

## 9. What's NOT in this delta

Everything in §5 ("Deliberately deferred to v0.2"). Plus:

- Any change to privilege posture semantics.
- Any change to gateway posture-aware provider selection (R2/R3 hardening locked).
- Any new product surface beyond what PHASE_D + PHASE_E already enumerate.
- Any agent-filed DM / public issue / discussion. Andy files. Always.
- Any use of `ziggythebot` for GitHub interaction. `b1rdmania`-scoped PAT only.

---

### Critical Files for Implementation

- `/Users/andy/Cursor Projects 2026/legalise/backend/app/core/api.py` (audit helper — centralisation target)
- `/Users/andy/Cursor Projects 2026/legalise/backend/app/core/matter_fs.py` (PyYAML swap + frontmatter)
- `/Users/andy/Cursor Projects 2026/legalise/backend/app/api/modules.py` (jsonschema validation + capability surface)
- `/Users/andy/Cursor Projects 2026/legalise/backend/app/api/exports.py` (Phase D W2 — to create; uses jsonschema)
- `/Users/andy/Cursor Projects 2026/legalise/frontend/src/App.tsx` (W0 split source)
- `/Users/andy/Cursor Projects 2026/legalise/backend/app/modules/letters/router.py` (LBA template fold)
- `/Users/andy/Cursor Projects 2026/legalise/backend/app/core/structured_output.py` (work unit #1a — new file)

---

## 10. Approval (2026-05-15, Andy)

Approved with amendments: base head is `be8af63`; v0.1 capabilities are validated/displayed declarations plus module enable/disable enforcement, not runtime capability enforcement; `parse_model_json` lives in `backend/app/core/structured_output.py`; JSON Schema errors must use `Draft202012Validator` with JSON-pointer-ish paths; v3.x job direction is `arq` + `jobs` table; audit constants are required v0.2, not optional.

Decisions locked: PyYAML; flat capability set; LBA-only template; App split now / TanStack v0.2; jobs v0.2 with SSE-disconnect smoke; provider-native tool calling deferred.
