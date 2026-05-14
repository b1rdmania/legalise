# Handover — Pivot Batch Done

Status: implementation complete locally. Commit SHA is the commit containing
this file.

## What landed

- Backend discovery API:
  - `GET /api/modules`
  - `GET /api/modules/{plugin}/{skill}`
  - Scans `PLUGINS_ROOT` for `*/skills/*/SKILL.md`
  - Reuses the existing `plugin_bridge._parse_skill_md` parser
  - Returns pinned source URLs using `PLUGINS_REPO` + `PLUGINS_REPO_REF`
- Frontend discovery page:
  - `#/modules`
  - TopBar Modules nav + breadcrumb
  - Skills grouped by plugin
  - `view source ->` links to the pinned GitHub blob
  - `view prompt ->` expands the actual SKILL.md prompt body
- Framing rewrite:
  - Landing now leads with "audited execution layer for Claude legal skills"
  - README adds Git-as-marketplace installation workflow
  - README explains skills vs surfaces
- Trust docs:
  - New `docs/TRUST.md` section on skill provenance and approval
- Build plan:
  - Adds Day 17a module discovery + catalogue framing
  - Retires Plain-English stretch
  - Reshapes Day 17/18 around paired Legalise + claude-for-uk-legal launch
- Eval repair:
  - `evals/smoke_sample_matter.py` now fetches up to 1000 audit rows so
    repeated local eval runs do not fail once the matter has more than 100
    audit entries.

## Architectural calls

I extended the existing `SkillManifest` parser to include `argument-hint`
rather than adding a second frontmatter parser in the modules endpoint. That
keeps SKILL.md parsing in one place.

I did not add a semantic audit row for `GET /api/modules`. Existing middleware
does not audit read-only GETs, and the pivot brief explicitly says semantic
rows would be overkill for v0.1.

## Validation

Ran against local compose. Backend providers were `stub-echo` only; no real
Anthropic key was present in this local environment.

```text
python3 -c 'import ast; ast.parse(open("backend/app/api/modules.py").read())'
PASS

npm run typecheck
PASS

npm run build
PASS

curl http://localhost:3000/api/modules | jq '{count: (.skills|length), plugins: ([.skills[].plugin] | unique)}'
{
  "count": 15,
  "plugins": [
    "uk-employment-legal",
    "uk-litigation-legal",
    "uk-research-legal"
  ]
}

curl http://localhost:3000/api/modules/uk-employment-legal/lba-drafter
PASS — returns the prompt body beginning "# /lba-drafter"

docker compose -f infra/docker-compose.yml exec -T backend pytest tests/
15 passed

EVAL_API_BASE=http://localhost:3000/api python3 evals/smoke_letter_routing.py
PASS

EVAL_API_BASE=http://localhost:3000/api python3 evals/smoke_sample_matter.py
PASS — audit rows 109 -> 127 (+18), model=stub-echo
```

## Not validated

- Browser visual click-through of `#/modules` in the in-app browser. The API,
  route, TypeScript, and build are green, but I did not use a browser automation
  tool in this pass.
- Real Anthropic output quality. Local backend registered `stub-echo`, so this
  pass proves shape and audit contracts, not legal drafting quality.
