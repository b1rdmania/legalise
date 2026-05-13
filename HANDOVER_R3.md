# Handover — Round 3 (Days 2–4 code review)

Previous handovers (`REVIEW_HANDOVER.md`) covered the plan documents. This
one covers the **code** shipped across three commits this session.

## Commits in scope

| Hash | Day | What it ships |
|------|-----|---------------|
| `fe9f2fc` | — | Design contract switch to Oxide-derived Midnight Command Center. `docs/DESIGN.md` rewritten; `docs/mockups/matter-detail.html` aligns. |
| `f781c5d` | Day 2 | Matter model, CRUD API, document register, auth stub, frontend list/new/detail views. |
| `8ee395f` | Day 3 | Audit middleware, model gateway with audit hook, privilege enforcement, frontend audit log + posture control. |
| `3798ad2` | Day 4 | Sample-matter seed (Khan v Acme), filesystem materialisation (Stella-compatible). |

Day 5+ has **not** been touched. Stop point is the end of Day 4.

---

## What you're reviewing — the new surface

### Backend

```
backend/
├── alembic/versions/0002_matter_tables.py   # users, matters, documents, events, audit_entries
├── alembic/env.py                            # now imports all models so metadata is populated
├── app/main.py                               # lifespan now seeds Khan in dev
├── app/api/__init__.py                       # exports matters_router
├── app/api/matters.py                        # the only HTTP router shipped so far
├── app/core/auth.py                          # hardcoded solicitor user; v0.2 swaps in real auth
├── app/core/audit.py                         # middleware logs mutations on /api/matters/*
├── app/core/db.py                            # session dependency
├── app/core/matter_fs.py                     # only writer of files under matters_root
├── app/core/model_gateway.py                 # privilege-aware gateway + StubProvider
├── app/core/seed.py                          # idempotent Khan v Acme demo matter
└── app/models/                               # User, Matter, Document, Event, AuditEntry
```

### Frontend

```
frontend/
├── tailwind.config.js                        # full Oxide palette + Inter / Fira Code families
├── src/index.css                             # Google Fonts @import + body defaults
├── src/lib/api.ts                            # typed fetch wrapper for backend
├── src/lib/route.ts                          # minimal hash router (TanStack Router lands later)
└── src/App.tsx                               # list / new / detail views, audit log, privilege control
```

---

## What needs testing

### 1. Boot and seed (no API keys required)

```bash
cd infra
docker compose up --build
```

**Expect:**
- Backend healthy at `http://localhost:8000/health` returning `{"status":"ok","database":"ok",…}`
- Frontend at `http://localhost:3000` (or whatever the compose maps)
- Logs show `legalise.startup.seed_ok slug=khan-v-acme-trading-2026`
- On disk in the container's `/data/matters/khan-v-acme-trading-2026/` (mounted volume):
  - `matter.md` with YAML frontmatter (slug, parties, key_dates, posture) + body
  - `history.md` with at least a `matter.seeded` line
  - `chronology.md` with the seeded header table
  - `documents/` (empty)

### 2. API contract

The router is at `app/api/matters.py`. Endpoints:

```bash
# List matters — should return at least Khan
curl -s http://localhost:8000/api/matters | jq '.[].slug'

# Get Khan
curl -s http://localhost:8000/api/matters/khan-v-acme-trading-2026 | jq

# Create a new matter
curl -s -X POST http://localhost:8000/api/matters \
  -H 'content-type: application/json' \
  -d '{"title":"Patel v Greenshore LLP","matter_type":"professional_negligence"}' | jq

# Upload a document (metadata-only register — binary store lands Day 5+)
curl -s -X POST http://localhost:8000/api/matters/khan-v-acme-trading-2026/documents \
  -F 'file=@README.md' \
  -F 'tag=draft' | jq

# Change privilege posture (must be A_cleared / B_mixed / C_paused)
curl -s -X PATCH http://localhost:8000/api/matters/khan-v-acme-trading-2026/privilege \
  -H 'content-type: application/json' \
  -d '{"privilege_posture":"C_paused"}' | jq

# Audit log
curl -s http://localhost:8000/api/matters/khan-v-acme-trading-2026/audit | jq '.[] | {action, resource_type, timestamp}'
```

**Things to confirm:**
- Every mutation (POST/PATCH) on `/api/matters/*` produces **two** audit rows: one semantic (`matter.create`, `document.upload`, `privilege.set`) written inline by the router, one `http.{method}` written by the middleware. Both are intentional — semantic event for humans, HTTP record for forensics. **Push back if you think one should go.**
- Slug auto-generation works (`Patel v Greenshore LLP` → `patel-v-greenshore-llp`), collisions append `-2`, `-3`.
- `privilege_posture` invalid values reject with 400.
- File upload computes sha256 correctly (verify by re-uploading the same file — different document row, identical sha).

### 3. Privilege enforcement (the load-bearing constraint)

The model gateway lives at `backend/app/core/model_gateway.py`. There is no
public endpoint that invokes it yet — that lands Day 5 with the plugin
bridge. For now, verify by inspection:

- `PrivilegePaused` is raised **before** any provider call when posture is `C_paused`. Look at `ModelGateway.call`, the first guard.
- `B_mixed` prefers a local provider (`ollama`) when one is registered; falls back to requested model otherwise.
- `A_cleared` honours the caller's requested model with no rerouting.
- Every successful call writes an `AuditEntry` with `action='model.call'` plus `prompt_hash`, `response_hash`, `token_count`, `latency_ms`, `model_used`. The payload includes `requested_model` and `posture`.
- **The session is the caller's responsibility** — the gateway calls `session.add(audit_entry)` but does not commit. This means a transactional caller can roll back both the call's side effects AND the audit row together. Verify the comment in the source matches this design choice; if you disagree, say so.

A quick way to exercise the gateway from a Python shell inside the backend container:

```python
import asyncio
from app.core.model_gateway import gateway, PrivilegePosture
from app.core.db import get_session  # or build a session manually

async def go():
    # paused → should raise
    try:
        await gateway.call(session=session, matter_id=None, actor_id=None,
                           prompt="hi", posture=PrivilegePosture.C_PAUSED)
    except Exception as e:
        print("blocked:", e)
    # mixed → stub-echo responds
    r = await gateway.call(session=session, matter_id=None, actor_id=None,
                           prompt="hi", posture=PrivilegePosture.B_MIXED)
    print(r)
```

### 4. Filesystem materialisation

`backend/app/core/matter_fs.py`. **It is the only writer of files under `settings.matters_root`.** Anything outside the workspace writing there is a bug.

- Create a matter → `matters/[slug]/matter.md` appears immediately.
- Upload a doc → `matters/[slug]/documents/[filename].meta` appears with sha256 + size + tag; `history.md` grows by one line.
- Change posture → `history.md` records the transition; `matter.md` regenerates with the new posture.
- Sense-check the YAML: parties is a dict with `client` (string) and `opposing` (list of strings); `key_dates` is a list-of-dicts. Both formats should round-trip through PyYAML cleanly. **A failing roundtrip is a bug.**

```bash
python3 -c "import yaml; print(yaml.safe_load(open('/data/matters/khan-v-acme-trading-2026/matter.md').read().split('---')[1]))"
```

### 5. Design-token compliance (the painful loop)

We burnt three iterations on the matter-detail mockup before locking the
Oxide tokens. The compliance discipline:

- **Allowed font sizes** (DESIGN.md type scale): SuisseIntl (sub: Inter) at 11/12/14/16/18/20/25/36/50/65 only; GT America Mono (sub: Fira Code) at 10/11/12/13/20 only.
- **Border radii**: 0px or 1px. Anything else (especially `9999px` / pill / `rounded-full`) is a violation.
- **Font weights**: 400 only.
- **Colours**: from the palette in `tailwind.config.js`. No off-token hex.

Audit commands:

```bash
# Frontend
cd frontend
grep -rE "rounded-(full|2xl|xl|lg)|font-bold|font-semibold|font-medium" src/      # should be empty
grep -rE "text-\[(?!10|11|12|13|14|16|18|20|25|36|50|65)" src/                    # should be empty

# Mockup
cd docs/mockups
grep -oE "font-size: [^;]+;" matter-detail.html | sort -u
grep -oE "border-radius: [^;]+;" matter-detail.html | sort -u
```

The mockup at `docs/mockups/matter-detail.html` is the visual contract for
the matter detail page. Open it in a browser side-by-side with the live app
and tell me where they diverge.

---

## Deliberate gaps (not bugs — review the choices)

- **No real LLM provider yet.** `StubProvider` returns deterministic echoes so the workspace runs without API keys. Real Anthropic / OpenAI / Ollama HTTP wiring is Day 5.
- **Document uploads are metadata-only.** SHA-256 of the contents is captured, but the binary is dropped after hashing. MinIO/R2 binary store is Day 5+. The `.meta` placeholder under `documents/` is the visible-on-disk stand-in.
- **Hash routing, not TanStack Router.** Three views does not yet justify file-based routing setup. Switch lands Day 6+ when the module surfaces (Pre-Motion, Chronology, Letters) start needing real routes.
- **Single hardcoded user.** `jasmine.solicitor@birdlegal.co.uk`. Real auth (WorkOS or Stytch) is v0.2 — `current_user` is the single integration point.
- **GETs are not middleware-audited.** Inline writes cover the semantic events. Middleware records mutations only. We can change this if you think reads should be logged for some regulatory reason — but the build plan's "every API call touching a matter" is currently interpreted as mutations.
- **No WORM enforcement on `audit_entries`.** The table is append-only by convention; PG-level grants that revoke UPDATE/DELETE on the audit table are v0.2.
- **No tests committed.** The two smoke tests in this handover (boot + materialiser) were run interactively, not codified. Pytest skeleton lands when the API surface stops moving.

---

## What I'd like you to attack

1. **Audit completeness.** Walk every endpoint and confirm there is at least one audit row produced. Then walk the audit row contents and confirm the `payload` JSONB captures enough context for a regulator's later question ("what model was called, with what prompt hash, for which matter, by whom, when").

2. **Privilege gate correctness.** Two ways to bypass C_paused would be disastrous:
   - Calling a provider directly (skipping `gateway.call`). Grep for `Anthropic(`, `openai`, `ollama.` outside the gateway — none should exist.
   - A posture race: matter is read at B_mixed, posture set to C_paused, original B_mixed view used to dispatch the call. The gateway currently trusts the `posture` parameter — the *caller* must re-read posture before calling. Is this the right division of labour, or should the gateway read it itself?

3. **Filesystem materialiser idempotency.** Run `seed_demo_matter` twice and confirm: (a) no duplicate matter row, (b) `matter.md` regenerates without orphaned content, (c) `history.md` gains exactly one new `matter.materialised` line per run, (d) `chronology.md` is **not** overwritten if it has hand-edits (currently I only seed if absent — verify).

4. **Design contract drift.** I have form for importing patterns that aren't in the spec (drop caps, eyebrows with rule-marks, pill bubbles, mono fonts where the spec said none). Read `docs/DESIGN.md` then `docs/mockups/matter-detail.html` and `frontend/src/App.tsx` and flag anything off-spec. Especially: any font-size not in the allowed list, any radius other than 0/1px, any colour not in the palette.

5. **The two-audit-rows question.** Mutations currently produce both a semantic event and an `http.{method}` row. Is that the right call? Justify or push back.

---

## Run sheet for the reviewer

```bash
git fetch && git checkout 3798ad2

# Backend boot via compose
cd infra && docker compose up --build -d

# Wait for health, then smoke
curl -s localhost:8000/health
curl -s localhost:8000/api/matters | jq '.[0].slug'

# Filesystem check inside container
docker compose exec backend ls -la /data/matters/khan-v-acme-trading-2026/

# Frontend smoke
open http://localhost:3000

# Audit token compliance
cd ../frontend
grep -rE "rounded-(full|2xl|xl|lg)|font-bold|font-semibold|font-medium|text-\[15px\]|text-\[24px\]" src/

cd ../docs/mockups
grep -oE "font-size: [^;]+;" matter-detail.html | sort -u

# Privilege bypass grep
cd ../../backend
grep -rE "Anthropic\(|openai\.|ollama\." app/ | grep -v model_gateway.py
```

Reply with: what works, what fails, where the design drifts, and your call
on the two-audit-rows question. Day 5 (real providers + plugin bridge) does
not begin until you sign off.
