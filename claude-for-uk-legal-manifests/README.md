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

Per-plugin capability union (the bridge applies these to every skill in the plugin in v0.1; per-skill granularity lands with runtime enforcement). All three plugins use `trust_posture: trusted` because they originate from the canonical `b1rdmania/claude-for-uk-legal` catalogue.

| Plugin | Capabilities |
|---|---|
| `uk-employment-legal` | matter.read, document.body.read, document.generated.write, model.invoke, audit.emit |
| `uk-litigation-legal` | matter.read, document.body.read, document.generated.write, chronology.read, chronology.write, model.invoke, audit.emit |
| `uk-research-legal` | matter.read, citation.write, model.invoke, audit.emit |

Skill-level reasoning behind each union:

- **uk-employment-legal**: every skill drafts a letter or analyses a claim. All read matter + document bodies, all call the model, all emit audit. Five of six write a generated document (the unfair-dismissal-screener returns a screening verdict, not a doc — but the plugin union still includes the write capability).
- **uk-litigation-legal**: pre-motion and chronology read chronology; chronology writes it. Three drafting skills write documents. All read matter + document bodies, call the model, emit audit.
- **uk-research-legal**: every skill is a research lookup that writes a citation row. None write generated documents in v0.1.

## Schema reference

The manifest schema is at `legalise:schemas/module.json`. The `capabilities` enum is the reviewer-locked v0.1 vocabulary:

```
matter.read | document.body.read | document.generated.write | model.invoke |
chronology.read | chronology.write | citation.write | audit.emit
```

New names need a schema PR and reviewer signoff.
