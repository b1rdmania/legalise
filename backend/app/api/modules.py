"""Module catalogue + install + lifecycle endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.module_routes import (
    catalogue_discovery,
    catalogue_validate,
    install_ceremony,
    installed_listing,
    installed_revoke,
    installed_update,
    skill_body,
)
from app.api.module_routes.catalogue_discovery import list_modules
from app.api.module_routes.common import (
    ModulesResponse,
    _module_json_for,
    _plugins_root,
    _skill_paths,
)


router = APIRouter()
router.add_api_route("", list_modules, methods=["GET"], response_model=ModulesResponse)

# Keep catch-all `/{plugin}/{skill}` last so literal routes win.
for subrouter in (
    catalogue_discovery.router,
    catalogue_validate.router,
    installed_listing.router,
    install_ceremony.router,
    installed_revoke.router,
    installed_update.router,
    skill_body.router,
):
    router.include_router(subrouter)
