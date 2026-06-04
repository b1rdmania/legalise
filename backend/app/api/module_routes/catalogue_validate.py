from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.post("/validate", response_model=ValidateManifestResponse)
async def validate_manifest_endpoint(
    body: ValidateManifestRequest,
    user: User = Depends(current_user),
) -> ValidateManifestResponse:
    """Read-only manifest validation for the Create Module on-ramp.

    Runs the SAME validator the install path uses, so "valid here" ==
    "installable". Deliberately does nothing else: no DB write, no
    install ceremony, no trust/signing, no audit row. Authed because
    this is an operator surface inside the app, not a public playground.
    """
    is_valid, errors = validate_manifest_v2(body.manifest)
    return ValidateManifestResponse(
        valid=is_valid,
        errors=[ManifestValidationError(**e) for e in errors],
    )
