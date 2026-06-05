# claude-for-uk-legal manifests — staging

Two `module.json` files for the `claude-for-uk-legal` plugins. Per the hard guard, no agent files land in `claude-for-uk-legal` directly. These are drafted here for Andy to copy across.

## Where each one goes

| File in this dir | Destination in `claude-for-uk-legal` |
|---|---|
| `uk-employment-legal.module.json` | `uk-employment-legal/module.json` |
| `uk-litigation-legal.module.json` | `uk-litigation-legal/module.json` |

## Steps

```bash
# In your local claude-for-uk-legal checkout
cp /Users/andy/Cursor\ Projects\ 2026/legalise/claude-for-uk-legal-manifests/uk-employment-legal.module.json  uk-employment-legal/module.json
cp /Users/andy/Cursor\ Projects\ 2026/legalise/claude-for-uk-legal-manifests/uk-litigation-legal.module.json  uk-litigation-legal/module.json

git add uk-employment-legal/module.json uk-litigation-legal/module.json
git commit -m "Update plugin manifests"
git push
```

After the push, re-pin `PLUGINS_REPO_REF` in `backend/app/core/config.py` to the new HEAD SHA and verify against the dev stack:

```bash
curl -s -b /tmp/legalise-qa.jar http://localhost:8000/api/modules \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('skills:', len(d['skills']), '| broken:', len(d['broken']))"
```

Expected: `skills: 8 | broken: 0`.

## What the manifests declare

Per-skill capabilities. The schema's optional `skills` map carries per-skill overrides; the bridge prefers per-skill values and falls back to plugin-level when absent. Plugin-level `capabilities` is the union, kept as the safety fallback for consumers that do not read `skills`. Both plugins use `trust_posture: trusted` because they originate from the canonical `b1rdmania/claude-for-uk-legal` catalogue.

### uk-employment-legal (3 skills)

| Skill | Capabilities |
|---|---|
| `lba-drafter` | matter.read, document.body.read, document.generated.write, model.invoke |
| `unfair-dismissal-screener` | matter.read, document.body.read, model.invoke |
| `settlement-agreement-review` | matter.read, document.body.read, document.generated.write, model.invoke |

`unfair-dismissal-screener` is the only narrow one. It returns a viability view, not a generated document, so `document.generated.write` is dropped.

### uk-litigation-legal (5 skills)

| Skill | Capabilities |
|---|---|
| `pre-motion` | matter.read, document.body.read, chronology.read, model.invoke |
| `chronology` | matter.read, document.body.read, chronology.read, chronology.write, model.invoke |
| `cpr-letter-drafter` | matter.read, document.body.read, document.generated.write, model.invoke |
| `disclosure-list` | matter.read, document.body.read, document.generated.write, model.invoke |
| `without-prejudice-drafter` | matter.read, document.body.read, document.generated.write, model.invoke |

`pre-motion` reads chronology but does not write documents. `chronology` is the only writer of chronology events.

## Schema reference

The manifest schema is at `legalise:schemas/module.json`. The `capabilities` enum is the reviewer-locked v0.1 vocabulary:

```
matter.read | document.body.read | document.generated.write | model.invoke |
chronology.read | chronology.write | citation.write
```

(`citation.write` is now unused after the research pack was retired; left in the schema for forward compatibility.) New names need a schema PR and reviewer signoff.
