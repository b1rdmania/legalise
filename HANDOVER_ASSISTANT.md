# HANDOVER — Matter-scoped Assistant (the workspace shell)

**Base head:** `3591833` (demo route landed, no assistant yet).
**Estimated scope:** 1.5–2 working days.
**Strategic frame:** Legalise has the harder substrate (matter ownership, auth, per-user keys, audit, posture routing, module bridge, submission flow). What's missing is the recognisable product shell. The Assistant is that shell. Built as a **module orchestration surface**, not a parallel system — same gateway, same audit, same posture, same matter context. It strengthens the substrate thesis instead of diluting it.

The three product primitives this lands:
1. **Workspace** — account, settings, API keys, installed modules, demo matter.
2. **Matter** — documents, chronology, letters, pre-motion, contract review, anonymisation, audit.
3. **Assistant** — matter-scoped chat that answers, cites, and routes into modules.

The cold-readable workflow: `create / sign in → open matter → upload / read documents → ask assistant → run structured tools → export`.

---

## 1. Locked decisions

1. **Assistant becomes the matter homepage.** New first tab `assistant`, default landing when opening a matter. `overview` remains as second tab; its content can also collapse into a right-side context strip inside the Assistant tab (agent's call — pick whichever reads cleaner).

2. **Non-streaming for v0.1.** `POST /api/matters/{slug}/assistant/messages` is a request/response cycle. SSE variant is v0.2 polish (mirror the Contract Review pattern). Ship fast wins over Harvey-feel parity.

3. **Built-in prompt, not a SKILL.md.** The assistant IS the orchestration surface — it doesn't fit the domain-specific skill abstraction the other modules use. Hard-code the system prompt and prompt-assembly logic in `backend/app/modules/assistant/pipeline.py`. v0.2 may move it to a skill if firms want to fork it.

4. **Action chips schema:** `{type: "run_pre_motion" | "draft_letter" | "review_contract" | "view_document" | "view_audit" | ..., label: str, params: dict}`. Clicking a chip navigates to the relevant tab and (where possible) pre-populates inputs via URL params or a `useState` ref handoff.

5. **Audit rows:** `module="assistant"`, action `module.assistant.message`. The gateway's own `model.call` audit row fires alongside (already does). C_paused blocks automatically via gateway — no special handling needed in the assistant pipeline.

6. **Persistent conversation.** New table `assistant_messages`, one row per message (user + assistant alternating). Reload-stable. No conversation summarisation in v0.1 — let it grow; truncate prompt input by token budget.

7. **Prompt context budget:** matter facts (always) + chronology summary (always) + 1-3 selected or recent document body snippets (token-bounded to ~3000 tokens) + installed/enabled modules list (always). Hard cap on total context, configurable, default ~12k tokens.

8. **No new dependencies.** Use existing gateway, existing audit helper, existing Pydantic, existing migration runner.

---

## 2. Backend scope

### Migration

`backend/alembic/versions/0007_assistant.py` — new table `assistant_messages`:

```python
- id: UUID PK
- matter_id: UUID FK → matters.id, NOT NULL, INDEX
- actor_id: UUID FK → users.id, NOT NULL
- role: TEXT — "user" | "assistant", NOT NULL
- content: TEXT, NOT NULL
- suggested_actions: JSONB — list of {type, label, params} dicts, default []
- model_used: TEXT, NULL on user rows
- prompt_hash: TEXT, NULL on user rows
- response_hash: TEXT, NULL on user rows
- token_count: INT, NULL on user rows
- created_at: TIMESTAMPTZ, default now()

INDEX (matter_id, created_at)
```

### Pydantic schemas — `backend/app/modules/assistant/schemas.py`

```python
class AssistantMessage(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    suggested_actions: list[SuggestedAction]
    created_at: datetime

class SuggestedAction(BaseModel):
    type: Literal["run_pre_motion", "draft_letter", "review_contract",
                  "view_document", "view_audit", "view_chronology",
                  "anonymise_document"]
    label: str               # human-readable button text
    params: dict[str, str] = {}  # tab-key, document_id, letter_type, etc.

class AssistantPostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    selected_document_ids: list[UUID] = []   # optional doc context selection
```

### Router — `backend/app/modules/assistant/router.py`

Two endpoints under `/api/matters/{slug}/assistant`:

- `GET /messages` — returns ordered conversation for this matter (caller is `current_user`; matter ownership via `created_by_id == user.id`).
- `POST /messages` — appends a user message, runs the pipeline, persists the assistant reply with `suggested_actions`, returns both messages.

Errors:
- `404` matter not found / not owned by caller.
- `409` `PrivilegePaused` from gateway (C_paused matter on cloud-only call).
- `422` `ProviderKeyMissing` — mirror existing modules' provider-key shape.

### Pipeline — `backend/app/modules/assistant/pipeline.py`

Single async function `run_assistant_turn(session, matter, actor_id, request)`:

1. **Load conversation history** for the matter (most recent N messages, token-bounded).
2. **Assemble context block:**
   - Matter facts: title, matter_type, counterparty, privilege posture, created_at.
   - Chronology summary: top-K events with dates and one-liner descriptions.
   - Selected document snippets: bodies of `request.selected_document_ids`, OR most recently touched 1-3 documents if none selected. Token-budgeted via `truncate_to_tokens` helper.
   - Installed/enabled modules: from the same source as `GET /api/modules/me` filtered by `enabled=True`. List of `(plugin, skill, capability, description)` rows.
3. **System prompt** (hard-coded — drafted below; agent finalises):
   ```
   You are a UK-legal-domain assistant inside the Legalise workspace.
   You are scoped to one matter at a time. You can answer questions
   about the matter's documents, chronology, and history. When the
   user's intent is one of the four structured workflows below, return
   a suggested_action chip that routes them into the right module —
   never try to execute the workflow yourself in prose.

   Modules available to suggest:
   - run_pre_motion: adversarial premortem of a pleading
   - draft_letter: matter-shaped letter drafting (LBA etc)
   - review_contract: clause/redline analysis of an uploaded contract
   - anonymise_document: PII detection + redaction on a document

   Cite document content with [doc:<title>] inline markers. Cite
   chronology events with [chron:<event_id>]. Stay terse, factual,
   solicitor-cold-readable. No marketing tone, no AI tics.
   ```
4. **Call gateway** with assembled prompt + history. Gateway audits the model call automatically.
5. **Parse the model response** via `parse_model_json` from `app/core/structured_output.py` against a Pydantic envelope `{content: str, suggested_actions: [{type, label, params}]}`. Add `AssistantResponseEnvelope` to `schemas.py`.
6. **Persist both messages** (user + assistant) in one transaction.
7. **Audit row:** `audit.log(session, "module.assistant.message", module="assistant", matter_id=..., actor_id=..., resource_type="assistant_message", resource_id=assistant_message_id, payload={"suggested_action_count": ..., "history_message_count": ..., "context_token_budget": ..., "selected_document_count": ...})`. No raw content in audit payload (privacy posture matches other modules — hashes in gateway audit row, semantic in module audit row).
8. **Return** both messages.

### Mount

`backend/app/main.py`:
```python
app.include_router(assistant_router, prefix="/api/matters", tags=["assistant"])
```

### Tests

Add to `backend/tests/test_smoke_evals.py` or new `test_assistant.py`:

1. `test_assistant_message_persists_and_audits` — happy-path POST, gateway mocked, assert both messages persist, assert audit row with `module="assistant"`.
2. `test_assistant_returns_suggested_actions` — gateway returns a canned envelope with one `run_pre_motion` chip; assert it round-trips into the response.
3. `test_assistant_c_paused_returns_409` — matter posture=C_paused, gateway raises `PrivilegePaused`, endpoint returns 409.
4. `test_assistant_prompt_includes_chronology_and_modules` — capture the prompt sent to gateway, assert it contains matter title + at least one chronology event + at least one module name.
5. `test_assistant_only_owner_can_read` — second user gets 404.

Aim for 5 new tests. Brings count from 60 → 65.

---

## 3. Frontend scope

### New types in `lib/api.ts`

```ts
export interface SuggestedAction {
  type: "run_pre_motion" | "draft_letter" | "review_contract"
      | "view_document" | "view_audit" | "view_chronology"
      | "anonymise_document";
  label: string;
  params: Record<string, string>;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: SuggestedAction[];
  created_at: string;
}

export const listAssistantMessages = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`)
    .then((r) => jsonOrThrow<AssistantMessage[]>(r));

export const postAssistantMessage = (slug: string, body: { content: string; selected_document_ids?: string[] }) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<{ user: AssistantMessage; assistant: AssistantMessage }>(r));
```

### New tab — `frontend/src/matter/tabs/AssistantTab.tsx`

- Two-column layout (or single-column with sticky context panel — agent's call):
  - **Left/main:** conversation thread. User messages right-aligned, assistant messages left. Citations `[doc:Title]` / `[chron:event-id]` rendered as inline chips that link to the relevant tab/scroll-target.
  - **Right (or bottom on narrow):** context strip — matter title, posture, top 3 chronology events, top 3 most recent documents (selectable as context for the next message).
- **Input** at bottom: textarea + Send button. Send disables while pending.
- **Suggested action chips** below each assistant message — clicking dispatches:
  ```ts
  const dispatch = (a: SuggestedAction) => {
    if (a.type === "run_pre_motion") setTabAndHash("premotion");
    else if (a.type === "draft_letter") {
      setTabAndHash("letters");
      // optionally pre-select letter_type via params
    }
    // ... etc
  };
  ```
- **Auto-scroll** to newest message.
- **Optimistic UI:** show user message immediately, "Assistant is thinking..." placeholder, replace with real assistant message on response.

### Tab key wiring — `frontend/src/matter/tabs/types.ts`

Add `"assistant"` to `TabKey` union. Add `{ key: "assistant", label: "Assistant" }` as the FIRST entry in `TABS` array. Update `isTabKey` guard.

### Default landing — `frontend/src/matter/MatterDetail.tsx`

Change `initialTab` default from `"overview"` to `"assistant"`. The "open matter" experience now opens to chat.

### Demo snapshot — `frontend/src/demo/snapshot.ts`

Add a canned `assistantMessages: AssistantMessage[]` field: 3-4 turn conversation that:
- User: "summarise the NDA"
- Assistant: cites `[doc:Mutual NDA — Khan & Acme]`, gives a terse summary, ends with one chip: `{type: "review_contract", label: "Review this NDA for issues"}`.
- User: "what was the dismissal date?"
- Assistant: cites `[chron:event-3]`, gives the date.
- (Optionally) one more turn where assistant emits a `run_pre_motion` chip.

This is the demo's headline surface. Make it cold-readable.

### DemoMatter — `frontend/src/demo/DemoMatter.tsx`

Render `AssistantTab` with the canned conversation. Action-chip clicks navigate to the demo's already-populated tabs (no backend call). The textarea is non-functional in demo — disabled with placeholder `Sign up to chat with the assistant on your own matter`.

### Landing — `frontend/src/landing/Landing.tsx`

No required changes, but consider tightening the "See it in action" CTA copy to reflect that the demo now opens to the assistant. Optional.

---

## 4. Acceptance bar

1. `cd backend && python3.12 -m pytest -x` — 65/65 (was 60; +5 assistant tests).
2. `cd backend && python3.12 -m compileall app` clean.
3. `cd frontend && npm run build` — `tsc -b` clean, Vite builds.
4. Open `localhost:3000`, sign up, open Khan v Acme — **lands on the Assistant tab**. Send a message. Get a real reply. Suggested-action chip click navigates to the right tab.
5. Stop the backend, open `localhost:3000/#/demo` — assistant tab renders the canned conversation. Action chips navigate inside the demo's snapshot. Textarea disabled with sign-up placeholder.
6. Posture=C_paused matter: send a message → frontend shows the 409 inline as an error message, never the raw exception.
7. `grep -rn "claude-for-uk-legal\|source_repo\|skills_fired" frontend/src/matter/tabs/AssistantTab.tsx` — empty. The assistant surface stays workspace-positioned, not architecture-positioned. Citations show document titles + chronology event descriptions, never plugin/skill identifiers.

---

## 5. Out of scope (v0.2 / later)

- SSE streaming of the assistant reply (mirror Contract Review pattern).
- Conversation summarisation when history exceeds token budget.
- Multi-turn context across matters (current scope: one matter, one thread).
- Tool-calling-style structured output (provider-native) — current pipeline uses `parse_model_json` per existing doctrine (`PHASE_INFRA_DELTA` §4 decision 7).
- Action-chip params that pre-populate module forms (v0.1 just navigates; v0.2 can pre-fill).
- Right-side context panel: include / exclude document checkboxes per message. v0.1 picks recent docs; v0.2 lets user multi-select per turn.

---

## 6. Hard guards (preserved)

- No AGPL contamination. Apache-2.0 only.
- No agent-filed external comms.
- No "capability-gated" / "capability-enforced" language in launch copy.
- Gateway/parser boundary: `parse_model_json` stays in `core/structured_output.py`, not `model_gateway.py`.
- `module="assistant"` joins the canonical module set (alongside `letters`, `pre_motion`, etc.). The audit-row eval in `test_smoke_evals.py` should be extended to include it.

---

## 7. Agent brief (paste this to spawn the build)

> You are building the matter-scoped Assistant for Legalise. Read `HANDOVER_ASSISTANT.md` at HEAD `3591833`. Implement all of §2 (backend) and §3 (frontend) in one commit. Use the locked decisions in §1 verbatim — do not re-debate them. Acceptance bar in §4; hard guards in §6. If you find a tab component or migration that requires a decision §1 doesn't cover, STOP and report. Tests pass at 65/65. Build green. Same gateway, same audit, same posture, same matter context — composition over the existing substrate, not a parallel system.

---

## 8. After this lands

- `#12 launch posture` (Phase E W4 + W5) becomes the final unit.
- The README + landing copy rewrite Andy does in his own voice (workspace-tour positioning, not skills-substrate positioning).
- Demo route now opens to chat — re-screenshot for launch artifacts.
- Reviewer pass before launch posture begins.
