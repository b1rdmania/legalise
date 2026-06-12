# Contract Review

A reference module — the smallest real proof of the Legalise v2 substrate.

## What it does

One capability: `review`. Given a matter document, it:

1. Reads the document (capability scope: `matter.document.read`)
2. Checks the posture + advice-boundary gates
3. Calls the matter's configured provider with a structured prompt
4. Parses the model output into a typed findings list
5. Emits `source_anchors` (document-level + optional model-quote anchors
   with `quote_found_in_source`) into the artifact payload
6. Writes a `findings_pack` artifact
7. Returns `{findings_artifact_id, findings_count}`

Every step writes an audit row. After one invocation the matter's
`GET /audit/reconstruction` endpoint returns a complete trail:
ceremony events → grant write → capability invocation → gate decision →
model invocation (with cost columns) → artifact creation → completion.

## What it doesn't do

- **No streaming.** The slice is synchronous; long-running variants
  would go through a durable-job runtime.
- **No multi-document review.** One document per invocation.
- **No autonomous redlining.** Output is flags, not edits — advice tier
  is `draft_advice`, no further.
- **No real signature.** The signature on `module.json` is a structural
  placeholder (canonical SHA-256); sigstore is hardening backlog.

## Installing

```bash
# Re-sign after any manifest edit:
python -m backend.scripts.sign_example_module \
  examples/modules/contract_review/module.json
```

Then install via the trust ceremony:

```bash
POST /api/modules/install
{
  "source": "manifest",
  "manifest": <module.json contents>
}
```

3 trusts + 1 grant (verified fast path) lands the install. The
grant lifecycle holds the per-user capability grants from that point.

## Architectural notes

The load-bearing decisions:

1. **Real signed manifest** (today: structural verifier; sigstore
   crypto lands later).
2. **End-to-end acceptance test** at
   `backend/tests/test_invocations_api.py` is the contract —
   it walks install → grant → invoke → reconstruct in one function
   against a real Postgres.
3. **Synchronous; no new infrastructure.** If timeouts hurt, that's
   the signal to unpark async — not to inline async here.
4. **Artifacts on the matter file store** (`{matter_fs}/artifacts/...`)
   + WORM `matter_artifacts` row as the authoritative reference.
5. **Privilege gate reuses the substrate.** No new gate code; this
   module just declares `gates: ["privilege_posture"]` in its manifest.
6. **Provider call is real in production, monkey-patched in tests.**
   Test seam is at the provider-module level only; every other code
   path is production.

## Extending

To write your own module, copy this directory and adjust:

- `module.json` — id / name / version / capabilities
- `__init__.py` — change the imports
- `capability.py` — implement your capability(ies)

Re-sign with `sign_example_module.py`, install via the trust
ceremony, write an integration test of your own that walks the
same shape.
