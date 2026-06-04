from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/public", response_model=PublicModulesResponse)
async def list_modules_public(response: Response) -> PublicModulesResponse:
    """Read-only catalogue for unauth visitors. Uses the same manifest
    resolver as `GET /api/modules` so the listings cannot drift.

    No workspace state is exposed: only declared capabilities, the
    trust posture from the manifest, and the source URL. Cached for
    five minutes; the catalogue mutates on a git push to the upstream
    plugins repo, not on user action.
    """
    discovered, broken = _discover_skills()
    response.headers["Cache-Control"] = "public, max-age=300"
    return PublicModulesResponse(
        source=ModuleSource(repo=settings.plugins_repo, ref=settings.plugins_repo_ref),
        skills=[
            PublicModuleSkill(
                plugin=s.plugin,
                skill=s.skill,
                name=s.name,
                description=s.description,
                declared_capabilities=s.declared_capabilities,
                trust_posture=s.trust_posture,
                source_url=s.source_url,
            )
            for s in discovered
        ],
        broken=broken,
    )


@router.get("", response_model=ModulesResponse)
async def list_modules(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ModulesResponse:
    """Return every installed SKILL.md discovered under PLUGINS_ROOT.

    Each discovered skill is paired with the plugin's `module.json`,
    validated against `schemas/module.json` via `Draft202012Validator`.
    Manifests that fail validation are returned in the `broken` list so
    the UI can flag them - they are not silently dropped.

    Shares `_discover_skills()` with the public endpoint; layers per-user
    grants and the per-user disabled set on top.
    """
    discovered, broken = _discover_skills()
    root = _plugins_root()

    disabled_rows = await session.scalars(
        select(WorkspaceDisabledSkill).where(WorkspaceDisabledSkill.user_id == user.id)
    )
    disabled: set[tuple[str, str]] = {(r.plugin, r.skill) for r in disabled_rows.all()}

    grant_rows = await session.scalars(
        select(WorkspaceSkillCapabilityGrant).where(
            WorkspaceSkillCapabilityGrant.user_id == user.id
        )
    )
    granted_by_skill: dict[tuple[str, str], list[str]] = {}
    for row in grant_rows.all():
        granted_by_skill.setdefault((row.plugin, row.skill), []).append(row.capability)

    skills = [
        ModuleSkill(
            plugin=d.plugin,
            skill=d.skill,
            name=d.name,
            description=d.description,
            source_url=d.source_url,
            argument_hint=d.argument_hint,
            capabilities=d.declared_capabilities,
            declared_capabilities=d.declared_capabilities,
            granted_capabilities=sorted(granted_by_skill.get((d.plugin, d.skill), [])),
            trust_posture=d.trust_posture,
            enabled=(d.plugin, d.skill) not in disabled,
        )
        for d in discovered
    ]

    return ModulesResponse(
        plugins_root=str(root),
        source=ModuleSource(repo=settings.plugins_repo, ref=settings.plugins_repo_ref),
        skills=skills,
        broken=broken,
    )


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
