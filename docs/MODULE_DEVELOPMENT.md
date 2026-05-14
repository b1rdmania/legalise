# Module Development

> **This is an experimental extension guide for private forks, not a stable SDK
> contract.** v0.1 ships the four module surfaces hardcoded in `App.tsx` (matter
> spine, Pre-Motion, Letters, Chronology) plus a read-only Discovery view at
> `#/modules`. The module *lifecycle* — install/enable toggles, scoped
> permissions, signed manifests, UI contracts, auto-discovery — is v0.2 work.
> See the "What v0.1 does not yet do" section of `README.md`.
>
> If you write a module against the primitives below today, you're doing it on
> top of a surface that **will change** before v0.2 stabilises it. The shape of
> `app.core.api` is the rough direction of travel, not a stability commitment.
> Build for a private fork; expect to rework before any upstream stability
> claim applies.

Legalise is designed to be extended. New surfaces (conflicts check, billing,
time recording, vertical-specific workflows, contract review's eventual v0.2
implementation) plug into the matter spine in the same shape Pre-Motion and
Letters already use.

This guide is for anyone — internal law firm dev team, contributor, fork
maintainer — exploring how a new surface might look against the current
primitives.

## What you can build today

A module-shaped extension can:

- Add a new section in the matter detail view.
- Read matter context (parties, facts, documents, posture).
- Call the model gateway with audit logging built in.
- Invoke `claude-for-uk-legal` skills via the plugin bridge.
- Render output in the matter detail view.
- Persist module-specific data in `Matter.metadata` JSONB or in the
  materialised matter folder.

## What the trust model expects (not enforced in v0.1)

To preserve the Legalise trust model — the thing that makes the workspace
defensible to a UK regulator — a module **should**:

- Route every LLM call through `app.core.api.model_gateway` rather than calling
  Anthropic/OpenAI SDKs directly. The gateway is where audit logging and
  privilege-posture enforcement live.
- Route every plugin skill invocation through `app.core.api.plugin_bridge`
  rather than executing prompts inline. The bridge writes the `plugin.invoked`
  audit row.
- Read matter context from the documented helpers below rather than reaching
  into `app.models.Matter` directly.
- Refuse to operate on matters where `privilege_posture == "C_paused"`. The
  gateway already refuses; modules should fail fast at their own entry point
  too, before audit rows that imply work was attempted accumulate.

**These are conventions, not enforced primitives.** v0.1 has no permission
system, no scoped-access decorator, no UI contract enforcement. A poorly
behaved module can call `anthropic.Anthropic().messages.create(...)` directly
and the audit log will be silent about it. The v0.2 "Module lifecycle
workstream" in `ROADMAP.md` picks this up — install/enable toggles,
per-workspace policy, module permissions, UI contracts, signed manifests.

If you want the trust posture today, you have to honour the conventions
voluntarily. The reward is that everything you build inherits the audit log,
privilege gating, and matter materialisation for free; the cost is that a
malicious or sloppy module isn't blocked from misbehaving.

## Five steps to scaffold an extension

### 1. Copy the starter

```bash
cp -r examples/modules/example-tab backend/app/modules/my_module
cp -r examples/modules/example-tab/frontend frontend/src/modules/my_module
```

Rename `example-tab` to your module name in both places. Module names are
`snake_case` for Python, `kebab-case` for the public manifest.

### 2. Fill in the manifest

Every module has a `module.json` at the root of its backend directory.
Validated against `schemas/module.json`. The manifest is declarative — nothing
in the v0.1 backend reads it at runtime; it's the v0.2 hook point for
auto-discovery and policy.

```json
{
  "name": "my-module",
  "version": "0.1.0",
  "description": "One sentence on what this module does for a matter.",
  "author": "your-handle",
  "license": "Apache-2.0",
  "nav": {
    "label": "My Module",
    "icon": "lucide:wand-2",
    "order": 60
  },
  "routes": {
    "backend_prefix": "/api/modules/my-module",
    "frontend_route": "/matters/$slug/my-module"
  },
  "requires": {
    "plugins": [],
    "env": [],
    "mcp_servers": []
  },
  "permissions": ["matter.read"]
}
```

`nav.order` controls position in the workspace nav. Built-in surfaces are
10–50; third-party defaults to 60+. `permissions` is declarative for v0.1 —
nothing reads it. v0.2 enforces.

### 3. Wire the backend

`backend/app/modules/my_module/router.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit, model_gateway, plugin_bridge
from app.core.auth import current_user
from app.core.db import get_session
from app.models import Matter, User

router = APIRouter()


@router.post("/{slug}/my-module/run")
async def do_thing(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    matter = await session.scalar(select(Matter).where(Matter.slug == slug))
    # ... call gateway, write audit, etc.
```

**Note on `app.core.api`.** Today `app.core.api` re-exports `audit`,
`model_gateway`, and `plugin_bridge` — those are wired and usable.
`require_matter` and `storage` exist as `None` placeholders awaiting the v0.2
lifecycle work; don't import them in new code. Use FastAPI's normal
`Depends(get_session)` + a `select(Matter)` query in the meantime, as the
built-in surfaces do.

### 4. Wire the frontend

The matter-detail page renders sections inline (see `App.tsx::MatterDetail`).
v0.1 doesn't have dynamic module loading; add your section directly to
`App.tsx` in the same shape as Pre-Motion / Letters / Chronology / Contract
Review v0.2 placeholder.

The Oxide design tokens in `docs/DESIGN.md` are the visual contract. Stick to
them.

### 5. Register the module

v0.1 module registration is **manual** in `backend/app/main.py`:

```python
from app.modules.my_module.router import router as my_module_router
app.include_router(my_module_router, prefix="/api/matters", tags=["my-module"])
```

Auto-discovery from `module.json` lands in v0.2.

## Core API today

`app/core/api.py` is the documented surface modules import. Use what's wired;
avoid the placeholders.

```python
from app.core.api import (
    # Wired and usable today:
    audit,                 # `await audit.log(action, matter_id=..., payload=...)`
    model_gateway,         # `await model_gateway.call(matter_id, prompt, ...)`
    plugin_bridge,         # `await plugin_bridge.invoke(plugin, skill, matter_id, inputs)`
    get_matter,            # async helper to fetch a Matter by slug

    # Placeholders awaiting v0.2 lifecycle work — do NOT import yet:
    # require_matter,      # will be the FastAPI dependency for matter-scoped access
    # storage,             # will be the abstract storage handle for module data
)
```

The wired three (`audit`, `model_gateway`, `plugin_bridge`) are what
Pre-Motion, Letters, and the modules endpoint already use. Their shape is
unlikely to change drastically before v0.2, but **this is not a stability
promise** — see the banner at the top.

## Frontend conventions

- Local component state for everything in v0.1 (TanStack Query lands when
  module surfaces get richer than the current shape).
- Tailwind + the Oxide design tokens. Don't introduce a new UI library or
  invent colours / fonts / radii outside `docs/DESIGN.md`.
- Read existing module sections in `frontend/src/App.tsx` (Pre-Motion,
  Letters) before designing yours — copy the shape rather than diverge.

## Running and debugging your module

```bash
docker compose -f infra/docker-compose.yml up
# open http://localhost:3000, open the seeded matter, scroll to your section
```

Audit entries from your module appear in the audit-trail section of the
matter detail page. Every `model_gateway.call` and `plugin_bridge.invoke`
writes a row automatically.

## What's stable, what isn't

| Surface | v0.1 status |
|---|---|
| `app.core.api.audit` / `.model_gateway` / `.plugin_bridge` / `.get_matter` | Wired and usable; shape unlikely to break before v0.2 but no formal stability commitment |
| `app.core.api.require_matter` / `.storage` | Placeholders — `None` — do not import |
| `schemas/module.json` | Declarative only in v0.1; v0.2 reads it for discovery + policy |
| `Matter`, `Document`, `Event`, `AuditEntry` model shapes | Stable, additive only |
| `app.core.*` (internals) | Unstable; reach in at your own risk |
| Internal module registration paths | Manual today; auto-discovery in v0.2 will move things |

## Running modules in production (private fork)

The honest version: **don't run a private-fork module against this v0.1 in
production yet.** Use it for internal exploration, prototypes, and PoCs.
The shape will move in v0.2.

If you do build a private-fork extension now:

```
your-fork/
  backend/app/modules/
    firm_specific/
      conflicts_check/
      billing/
      time_recording/
  frontend/src/modules/
    firm_specific/
      conflicts_check/
      billing/
      time_recording/
```

Pulling upstream `master` periodically is fine. Expect at least one rework
when v0.2 lands the auto-discovery + policy enforcement.

## What lands in v0.2

The full picture is in `ROADMAP.md` under "Module lifecycle workstream
(v0.2)". Short list:

- Install/enable toggles per workspace.
- Per-workspace module policy (allowlists by matter type, jurisdiction tag,
  privilege posture).
- Module permissions (SDK-level scoping — modules declare reads/writes, the
  SDK refuses out-of-scope calls).
- UI contracts (markup, theme, layout enforced at render time).
- Signed manifests + skill provenance attestation.
- Auto-discovery from `module.json`.
- Per-module migrations and theming hooks.

## What lands in v0.5+

- Module sandboxing for multi-tenant deployments.
- Module marketplace / signed-publisher install flow over and above the
  Git-as-marketplace pattern.
- Module deprecation and versioning policy.

## Help

- Issue tracker on GitHub for bugs, questions, design proposals.
- See `examples/modules/example-tab/` for a runnable minimal module shape.
- See `ARCHITECTURE.md` for the wider system shape.
