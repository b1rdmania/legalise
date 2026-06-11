# agent-kit evals

Deterministic regression evals for the Legalise substrate, run with
[agent-kit](https://github.com/b1rdmania/agent-kit) against the
adapter at `POST /api/evals/agent`.

The adapter routes on `input.case` and calls the **real** production
functions — nothing is reimplemented for the eval:

| case | exercises | output |
|---|---|---|
| `posture_refusal` | `core/posture_gate._evaluate_posture` (the policy core behind every capability gate) | `{refused, reason, posture}` |
| `deterministic_summary` | `modules/assistant/pipeline._match_requested_document` (keyless filename/tag matcher) | `{matched_document}` |
| `chain_intact` | `core/audit_chain.verify_audit_chain` | `{verified, audit_entry_count, chain_entry_count, scopes_verified, issues}` |

`posture_refusal` takes either `matter_slug` (reads the live posture
off the matter row) or an explicit `posture` (deterministic regardless
of deployment state). `chain_intact` takes an optional `matter_slug`
to narrow to one scope; absent, it verifies every chain scope.

## Auth

The endpoint is disabled (503) until `AGENT_KIT_SECRET` is set in the
backend environment. The runner sends the secret in the
`X-Agent-Kit-Secret` header; a mismatch is 403.

## Run it

```bash
# 1. Start the stack with the secret in the backend env
export AGENT_KIT_SECRET="pick-a-secret"
docker compose -f infra/docker-compose.yml up -d

# 2. Install the runner (once)
pip install git+https://github.com/b1rdmania/agent-kit.git@main

# 3. Run the dataset (same shell, so AGENT_KIT_SECRET is exported)
agent-kit run \
  --dataset evals/agent-kit/dataset.jsonl \
  --endpoint http://localhost:8000/api/evals/agent \
  --secret-env AGENT_KIT_SECRET
```

Or, from this directory: `just run` (and `just run-json > results.json`
for CI).

Note: compose reads repo-root `.env` via `env_file`, so putting
`AGENT_KIT_SECRET=pick-a-secret` in `.env` also works.

## Dataset notes

- Records tagged `live-db` depend on deployment state: the seeded Khan
  matter (`khan-v-acme-trading-2026` — seeded for each registered user
  and at compose startup) and a healthy audit chain. The rest are
  self-contained and pass against any deployment.
- `posture-live-khan-matter` asserts shape + posture only, because
  `refused` flips with `LEGALISE_FIRM_ROLE_GATES_ENABLED` (dormant =
  `false` locally and on the hosted eval).
- Per the agent-kit workflow, when a regression hits prod: add a
  record here with judges that would have caught it, then fix. The
  dataset is the asset.
