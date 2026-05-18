# claude-for-uk-legal manifests — staging

Three `module.json` files for the `claude-for-uk-legal` plugins. Per the hard guard, no agent files land in `claude-for-uk-legal` directly. These are drafted here for Andy to copy across.

## Where each one goes

| File in this dir | Destination in `claude-for-uk-legal` |
|---|---|
| `uk-employment-legal.module.json` | `uk-employment-legal/module.json` |
| `uk-litigation-legal.module.json` | `uk-litigation-legal/module.json` |
| `uk-research-legal.module.json` | `uk-research-legal/module.json` |

## Steps

```bash
# In your local claude-for-uk-legal checkout
cp /Users/andy/Cursor\ Projects\ 2026/legalise/claude-for-uk-legal-manifests/uk-employment-legal.module.json  uk-employment-legal/module.json
cp /Users/andy/Cursor\ Projects\ 2026/legalise/claude-for-uk-legal-manifests/uk-litigation-legal.module.json  uk-litigation-legal/module.json
cp /Users/andy/Cursor\ Projects\ 2026/legalise/claude-for-uk-legal-manifests/uk-research-legal.module.json    uk-research-legal/module.json

git add uk-employment-legal/module.json uk-litigation-legal/module.json uk-research-legal/module.json
git commit -m "Add plugin manifests with declared capabilities"
git push
```

After the push, re-pin `PLUGINS_REPO_REF` in `backend/app/core/config.py` to the new HEAD SHA and verify against the dev stack:

```bash
curl -s -b /tmp/legalise-qa.jar http://localhost:8000/api/modules \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('skills:', len(d['skills']), '| broken:', len(d['broken']))"
```

Expected: `skills: 15 | broken: 0`.

## What the manifests declare

Per-skill capabilities. The schema's optional `skills` map carries per-skill overrides; the bridge prefers per-skill values and falls back to plugin-level when absent. Plugin-level `capabilities` is the union, kept as the safety fallback for consumers that do not read `skills`. All three plugins use `trust_posture: trusted` because they originate from the canonical `b1rdmania/claude-for-uk-legal` catalogue.

### uk-employment-legal (6 skills)

| Skill | Capabilities |
|---|---|
| `lba-drafter` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `acas-early-conciliation` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `et1-claim-drafter` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `unfair-dismissal-screener` | matter.read, document.body.read, model.invoke, audit.emit |
| `settlement-agreement-review` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `part-36-offer` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |

`unfair-dismissal-screener` is the only narrow one. It returns a viability verdict, not a generated document, so `document.generated.write` is dropped.

### uk-litigation-legal (5 skills)

| Skill | Capabilities |
|---|---|
| `pre-motion` | matter.read, document.body.read, chronology.read, model.invoke, audit.emit |
| `chronology` | matter.read, document.body.read, chronology.read, chronology.write, model.invoke, audit.emit |
| `cpr-letter-drafter` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `disclosure-list` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `without-prejudice-drafter` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |

`pre-motion` reads chronology but does not write documents. `chronology` is the only writer of chronology events.

### uk-research-legal (4 skills)

| Skill | Capabilities |
|---|---|
| `find-case-law` | matter.read, citation.write, model.invoke, audit.emit |
| `citation-verifier` | matter.read, citation.write, model.invoke, audit.emit |
| `legislation-lookup` | matter.read, citation.write, model.invoke, audit.emit |
| `practice-direction-lookup` | matter.read, citation.write, model.invoke, audit.emit |

Research skills are uniform. Each writes a citation row, none generates a document in v0.1.

## Schema reference

The manifest schema is at `legalise:schemas/module.json`. The `capabilities` enum is the reviewer-locked v0.1 vocabulary:

```
matter.read | document.body.read | document.generated.write | model.invoke |
chronology.read | chronology.write | citation.write | audit.emit
```

New names need a schema PR and reviewer signoff.
