# Legalise — Backup and Disaster Recovery

This is the backup and restore runbook. It covers what holds your data,
how to back it up, and how to get back to a working stack after a bad
deploy, data corruption, or total loss. Deploy mechanics and migration
discipline live in [`RUNBOOK.md`](./RUNBOOK.md); hosted-deploy secrets
live in [`handovers/DEPLOYMENT_SECRETS.md`](./handovers/DEPLOYMENT_SECRETS.md).

---

## 1. What is the source of truth

Two stores hold everything that matters. Everything else is derivable.

| Store | Holds | Hosted demo | Self-host compose |
|---|---|---|---|
| Postgres | Matters, documents, audit chain, sign-offs, users, encrypted user API keys | Neon (London) | `db` service (pgvector/pg16, `db_data` volume) |
| Object storage | Uploaded originals, generated `.docx`, export zips | Cloudflare R2 (`legalise-docs`) | `minio` service (`minio_data` volume) |

What is **not** a source of truth:

- **The Fly filesystem.** `MATTERS_ROOT=/data/matters` is intentionally
  ephemeral — redeploys wipe it, and the matter folders are rebuilt from
  the database. This is a stated convention, not an accident: see the
  `MATTERS_ROOT` comment in [`backend/fly.toml`](../backend/fly.toml)
  and the "Matter filesystem materialisation is ephemeral on Fly" note
  in [`infra/deploy/cloudflare.md`](../infra/deploy/cloudflare.md).
  Never back up a Fly machine's disk expecting matter data.
- **Redis.** Holds job ids and queue state only — no matter content,
  prompt bodies, response bodies, or document bodies, ever (see
  `handovers/DEPLOYMENT_SECRETS.md` §Redis). Losing Redis loses at most
  in-flight background jobs, which can be re-run.

So a complete backup is: **a Postgres backup + an object-storage copy.**
Nothing else.

---

## 2. Backup

### 2.1 Hosted: Neon point-in-time restore (PITR)

Neon keeps a continuous history of writes per branch, so the hosted
database can be restored to any point inside the project's retention
window — no cron job required for the database itself.

- **What it covers:** every table, including `audit_entries` and the
  hash chain, exactly as they were at the chosen timestamp.
- **Retention defaults:** plan-dependent — roughly 24 hours on the free
  plan and up to 7–30 days on paid plans. Check (and deliberately set)
  the **history retention** value in the Neon project settings; the
  default is the floor of your recovery window.
- **How a restore works:** Neon restores by creating a **branch** at a
  past timestamp (dashboard: Branches → Restore, or
  `neon branches create --parent main --timestamp <ISO8601>`). The
  current branch is untouched; you get a new branch with its own
  connection string and repoint the app at it. Steps in §3.2.

PITR does not cover R2. Run the object-storage sync below regardless.

### 2.2 Self-host: pg_dump on a cron

The compose stack has no managed PITR, so take logical dumps. From the
repo root, this produces a compressed custom-format dump:

```sh
docker compose -f infra/docker-compose.yml exec -T db \
    pg_dump -U legalise -Fc legalise > "legalise-$(date +%F).dump"
```

Cron example (02:00 daily, keep 14 days):

```cron
0 2 * * * cd /path/to/legalise && docker compose -f infra/docker-compose.yml exec -T db pg_dump -U legalise -Fc legalise > /backups/legalise-$(date +\%F).dump && find /backups -name 'legalise-*.dump' -mtime +14 -delete
```

Store dumps on a different disk or host than the `db_data` volume. A
backup that lives next to the thing it protects is not a backup.

### 2.3 Object storage sync (rclone)

For the hosted demo, mirror the R2 bucket to local disk (or a second
bucket) with rclone. One-time remote config in `~/.config/rclone/rclone.conf`:

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2 access key>
secret_access_key = <R2 secret key>
endpoint = https://<account>.r2.cloudflarestorage.com
```

Then sync:

```sh
rclone sync r2:legalise-docs /backups/legalise-docs --progress
```

Run it on the same cron cadence as the database backup. For self-host
MinIO, point an `[minio]` remote at `http://localhost:9000` with the
compose credentials and sync `minio:legalise` the same way.

---

## 3. Restore runbook

### 3.1 Scenario A — bad deploy (code is wrong, data is fine)

Roll the Fly app back to the previous image. No database work needed
unless the bad deploy also ran a migration (see `RUNBOOK.md` §1 for
`alembic downgrade -1`).

```sh
# Find the last good release and its image reference.
fly releases --app legalise-backend --image

# Redeploy that exact image.
fly deploy --app legalise-backend --image registry.fly.io/legalise-backend@<digest-of-last-good-release>
```

Then confirm: `curl -s https://api.legalise.dev/health | jq .` and the
doctor check in §4.

### 3.2 Scenario B — data corruption (hosted, Neon PITR)

You know roughly when the bad write happened. Restore to just before it.

1. In the Neon dashboard (Branches → Restore) or CLI, create a restore
   branch at the last-known-good timestamp:

   ```sh
   neon branches create --project-id <project> \
       --parent main --timestamp "2026-06-11T09:00:00Z" \
       --name restore-2026-06-11
   ```

2. Copy the new branch's connection string and rewrite the prefix to
   `postgresql+psycopg://`, keeping `?sslmode=require` (the driver
   prefix is load-bearing — see `infra/deploy/cloudflare.md`).
3. Repoint the backend and redeploy:

   ```sh
   fly secrets set --app legalise-backend \
       POSTGRES_DSN="postgresql+psycopg://user:pass@<restore-branch-host>/legalise?sslmode=require"
   ```

   Setting the secret restarts the machines; the release command runs
   `alembic upgrade head` against the restored branch on the next
   `fly deploy`, which is a no-op if the schema was already current.
4. Run the verification in §4 before letting anyone back in. Writes made
   between the restore point and now are gone from the database; if any
   of those produced signed outputs, the per-matter export bundles (§4)
   are the evidentiary fallback.
5. Once verified, treat the restore branch as the new primary (Neon lets
   you promote or simply keep pointing at it) and delete the corrupted
   branch when you no longer need it for forensics.

### 3.3 Scenario C — full self-host restore (new machine, dumps + bucket copy in hand)

1. Clone the repo, `cp .env.example .env`, set your secrets.
2. Bring up only the data services:

   ```sh
   docker compose -f infra/docker-compose.yml up -d db minio
   ```

3. Restore the database dump:

   ```sh
   docker compose -f infra/docker-compose.yml exec -T db \
       pg_restore -U legalise -d legalise --clean --if-exists < legalise-2026-06-11.dump
   ```

4. Restore the bucket (MinIO remote configured as in §2.3):

   ```sh
   rclone sync /backups/legalise-docs minio:legalise --progress
   ```

5. Bring up the rest of the stack:

   ```sh
   docker compose -f infra/docker-compose.yml up -d
   ```

   In `ENVIRONMENT=development` the backend runs `alembic upgrade head`
   on boot, which reconciles any schema drift between the dump and the
   code you checked out.
6. Run doctor (§4). Do not declare the restore done until it is green.

---

## 4. Verification

### 4.1 Backend doctor

Doctor is the post-restore integrity check. It is read-only and prints
one line per check:

```sh
docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor
# Hosted:
fly ssh console --app legalise-backend -C "python -m app.tools.doctor"
```

The checks that matter most after a restore:

- `db.reachable`, `db.migrations_current`, `db.audit_table_present` —
  the database came back and the schema matches the code.
- **`audit.chain_verifies`** — the audit hash chain recomputes cleanly
  end to end. A restore that truncated or reordered `audit_entries`
  fails here. This is the single strongest signal that the restored
  database is the database you backed up.
- `redis.reachable`, `manifests.valid`, `registry.discovery`,
  `provider.mode` — the rest of the stack is sane.

Exit code 0 means every check is ok or note; 1 means at least one
failure. Treat any `fail` row as a blocked restore.

Spot-check storage too: open a matter, download an original document,
and confirm a generated `.docx` still fetches. Doctor verifies the
database; the document fetch verifies the bucket restore.

### 4.2 Per-matter fallback: the export bundle

Every matter can export a self-contained zip (Working pack → export, or
`POST /api/matters/{slug}/export`). The bundle carries the matter's
full evidentiary record independent of the live database:
`matter_metadata.json`, the documents with comments / versions / edit
decisions, `artefacts/` with `artefacts.json` and `signoffs.json`,
supervisor `reviews.json`, the rebuilt decision timeline
(`reconstruction.json`), the raw audit chain (`audit.json`), and a
human-readable `WORKING_PACK.md` + `README.md` index (built in
`backend/app/core/exports.py`).

If a restore loses recent writes, an export bundle taken before the
incident is the per-matter record of what was produced and who signed
it. Exporting active matters on a regular cadence is cheap insurance on
top of the store-level backups.

---

## 5. What is not covered yet

Honest gaps, so nobody assumes them:

- **No automated backup verification job.** Dumps and syncs are taken
  but never automatically restored-and-checked. Until that exists,
  rehearse §3.3 against a scratch machine occasionally — an untested
  backup is a hope, not a plan.
- **No cross-region replication.** Neon London and R2 are single-region
  (R2's `eu` jurisdiction is a placement constraint, not a replica).
  A regional outage is downtime, not data loss — but recovery waits on
  the provider.
- **In-process ceremonies are lost on restart.** Multi-step flows held
  in backend memory (for example a skill-add ceremony mid-flight) do not
  survive a machine restart. This is harmless: no committed data is
  involved — restart the add flow from the beginning.

- No multi-tenancy: one deployment is one workspace (deliberate beta scope; see README Status). Teams needing separation run one deployment each.
