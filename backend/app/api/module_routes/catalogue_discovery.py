from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/v2", response_model=V2RegistryResponse)
async def list_v2_modules(
    user: User = Depends(current_user),
) -> V2RegistryResponse:
    """List all discovered modules in their v2 manifest shape.

    Includes both natively-v2 manifests (``legalise.module.json``) and
    v1 manifests auto-derived via the shim. Each entry reports
    ``is_valid`` and any structural validation errors so the frontend
    can surface "broken" modules.
    """
    entries: list[V2ManifestEntry] = []
    for entry in discover_modules():
        try:
            manifest = _entry_to_v2_manifest(entry)
        except ValueError:
            entries.append(
                V2ManifestEntry(
                    module_id=entry.module_id,
                    source_kind=entry.source_kind,
                    manifest={},
                    is_valid=False,
                    validation_errors=[
                        {
                            "path": "/",
                            "message": "shim could not derive v2 manifest",
                        }
                    ],
                )
            )
            continue
        is_valid, errors = validate_manifest_v2(manifest)
        entries.append(
            V2ManifestEntry(
                module_id=entry.module_id,
                source_kind=entry.source_kind,
                manifest=manifest,
                is_valid=is_valid,
                validation_errors=errors,
            )
        )
    return V2RegistryResponse(
        modules=entries,
        ui_slots=UISlotRegistry.all_slots(),
    )


@router.get("/v2/capabilities", response_model=list[V2CapabilityEntry])
async def list_v2_capabilities(
    user: User = Depends(current_user),
) -> list[V2CapabilityEntry]:
    """Flat catalogue of capabilities declared across all discovered
    modules.

    Feeds the grant-lifecycle snapshot store and the frontend grant
    UI / module catalogue.
    """
    catalogue = list_capabilities()
    return [V2CapabilityEntry(**cap) for cap in catalogue]


@router.get("/v2/{module_id}", response_model=V2ManifestEntry)
async def get_v2_module(
    module_id: str,
    user: User = Depends(current_user),
) -> V2ManifestEntry:
    """Detail view for one module by id, in v2 manifest shape."""
    try:
        entry = load_manifest(module_id)
    except ManifestNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "module_not_found", "message": str(exc)},
        )
    try:
        manifest = _entry_to_v2_manifest(entry)
    except ValueError:
        return V2ManifestEntry(
            module_id=entry.module_id,
            source_kind=entry.source_kind,
            manifest={},
            is_valid=False,
            validation_errors=[
                {
                    "path": "/",
                    "message": "shim could not derive v2 manifest",
                }
            ],
        )
    is_valid, errors = validate_manifest_v2(manifest)
    return V2ManifestEntry(
        module_id=entry.module_id,
        source_kind=entry.source_kind,
        manifest=manifest,
        is_valid=is_valid,
        validation_errors=errors,
    )
