# Module Development

Legalise is designed to be extended. New tabs (plain-english, time-recording, conflicts check, billing, custom-vertical workflows) live as modules. A module is a self-contained backend + frontend pair that plugs into the matter spine.

This guide is for anyone — internal law firm dev team, contributor, fork maintainer — building a new tab.

## What you can build

A module can:

- Add a new tab in the workspace navigation, scoped to a matter.
- Read matter context (parties, facts, documents, posture).
- Call the model gateway with audit logging built in.
- Invoke `claude-for-uk-legal` plugin skills via the plugin bridge.
- Render output in the matter detail view.
- Persist module-specific data in `Matter.metadata` JSONB or in the materialised matter folder.

A module **cannot** (v0.1):

- Bypass the audit log.
- Ignore the matter's privilege posture.
- Bring its own database tables (v0.2 introduces per-module migrations).
- Define its own auth.
- Access matters it isn't scoped to.

The first three constraints are by design — they're what makes the platform regulator-aware. The fourth and fifth are v0.1 simplicity; both relax later.

## Five steps to ship a module

### 1. Copy the starter

```bash
cp -r examples/modules/example-tab backend/app/modules/my_module
cp -r examples/modules/example-tab/frontend frontend/src/modules/my_module
```

Rename `example-tab` to your module name in both places. Module names are `snake_case` for Python, `kebab-case` for the public manifest.

### 2. Fill in the manifest

Every module has a `module.json` at the root of its backend directory. Validated against `schemas/module.json`.

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

`nav.order` controls position in the workspace nav. Built-in tabs are 10–50; third-party defaults to 60+.

### 3. Wire the backend

`backend/app/modules/my_module/router.py`:

```python
from fastapi import APIRouter, Depends

from app.core.api import audit, model_gateway, plugin_bridge, require_matter

router = APIRouter()


@router.post("/do-thing")
async def do_thing(matter=Depends(require_matter)):
    response = await model_gateway.call(
        matter_id=matter.id,
        prompt="...",
        posture=matter.privilege_posture,
    )
    await audit.log("my-module.action", matter_id=matter.id, metadata={...})
    return {"output": response}
```

`app.core.api` is the **stable public surface for modules** — see §Core API below.

### 4. Wire the frontend

`frontend/src/modules/my_module/index.tsx`:

```tsx
import { useMatter, useAudit } from "@/shared/hooks";

export default function MyModule() {
  const matter = useMatter();
  // render against matter context
  return <div>...</div>;
}
```

The nav entry is registered automatically from `module.json`'s `nav` block in v0.1 via build-time discovery. v0.2 adds runtime registration.

### 5. Register the module

Until auto-discovery lands in v0.2, modules register manually in two places:

`backend/app/main.py`:

```python
from app.modules.my_module.router import router as my_module_router
app.include_router(my_module_router, prefix="/api/modules/my-module", tags=["my-module"])
```

`frontend/src/lib/modules.ts`:

```ts
export const modules = [
  // ...
  { slug: "my-module", manifest: () => import("@/modules/my_module/module.json") },
];
```

That's it. Boot the workspace, open a matter, the tab appears.

## Core API

`app/core/api.py` is the documented stable surface modules import. Use it. Don't reach into `app.core.*` internals — those are unstable between minor versions.

```python
from app.core.api import (
    # Matter context
    require_matter,        # FastAPI dependency that yields the current Matter
    get_matter,            # async helper to fetch a Matter by slug

    # Audit log
    audit,                 # `await audit.log(action, matter_id=..., metadata=...)`

    # AI gateway
    model_gateway,         # `await model_gateway.call(matter_id, prompt, ...)`

    # Plugin bridge
    plugin_bridge,         # `await plugin_bridge.invoke(plugin, skill, matter_id, inputs)`

    # Storage
    storage,               # `await storage.put(path, bytes)`, `await storage.get(path)`
)
```

These don't change shape inside `0.1.x`. Any module written against them today still works in `0.1.5`.

## Frontend conventions

- TanStack Query for server state.
- Local component state for everything else.
- Tailwind + Shadcn primitives. Don't introduce a new UI library.
- Codegen types from the backend OpenAPI spec (`frontend/src/lib/api/`).

## Running and debugging your module

```bash
docker compose -f infra/docker-compose.yml up
# open http://localhost:3000, open a matter, click your tab
```

Audit entries from your module appear in the audit-trail tab of the matter detail page. Every `model_gateway.call` and `plugin_bridge.invoke` is logged automatically.

## What's stable, what isn't

| Surface | Stability |
|---|---|
| `app.core.api.*` (matter, audit, model_gateway, plugin_bridge, storage) | Stable across 0.1.x |
| `schemas/module.json` | Stable, additive only |
| `Matter`, `Document`, `Event`, `AuditEntry` model shapes | Stable, additive only |
| `app.core.*` (internals) | Unstable |
| `frontend/src/shared/*` hooks | Stable across 0.1.x |
| `frontend/src/lib/*` | Stable across 0.1.x |
| Internal module registration paths | Unstable until v0.2 auto-discovery |

## Running modules in production (private fork)

Internal law firm use case: fork the repo, add your modules under `backend/app/modules/firm_specific/` and `frontend/src/modules/firm_specific/`, never push them upstream.

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

Maintain the fork by pulling upstream `master` periodically. Because modules use `app.core.api` rather than internals, upstream changes rarely break them.

## What's coming in v0.2

- **Auto-discovery** — modules drop in, register themselves from `module.json` at boot. No manual `include_router` / `modules.ts` edits.
- **Frontend dynamic loading** — third-party modules can ship as standalone bundles loaded at runtime.
- **Per-module migrations** — modules with their own database tables run their own alembic versions.
- **Theming hooks** — module-aware light/dark / branded theme overrides.
- **MCP-based plugin bridge** — modules call plugins as MCP clients instead of subprocess invocation.

## What's coming in v0.5+

- Module sandboxing and permissions enforcement (multi-tenant story).
- Module marketplace and signed-publisher install flow.
- Module deprecation and versioning policy.

## Help

- Issue tracker on GitHub for bugs, questions, design proposals.
- See `examples/modules/example-tab/` for a runnable minimal module.
- See `ARCHITECTURE.md` for the wider system shape.
