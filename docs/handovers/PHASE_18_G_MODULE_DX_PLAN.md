# Phase 18-G — Module DX (PLAN)

**Status:** plan v1, awaiting reviewer redline.
**Branch:** TBD (off whatever master is at the time of ratify).
**Bar:** a third-party developer (or Andy on a fresh terminal) goes
from "I want to write a new capability module" to "I have a manifest
the runtime accepts" without reading JSON Schema source. Today the
path is: read `docs/MODULE_DEVELOPMENT.md`, copy an example,
hand-craft a manifest, fight `additionalProperties: false at
/capabilities/0/...` until it stops complaining.

## Why this is a phase, not a docs-pass

The architecture-rewrite line (locked 2026-05-25) is *any tool, any
model, any skill, matter-scoped, permissioned, auditable*. That
promise is hollow if writing a new capability module requires
hand-crafting a v2 manifest from memory and decoding JSON-Schema
error paths. Phase 18-G doesn't move the runtime — it lowers the
authoring bar with two tools sibling to `bootstrap_admin` and
`doctor`:

1. `legalise module new <name>` — scaffolds a working starter module
   in one command.
2. `legalise module validate <path>` — wraps `validate_manifest_v2`
   and translates its error list into module-author language ("you
   said the capability needs the model but didn't declare a
   `model_access` entry") instead of JSON-Schema-shaped paths.

Neither adds substrate. Both ride on code that already exists
(`schemas/module.v2.json`, `app.core.registry.validator`, the
`examples/modules/*` reference modules).

## What lands

Two pieces. Each is its own commit family; each ratifies
independently.

### A. `legalise module new <name>` — scaffold a starter module

New CLI at `backend/app/tools/module_new.py`, sibling shape to
`bootstrap_admin.py` and `doctor.py`:

```
docker compose exec backend python -m app.tools.module_new <name>
docker compose exec backend python -m app.tools.module_new <name> \
    --publisher <id> --visibility community --runtime native
```

Emits a directory (default `examples/modules/<name>/`; `--out
<path>` for fork-side use):

```
<name>/
  module.json          # v2 manifest, fully-populated, validates clean
  README.md            # one-page authoring guide for THIS module
  capability.py        # one capability stub (kind=skill, scope=matter)
```

**Manifest defaults** (every required field gets a sensible starter):

- `schema_version`: `2.0.0`; `id`: `<publisher>.<name-kebab>`;
  `version`: `0.1.0`; `publisher`: `--publisher` or `local`;
  `visibility`: `community` (override via flag); `runtime`: `native`.
- `entrypoint`: native → `python_module = examples.modules.<name>`;
  mcp-stdio → placeholder `command` + comment.
- one capability: `kind=skill`, `scope=matter`,
  `model_access=optional`, `external_network=false`,
  `streaming_mode=sync`, `advice_tier_max=factual_extraction`,
  non-empty `audit_events`, `ui.slot=matter.workflows`, empty
  `reads`/`writes`/`gates`, `data_movement.local_only=true`.

**Capability stub** mirrors
`examples/modules/contract_review/capability.py`: minimal class the
native runtime can import, docstring pointing at
`docs/MODULE_DEVELOPMENT.md`.

**README.md** is short and module-specific. Three commands an
author needs (enable, grant, invoke) plus pointer to
`docs/MODULE_DEVELOPMENT.md`. Not the full guide.

**Post-write step.** The CLI runs the (B) validator-wrapper against
the freshly written manifest and prints the result. A scaffold that
fails validation is a bug in the scaffolder, not the author's
problem. This is the load-bearing invariant: `module new` always
emits something that validates clean.

**Refuse cases:** target dir exists (suggest `--force`); `<name>`
fails schema pattern (`^[a-z0-9][a-z0-9_.-]+$`); `--runtime mcp`
without `--mcp-transport`.

### B. `legalise module validate <path>` + author-language errors

New CLI at `backend/app/tools/module_validate.py`. Two surfaces:

1. **CLI:** `python -m app.tools.module_validate <path-to-module.json>`
   — exit 0 on clean, non-zero on error. One line per error in
   author language.
2. **Library function:** `translate_errors(errors: list[dict]) ->
   list[AuthorError]` in the same module. Used by `module_new`
   (A); available for any future hosted endpoint (NOT in this
   phase — flagged for P19+).

**Translation layer.** Takes the existing
`{"path": "...", "message": "..."}` error list and rewrites each
entry into `(path, author_message, hint)`. Pattern-based, keyed off
the existing validator strings.

The code-level errors in `_code_level_errors` are *already*
author-shaped — the translator passes them through and appends a
`docs/MODULE_DEVELOPMENT.md` anchor or example-module link as the
hint. The JSON Schema errors from `jsonschema` need full rewriting.

**Initial translation pairs (derived from the v2 schema):**

| JSON Schema error | Author-language rewrite |
| --- | --- |
| `'X' is a required property` at `/capabilities/N` | "capability #N (`<id>`) is missing `X`." |
| `'X' is not one of [...]` at `.../kind` | "capability #N declares `kind: X`; valid: skill, tool, workflow, provider, gate." |
| `Additional properties are not allowed ('X' …)` | "unrecognised field `X` at `<path>`. Did you mean: `<difflib-closest>`?" |
| type-mismatch (`False is not of type 'string'`) | "`<field>` must be a `<expected>`; you gave `<actual>`." |
| `id` pattern mismatch | "`<X>` isn't a valid id — lowercase, start with letter/digit, only `a-z 0-9 _ . -`." |
| `schema_version` pattern mismatch | "manifest is `schema_version: <X>`; runtime accepts 2.x only. Bump to `2.0.0`." |
| `oneOf` failure at `entrypoint` | "`entrypoint` doesn't match any valid shape. native → `python_module`; mcp → `transport`+`command`(stdio) or `transport`+`url`(sse)." |

**Output shape (CLI):**

```
fail: capability #0 ("review") is missing model_access.
      → every capability declares model_access (none|optional|required|delegated).
      → see examples/modules/contract_review/module.json.

2 error(s); 0 ok. manifest invalid.
```

Green: `ok: <path> validates clean (N capabilities, runtime=<X>).`

**Unmapped JSON Schema errors:** if no translation rule matches,
fall through to the original `{path, message}` pair plus
"(no author-language translation registered; please file an issue
with this error so we can add one)". Never swallow silently.

## Sub-step order (proposed)

1. **B first** — `module_validate` + translator. Cheap, no
   filesystem writes, ratifies the translation table in isolation.
   Pytest covers each pair against a crafted broken manifest.
2. **A second** — `module new`. References B's translator for its
   post-write assertion. B-solid makes A's "always emits valid
   output" guarantee a unit test against the scaffold output.

Each sub-step is its own PR.

## Verification per sub-step

- **B (validate):**
  - every translation pair has a pytest case: craft a minimal
    broken manifest, run `validate_manifest_v2`, run
    `translate_errors`, assert rewritten message.
  - unmapped-error fallback has its own test.
  - golden: every reference module in `examples/modules/` validates
    clean through the new CLI.
- **A (scaffold):**
  - pytest: invoke `module_new` against a tmp dir, assert the
    three files exist, assert `module_validate` returns clean
    against the emitted manifest.
  - pytest refuse cases.
  - manual: fresh shell, run `python -m app.tools.module_new
    smoke_test`, observe valid manifest + green validator output.

## Explicitly out of scope

- **No new substrate.** No new endpoints, tables, migrations. Two
  Python CLIs sibling to `bootstrap_admin` and `doctor`.
- **No schema changes.** `schemas/module.v2.json` is the source of
  truth; this phase does not edit it.
- **No marketplace mechanics.** No publish flow, no signed-publisher
  registry, no install-by-id. v0.5+ territory.
- **No module signing changes.** `signed_by` / `signature` fields
  are untouched; scaffolder leaves them blank (optional per schema).
- **No hosted endpoint.** `translate_errors` is a library function
  and a CLI — not an API route. A future
  `POST /api/admin/modules/validate` is its own phase.
- **No frontend.** Two terminal tools.
- **No discovery changes.** `app.core.registry.discover_modules`
  unchanged; scaffolder writes into the same `examples/modules/`
  shape discovery already walks.
- **No new docs file.** `docs/MODULE_DEVELOPMENT.md` gets a short
  insert ("Two helpers exist: `module new` and `module validate`")
  and an anchor. No new long-form doc.
- **No re-tokening, re-branding, or design changes.**

## Open questions for the reviewer (with proposed defaults)

1. **Default scaffold target?** Proposed: `examples/modules/<name>/`
   when run from inside this repo; `--out <path>` for fork-side
   authoring against a sibling repo.
2. **Interactive prompts or flags-only?** Proposed: flags-only first
   pass, sane defaults so smallest invocation is `module new <name>`.
   `bootstrap_admin` never grew prompts; we follow that pattern.
3. **Translator table location?** Proposed: Python dict in
   `module_validate.py`, keyed by `(schema_path_pattern,
   message_pattern_or_keyword)`. Moving to data later is cheap.
4. **Default capability stub kind?** Proposed: `kind=skill`,
   `scope=matter`, `model_access=optional` — the most common values
   across reference modules. README tells the author where to change.
5. **`legalise module new` umbrella vs `python -m app.tools.module_new`?**
   Proposed: keep the underscore module path (matches `bootstrap_admin`,
   `doctor`); a unified `legalise` CLI is its own phase touching shell
   entry points + packaging. User-facing docs reference `legalise
   module new` and resolve to the underscore form, same as `legalise
   doctor` resolves today.
6. **`module validate` against a dir?** Proposed: single file in v1.
   `doctor`'s `manifests.valid` already covers the discovery sweep.
   A `--all` flag can come later.
7. **"Did you mean" fuzzy match?** Proposed: stdlib
   `difflib.get_close_matches` against sibling property names at the
   error's schema path. No new dependency.

## Non-negotiables carried forward

- No server-paid model keys in prod (untouched — neither tool
  contacts any provider).
- Redis never holds matter content (untouched).
- Fly fs not source of truth (untouched — scaffolder writes into
  the repo working tree, not runtime state).
- Module manifests on disk and their signatures are not modified by
  the validator; `module_validate` is read-only.
- The validator wrapper rides on `validate_manifest_v2` /
  `assert_manifest_v2`. No second validator. Translation strictly
  downstream of the existing error list.
- The scaffolder ships output the validator wrapper accepts. Hard
  invariant — a scaffold-then-validate test enforces it.
- Reviewer is the canonical decision authority. This plan is a
  draft; nothing ships before redline.
