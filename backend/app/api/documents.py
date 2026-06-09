"""Documents API — per-document endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.document_routes import (
    anonymisation,
    assets,
    body_versions,
    comments,
    crud,
    edit_sessions,
    edits,
    original_download,
    working_draft,
    workspace,
)
from app.api.document_routes.common import (
    _html_to_pdf,
    audit_failure,
    get_storage_backend,
)


router = APIRouter()

# Keep literal `/generated/{file_uuid}` registered before document-id routes.
for subrouter in (
    original_download.router,
    crud.router,
    assets.router,
    body_versions.router,
    working_draft.router,
    workspace.router,
    edits.router,
    comments.router,
    edit_sessions.router,
    anonymisation.router,
):
    router.include_router(subrouter)
