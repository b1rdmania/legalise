# Pre-Motion (Phase 9 reference module)

The second brutal reference module. Exists to prove the substrate
is real — that an external author can land a useful module using
only what Contract Review already exposed, with zero edits to
core / api / models.

## What it does

One capability: `draft_motion`. Given a claim type and a list of
matter documents, it:

1. Reads each document (capability scope: `matter.document.read`)
2. Hits the privilege-posture gate (Phase 8 substrate)
3. Hits the advice-boundary gate (Phase 1 substrate)
4. Calls the matter's configured provider with a structured prompt
5. Parses the model output into `{motion, evidence}`
6. Writes **two** artifacts: `motion_draft` + `evidence_list`
7. Returns `{motion_artifact_id, evidence_artifact_id, evidence_count}`

The two artifacts share the same `invocation_id` and use different
`kind` values — the matter_artifacts table's
`UNIQUE(invocation_id, kind)` permits this (Phase 6 substrate).

## What's different from Contract Review

| Surface | Contract Review | Pre-Motion |
| --- | --- | --- |
| Documents per invocation | 1 | N (≥ 1) |
| Artifacts per invocation | 1 (`findings_pack`) | 2 (`motion_draft` + `evidence_list`) |
| Args | `document_id` | `claim_type` + `document_ids` |
| Claim type | n/a | small enum |
| Advice tier | `draft_advice` | `draft_advice` (same) |
| Gates | `privilege_posture` | `privilege_posture` (same) |

These three differences (multi-doc, multi-artifact, multi-arg) are
the substrate-reusability test. Everything else is identical to
Contract Review by design.

## Arguments

`draft_motion(claim_type, document_ids)`:

- **`claim_type`** — one of:
  - `"breach_of_contract"`
  - `"misrepresentation"`
  - `"unfair_dismissal"`

  Validated by the capability body (Phase 9 v2 Decision #6 — no
  manifest `args_schema` field). Unknown values raise `ValueError`
  before any side effect.

- **`document_ids`** — list of document UUIDs. Must be non-empty
  and every id must belong to the target matter. Validated by
  the capability body; cross-matter ids raise `ValueError` before
  any side effect.

## Installing

```bash
# Re-sign after any manifest edit:
PYTHONPATH=backend python3 -m scripts.sign_example_module \
  examples/modules/pre_motion/module.json
```

Then install via the trust ceremony + grant via the per-user
endpoint (same flow Contract Review uses — see Phase 6 + 7
handovers):

```bash
POST /api/modules/install                                    # admin
POST /api/modules/install/{ceremony_id}/advance × 4          # 3 trust + 1 grant
POST /api/matters/{slug}/grants                              # per-user grant
{
  "module_id": "examples.pre-motion",
  "capability_id": "draft_motion"
}
```

After the grant, the capability can run on that matter for that user.

## Architectural notes (load-bearing)

1. **One capability + two artifact kinds.** Not two capabilities.
   Multi-step orchestration is out of scope; the audit trail tells
   the sub-step story.
2. **Args validated in code, not schema.** Module enforces the
   `claim_type` enum + the `document_ids` shape. Host doesn't need
   to know the args shape — only the capability does.
3. **No new substrate surfaces.** No new capability strings, no
   new audit actions, no new `BlockedReason` values, no new postures.
   Same `privilege_posture` gate as Contract Review. Same advice
   tier (`draft_advice`).
4. **Same matter scoping.** Both `matter.document.read` and
   `matter.artifact.write` grants are checked with `matter_id`;
   cross-matter grants don't authorise this matter.
5. **Provider call is real in production, monkey-patched in tests.**
   Same test seam Contract Review uses.

## Extending

Copy this directory to scaffold your own module. Adjust:

- `module.json` — id / name / version / capabilities
- `__init__.py` — imports
- `capability.py` — implementation
- `README.md` — module-author docs (including args)

Re-sign the manifest with `sign_example_module.py`. Install via the
trust ceremony. Write an integration test that walks the same shape.

## Out of scope at the end of Phase 9

- Higher advice tier (`supervised_legal_advice`)
- Multi-step orchestration ("first identify claim, then draft")
- Per-jurisdiction templates
- Procedural-compliance checks
- Output iteration loop
- Shared provider module across reference modules
- Frontend wizard
- Async runtime

The next reference module / capability will surface which of these
is the most useful next step. Until then: keep this small.
