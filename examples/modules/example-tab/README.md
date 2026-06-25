# example-tab

Minimal example module. Copy this directory to `backend/app/modules/<your_module>` (and the `frontend/` subdir to `frontend/src/modules/<your_module>`) to scaffold a new tab.

## What it does

Reads the current matter, calls the model gateway with a fixed prompt, logs an audit entry, returns the response. The frontend renders a button and the latest response.

## What to change

1. Rename `example_tab` → your module name (snake_case in Python, kebab-case in `module.json`).
2. Edit `module.json` — name, description, nav label, route.
3. Replace the prompt and the response shape in `backend/router.py`.
4. Replace the frontend in `frontend/index.tsx`.

## Files

- `module.json` — manifest validated against `/schemas/module.json`
- `backend/router.py` — single FastAPI router with one POST endpoint
- `backend/service.py` — business logic, kept thin
- `frontend/index.tsx` — TanStack Router page component
- `frontend/components/Hello.tsx` — one component

See `docs/ARCHITECTURE.md` for the current module/runtime shape.
