# Phase 2 Build Plan — Manifest v2 + Capability Registry

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `48df179` (Phase 1 ratified head)
**Goal:** Replace the v1 SKILL.md-only manifest with the v2 capability declaration grammar from `docs/architecture/MANIFEST_V2_SCHEMA.md`. Build the registry that discovers, validates, and exposes modules. Keep v1 modules working through an auto-derivation shim.

Same discipline as Phase 1: this document is the implementation contract. If anything changes during build, patch this plan first, then code follows.

---

## Pre-build findings (read pass completed)

Existing state of the relevant surfaces (read against `48df179`):

1. **`schemas/module.json` v1** — JSON Schema document. Required fields: `name`, `version`, `description`, `nav`, `routes`. Optional: `author`, `license`, `homepage`, `requires` (`plugins` array of `"<plugin>:<skill>"` strings), `capabilities` array. Plugin-style manifest shape — focused on UI nav + route prefixes + dependency declarations.

2. **`backend/app/api/modules.py`** — current registry surface. Loads v1 `schemas/module.json` (cached), validates discovered SKILL.md manifests, exposes `GET /api/modules` returning `ModulesResponse{plugins_root, source, skills: [ModuleSkill], broken: [BrokenManifest]}`. Each skill is `(plugin, skill, name, description, source_url, argument_hint, capabilities, declared_capabilities, granted_capabilities, trust_posture, enabled)`. Source-truth for v1 discovery; ~280 LOC.

3. **`backend/app/core/capabilities.py`** — 7-string vocabulary: `matter.read`, `document.body.read`, `document.generated.write`, `model.invoke`, `chronology.read`, `chronology.write`, `citation.write`. `CAPABILITY_VOCABULARY` is a `frozenset[str]`. `require_capability(session, *, user_id, plugin, skill, capability)` does the runtime check; `declared_capabilities_for_skill` resolves declared from manifest payload.

4. **`backend/app/adapters/plugin_bridge.py`** — `_parse_skill_md(path)` parses SKILL.md YAML frontmatter + body. Used by both the catalogue and the bridge.

5. **`WorkspaceSkillCapabilityGrant`** model — `(id, user_id, plugin, skill, capability, granted_at, granted_by_user_id)` with composite UNIQUE on `(user_id, plugin, skill, capability)`. No version/snapshot columns yet.

6. **No existing `backend/app/core/registry.py`** — Phase 2 creates this.

7. **No `schemas/module.v2.json`** yet — Phase 2 creates this.

8. **Reference docs locked:** `docs/architecture/MANIFEST_V2_SCHEMA.md` is canonical for the v2 grammar. Capability grammar pattern is `<scope>.<resource>.<action>` per `MATTER_CONTEXT_STORE.md` and the Phase 1 architectural decision to use `plugin="core"` for substrate capabilities.

### Architectural decisions taken pre-code (Reviewer ratification at end of Phase 2)

**Decision #1 — v1 manifest stays valid; v2 is additive, not replacing.**

The v1 schema (`schemas/module.json`) does NOT get deleted. A separate `schemas/module.v2.json` is added. The registry detects which schema a discovered manifest validates against and treats v1 modules through an auto-derivation shim:

- v1 SKILL.md with no explicit `module.json` → auto-derive a v2 manifest in memory: `kind: skill, scope: matter, runtime: native, entrypoint: <legacy SKILL.md bridge>`, capabilities inferred from existing `capabilities: [matter.read, ...]` declaration.
- v1 `module.json` (existing plugin-style) → auto-derive v2 with `kind: workflow` if the module has multi-skill structure, `kind: skill` otherwise.
- v2 `legalise.module.json` (new format) → validate against v2 schema directly.

Why: preserves all existing first-party modules without forcing migration before Phase 7-9 reference module work. Phase 7-9 ports each first-party module to v2 deliberately.

Refactor scope if Reviewer counters: shim lives in `core/registry.py`; `~80 LOC` to relocate or restructure.

**Decision #2 — Capability vocabulary extension is additive.**

`CAPABILITY_VOCABULARY` becomes a richer registry: the 7 existing flat strings stay valid, plus a typed grammar for v2 capabilities. The runtime accepts strings matching either:
- Exact membership in the legacy flat set, OR
- Matching the grammar regex `^(matter|workspace|global)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`

Examples valid under v2:
- `matter.documents.body.read`
- `matter.context.legalise_memory.facts.write`
- `matter.state.intake.transition`
- `workspace.providers.invoke`
- `workspace.intake.prospects.write`
- `global.registry.read`

Legacy strings (e.g. `matter.read`, `document.body.read`) remain valid via membership in the existing frozenset.

Refactor scope: ~100 LOC in `capabilities.py` (grammar validator + extended vocabulary helper). No DB changes required for this part.

**Decision #3 — Grant table extension is purely additive.**

Add three columns to `workspace_skill_capability_grants`:
- `capability_version` (String 32, nullable) — semver of the capability vocabulary the grant was made under. NULL for legacy v1 grants.
- `granted_at_module_version` (String 32, nullable) — module version at grant time. NULL for legacy v1 grants.
- `granted_permissions_snapshot` (JSONB, nullable) — full snapshot of what was granted (reads/writes/gates/data_movement/advice_tier_max). NULL for legacy grants.

Old grants stay valid. New v2 grants populate these fields. Phase 4's permission-expansion detection reads from these fields. The composite UNIQUE constraint stays intact.

Migration `0015_phase2_grants_v2.py`. Backwards-compat: existing grants continue to validate against `require_capability` unchanged.

---

## Critical path

```
Step 1: schemas/module.v2.json — JSON Schema document per
        MANIFEST_V2_SCHEMA.md
   ↓
Step 2: core/capabilities.py — vocabulary grammar extension
   ↓
Step 3: core/registry.py — module discovery + manifest validation +
        v1→v2 auto-derivation shim + capability catalogue
   ↓
Step 4: migration 0015 + WorkspaceSkillCapabilityGrant model extension
   ↓
Step 5: api/modules.py — expose v2 manifest + registry surface
        (keep v1 endpoints functioning)
   ↓
Step 6: Tests across all surfaces
   ↓
Step 7: Local Postgres sweep — must be green before handover
   ↓
Step 8: HANDOVER_PHASE_2_DONE.md
```

Steps 1-2 are independent. Steps 3-5 depend on 1-2. Step 6 covers all.

---

## Step 1 — `schemas/module.v2.json`

**File:** `schemas/module.v2.json`

**Source of truth:** `docs/architecture/MANIFEST_V2_SCHEMA.md` (lines 1-247).

**Required module-level fields** (top of manifest):
- `schema_version` (string, semver, must match `^2\.\d+\.\d+$`)
- `id` (string, `^[a-z0-9][a-z0-9_.-]+$`)
- `name` (string)
- `version` (string, semver)
- `publisher` (string)
- `visibility` (enum: `first_party | community | firm_private | example | partner_track`)
- `runtime` (enum: `native | mcp`)
- `entrypoint` (object — runtime-specific)
- `capabilities` (array, non-empty)

**Optional module-level fields:** `description`, `source_url`, `license`, `jurisdictions` (array), `requires` (array of dependency objects), `host_version`, `matter_schema_version`, `signed_by`, `signature`.

**Capability object required fields:**
- `id` (string)
- `kind` (enum: `skill | tool | workflow | provider | gate`)
- `scope` (enum: `matter | workspace | global`)
- `reads` (array of capability-grammar strings)
- `writes` (array of capability-grammar strings)
- `model_access` (enum: `none | optional | required | delegated`)
- `external_network` (bool)
- `data_movement` (object — explicit declaration)
- `gates` (array of gate ids)
- `ui.slot` (string)
- `streaming_mode` (enum: `sync | streaming | async`)
- `advice_tier_max` (enum: 5 tier values)
- `audit_events` (array of expected audit action names)

**Optional capability fields:** `output_lifecycle_target` (enum or null).

**Validation rules** (encoded as JSON Schema constraints + supplemental code-level checks):
- Missing `capabilities` array → schema reject
- Unknown `kind` or `scope` → schema reject
- Unknown capability grammar entries → code-level reject in registry
- `kind: gate` with non-empty `gates` → code-level reject
- `external_network: true` without `data_movement.external_destinations` → code-level reject
- `model_access: required` without provider dependency or runtime provider access → code-level reject
- `ui.slot` not in the known slot registry → code-level reject (slot registry lives in `core/registry.py`)
- Semver-invalid `version`, `host_version`, `matter_schema_version` → schema reject

**MCP entrypoint shape:**
```json
{
  "transport": "stdio" | "sse",
  "command": "<binary>",  // stdio
  "args": ["<arg>", ...], // stdio
  "env": {"<key>": "<val>"}, // optional
  "url": "https://..."  // sse only
}
```

**Native entrypoint shape:**
```json
{
  "python_module": "app.modules.foo",
  "entry": "Module"  // class or callable name
}
```

Estimated size: ~250 lines of JSON.

---

## Step 2 — `core/capabilities.py` vocabulary grammar extension

**File:** `backend/app/core/capabilities.py` (extend)

**Additions:**

```python
import re

# Regex for the v2 grammar. Three segments minimum
# (<scope>.<resource>.<action>), four or more for nested resources
# (e.g. matter.context.<namespace>.<action>).
_V2_GRAMMAR_RE = re.compile(
    r"^(matter|workspace|global)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$"
)


def is_valid_capability_string(value: str) -> bool:
    """True if ``value`` is either a legacy v1 capability (member of
    CAPABILITY_VOCABULARY) or matches the v2 grammar
    ``<scope>.<resource>.<action>``."""
    if value in CAPABILITY_VOCABULARY:
        return True
    return bool(_V2_GRAMMAR_RE.match(value))


def assert_capability_string(value: str) -> None:
    """Raise ValueError if ``value`` is not a valid capability."""
    if not is_valid_capability_string(value):
        raise ValueError(
            f"invalid capability string: {value!r} "
            "(must be a legacy v1 capability or match "
            "<scope>.<resource>.<action> grammar)"
        )
```

`require_capability(session, *, user_id, plugin, skill, capability)` signature is **unchanged**. The runtime still does an exact grant lookup; the vocabulary extension only changes what's accepted as a valid capability string. The Phase 1 substrate-primitive convention (`plugin="core"`) remains.

Estimated: ~30 LOC added.

---

## Step 3 — `core/registry.py` — discovery + validation + shim

**File:** `backend/app/core/registry.py` (new)

**Public surface:**
```python
from app.core.registry import (
    discover_modules,
    load_manifest,
    validate_manifest_v2,
    auto_derive_v2_from_v1,
    list_capabilities,
    InvalidManifestError,
    ManifestNotFoundError,
    UISlotRegistry,
)
```

**Module layout:**
- `__init__.py` — public surface
- `discovery.py` — walks `backend/app/modules/`, `examples/modules/`, and any user-installed paths from `settings.plugins_root`. Returns a list of `(module_id, manifest_path, manifest_kind: "v1_skill" | "v1_module_json" | "v2")`.
- `validator.py` — `validate_manifest_v2(payload)` runs JSON Schema validation + code-level checks (unknown capability grammar, kind/gates clash, network without destinations, etc.). Returns `(is_valid, errors: list[dict])`.
- `shim.py` — `auto_derive_v2_from_v1(v1_payload, source_kind)` produces a v2 manifest in memory. Loose `kind` inference: SKILL.md → `skill`; `module.json` with multi-skill structure → `workflow`.
- `slots.py` — `UISlotRegistry` — the canonical slot vocabulary the runtime accepts. Initial slots:
  - `matter.workflows`
  - `matter.documents.actions`
  - `matter.chronology.augment`
  - `matter.memory.augment`
  - `matter.parties.actions`
  - `assistant.tools`
  - `gate.interruption`
  - `intake.module`
  - `output.lifecycle.action`
- `capability_catalogue.py` — `list_capabilities()` returns the union of all declared capabilities across discovered modules. Used by Phase 4 grant-lifecycle and Phase 12 frontend module catalogue.

Estimated size: ~600 LOC across 6 files.

---

## Step 4 — Migration 0015 + grant model extension

**File:** `backend/alembic/versions/0015_phase2_grants_v2.py` (new)

**Schema change:**
```python
op.add_column(
    "workspace_skill_capability_grants",
    sa.Column("capability_version", sa.String(32), nullable=True),
)
op.add_column(
    "workspace_skill_capability_grants",
    sa.Column("granted_at_module_version", sa.String(32), nullable=True),
)
op.add_column(
    "workspace_skill_capability_grants",
    sa.Column(
        "granted_permissions_snapshot",
        postgresql.JSONB,
        nullable=True,
    ),
)
```

Downgrade drops the three columns.

**Model update:** `backend/app/models/workspace_skill_capability_grant.py` — add the three fields with `Mapped[<type> | None]`.

Estimated: ~40 LOC across the two files.

---

## Step 5 — `api/modules.py` update

**File:** `backend/app/api/modules.py` (extend)

**New endpoints:**
- `GET /api/modules/v2` — returns discovered manifests in their v2 shape (via shim where needed). Schema: list of `{module_id, manifest, source_kind, validation_errors}`.
- `GET /api/modules/v2/{module_id}` — single-module detail with capability list.
- `GET /api/modules/v2/capabilities` — flat catalogue of capability strings declared across all installed modules. Used by Phase 12 frontend grant UI.

**Existing endpoints unchanged:**
- `GET /api/modules` — v1 shape, continues to work.
- `GET /api/modules/{plugin}/{skill}` — v1 skill body, continues to work.

Estimated: ~150 LOC added.

---

## Step 6 — Tests

**Files:**
- `backend/tests/test_phase2_schema.py` — JSON Schema validation tests. Required field missing → reject. Unknown kind/scope → reject. Valid v2 manifest → accept. Semver violations → reject. ~12 tests.
- `backend/tests/test_phase2_capability_grammar.py` — `is_valid_capability_string` for legacy + v2 strings + invalid strings. `assert_capability_string` raises on invalid. ~8 tests.
- `backend/tests/test_phase2_registry.py` — discovery walks declared paths, validator surfaces errors, shim produces v2 from v1 fixtures, UI slot registry rejects unknown slots, capability catalogue aggregates correctly. ~15 tests.
- `backend/tests/test_phase2_grant_extension.py` — new columns nullable, existing grants still resolve via `require_capability`, new grants can populate snapshot + versions. ~6 tests.
- `backend/tests/test_phase2_api.py` — HTTP tests for the three new endpoints + verification that existing v1 endpoints still respond identically. ~10 tests.

Total: ~51 new tests targeting Phase 2 surfaces.

**Critical scenarios per layer:**
- Schema: validation rejects malformed manifest; accepts canonical example from MANIFEST_V2_SCHEMA.md.
- Vocabulary: legacy strings still pass; new grammar accepted; invalid strings rejected.
- Registry: v1 SKILL.md discovered + shimmed; v2 manifest discovered + validated; mixed v1/v2 cohabit.
- Grants: backwards-compat (no migration of existing rows required); new fields write + read correctly.
- API: v2 endpoints expose canonical shape; v1 endpoints unchanged.

---

## Commit cadence

Same as Phase 1 — one commit per logical unit:

1. `phase2: v2 manifest JSON Schema`
2. `phase2: capability vocabulary grammar extension`
3. `phase2: core/registry — discovery + validator + v1→v2 shim`
4. `phase2: migration 0015 + grant model extension`
5. `phase2: api/modules — v2 endpoints + capability catalogue`
6. `phase2: tests + local Postgres sweep green`
7. `phase2: handover doc`

Push after each. CI fires automatically (per the new branch gating).

---

## Out of scope (deferred to later phases)

- MCP host implementation (Phase 3 — registry handles MCP-runtime manifests, but the actual MCP host integration lands later)
- Signing + sandbox + trust ceremony (Phase 3)
- Grant lifecycle (revocation, re-prompt on expansion) (Phase 4)
- Dependency graph resolution (Phase 4)
- Audit reconstruction view (Phase 5)
- Streaming/async runtime (Phase 6)
- Porting existing first-party modules to v2 (Phases 7-10)
- Connector proof set (Phase 11)
- Frontend module catalogue UI rewrite (Phase 12)

Phase 2 is a foundation layer — it gives Phase 3+ a manifest spec, a registry, and a vocabulary to build against. It doesn't yet *enforce* anything new at runtime; v1 modules keep working unchanged.

---

## Acceptance bar

- [ ] `schemas/module.v2.json` validates against the canonical example in `MANIFEST_V2_SCHEMA.md`
- [ ] Capability vocabulary accepts both legacy v1 strings and v2 grammar
- [ ] Registry discovers modules in all declared paths
- [ ] v1 → v2 shim produces a valid v2 manifest for every existing first-party module
- [ ] Grant table extension is backwards-compatible (existing grants still resolve)
- [ ] All Phase 2 tests pass against real Postgres (88+ Phase 1 tests + ~51 new = ~139 tests total)
- [ ] Existing v1 endpoints continue to function unchanged
- [ ] `HANDOVER_PHASE_2_DONE.md` written
- [ ] CI green on `runtime-rewrite`

---

## Risks / open questions during build

If any of these surface during code, this plan gets patched first:

1. **`UI slot registry vocabulary** — `MANIFEST_V2_SCHEMA.md` doesn't fix the canonical slot vocabulary. The build plan declares an initial set; Reviewer may want this locked in the architecture doc.
2. **MCP entrypoint validation depth** — the v2 schema can accept `runtime: mcp` manifests but Phase 2 has no MCP host to invoke them. Validate structure; defer actual MCP loading to Phase 3.
3. **Auto-derivation fidelity** — the v1 → v2 shim infers `kind` and `scope` from heuristics. If any existing first-party module's inferred manifest produces unexpected validation errors, those errors get logged + the module is marked `broken: true` in the v2 catalogue (mirroring existing `BrokenManifest` pattern).
4. **`audit_events` enumeration** — the v2 capability declares which audit events it will emit. Phase 1 already established canonical event names; Phase 2 registry should verify declared events against the canonical set, OR accept the declaration and validate at runtime invocation time. This plan defers strict validation to Phase 3+ when MCP host enforces it.

---

*End of Phase 2 build plan. Builder reads canonical files once more, then begins Step 1.*
