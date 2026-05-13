"""Public HTTP API routers.

Routers are wired into the FastAPI app in `app.main`.
"""

from app.api.matters import router as matters_router

__all__ = ["matters_router"]
