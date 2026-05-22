# Production Smoke

This is the launch smoke checklist. Run it after backend substrate fixes are merged, before public posting.

Doctrine:

> Legalise is open source. The hosted site is a limited evaluation environment.

Do not skip this because the tests are green. This checks first-user reality.

---

## 1. Clean Clone Smoke

Run from a fresh directory, not the working repo.

```bash
git clone https://github.com/b1rdmania/legalise legalise-smoke
cd legalise-smoke
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

Expected:

- backend starts cleanly.
- frontend opens at `http://localhost:3000`.
- `/health` returns OK.
- no missing plugin checkout surprise.
- no missing env var surprise for local evaluation.

Record:

- commit hash:
- date/time:
- machine:
- result:

---

## 2. Account Flow

In a browser:

1. Sign up with a fresh email.
2. Verify email in dev/logged flow or via Resend in production.
3. Confirm the Khan v Acme demo matter is copied into the new workspace.
4. Sign out.
5. Sign in again.
6. Confirm the session cookie survives page refresh.
7. Open Settings and add a BYO Anthropic or OpenAI key.
8. Confirm key is stored without echoing the raw value back to the UI.

Expected:

- no server model key required in production.
- missing BYO key produces a friendly provider-key error.
- user cannot see another user's matter by slug.

---

## 3. Matter Walk

Open the Khan v Acme matter and walk every left-nav item.

Must check:

- Assistant loads and cites documents/chronology.
- Documents list loads.
- Upload accepts valid PDF/DOCX and rejects wrong MIME or spoofed magic bytes.
- Chronology renders only after CPR 31.22 gate acknowledgement where required.
- Workflows list opens.
- Pre-Motion can start or returns the expected BYO-key error.
- Contract Review can start or returns the expected BYO-key error.
- Letters can draft or returns the expected BYO-key error.
- Audit tab shows rows for the actions above.

Record screenshots for:

- Assistant with citation chip.
- Documents list.
- Chronology gate or acknowledged chronology.
- Workflows catalogue.
- Audit row drawer.

---

## 4. Limits

Hosted evaluation limits must be visible and non-catastrophic.

Check:

- `GET /api/me/usage` returns usage/max fields.
- document upload limit returns structured `evaluation_limit_reached`.
- workflow run limit returns structured `evaluation_limit_reached`.
- active job limit returns structured `active_job_limit_reached`.
- frontend shows hosted-evaluation limit copy, not a raw HTTP error.

Required copy:

> Hosted evaluation limit reached. Legalise is open source; self-hosting removes hosted limits.

---

## 5. Jobs

After substrate fixes:

1. Start an export job.
2. Poll `GET /api/matters/{slug}/jobs/{job_id}` until terminal.
3. Confirm terminal state is `succeeded` or a structured `failed`.
4. Confirm Redis enqueue failure cannot leave a permanent queued job.
5. Confirm worker process is running in production.

Expected:

- Redis carries job ids only.
- Postgres remains source of truth.
- job rows survive request disconnect.
- failed jobs do not consume active-job limit forever.

---

## 6. Export And Delete

1. Create a matter export.
2. Download the export bundle.
3. Inspect zip contents.
4. Delete the matter.
5. Confirm deleted matter no longer appears in list/detail.
6. Confirm storage objects for the matter prefix are gone.
7. Confirm audit FK story still works against the archived/tombstoned matter row.
8. Confirm account deletion works after all live matters are deleted.

Expected:

- delete does not return success if storage cleanup fails.
- export scope is either explicitly "basic export bundle" or complete enough to leave.
- no audit row mutation is needed.

---

## 7. Production Smoke

Run after deploy.

Targets:

- `https://legalise.dev`
- backend API host:
- Fly app:
- Neon project:
- R2 bucket:

Checks:

- landing loads.
- signup works.
- email verification works.
- BYO key works.
- no server-paid model keys are configured.
- upload works.
- workflow/job path works.
- generated document download works.
- export/delete works.
- audit rows appear.
- logs contain no provider keys, prompt bodies, response bodies, document text, or raw uploaded file names beyond intended metadata.

Do not launch publicly until this page is filled in with actual results.
