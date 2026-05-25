"""Phase 4 — dependency resolver tests."""

from __future__ import annotations

import uuid

import pytest

from app.core.dependency_resolver import (
    MissingDependency,
    ResolutionResult,
    resolve_dependencies,
)


def _manifest(requires=None, **overrides) -> dict:
    m = {
        "schema_version": "2.0.0",
        "id": "test.parent",
        "name": "Parent",
        "version": "1.0.0",
        "publisher": "tests",
        "visibility": "example",
        "runtime": "native",
        "entrypoint": {"python_module": "test.fixture", "entry": "M"},
        "capabilities": [],
        "requires": requires or [],
    }
    m.update(overrides)
    return m


@pytest.mark.asyncio
async def test_no_requires_is_satisfied(db_session) -> None:
    result = await resolve_dependencies(_manifest(), session=db_session)
    assert result.is_satisfied is True
    assert result.missing == []
    assert result.satisfied == []


@pytest.mark.asyncio
async def test_missing_dependency_not_found(db_session) -> None:
    m = _manifest(
        requires=[
            {"module_id": "nonexistent.module", "version": ">=1.0.0"}
        ]
    )
    result = await resolve_dependencies(m, session=db_session)
    assert result.is_satisfied is False
    assert len(result.missing) == 1
    miss = result.missing[0]
    assert miss.module_id == "nonexistent.module"
    assert miss.required_version_spec == ">=1.0.0"
    assert miss.available_versions == []
    assert miss.reason == "not_found"


@pytest.mark.asyncio
async def test_dependency_satisfied_via_installed_module(db_session) -> None:
    """Insert a fake InstalledModule row, then resolve a manifest
    that requires it."""
    from app.models import InstalledModule

    row = InstalledModule(
        id=uuid.uuid4(),
        module_id="legalise.dep",
        version="1.2.0",
        publisher="legalise",
        visibility="first_party",
        signature_status="verified",
        install_path="<test>",
        manifest_snapshot={"id": "legalise.dep", "version": "1.2.0"},
        permissions_snapshot={"capabilities": []},
    )
    db_session.add(row)
    await db_session.flush()

    m = _manifest(
        requires=[{"module_id": "legalise.dep", "version": ">=1.0.0,<2.0.0"}]
    )
    result = await resolve_dependencies(m, session=db_session)
    assert result.is_satisfied is True
    assert result.missing == []
    assert ("legalise.dep", "1.2.0") in result.satisfied


@pytest.mark.asyncio
async def test_version_unsatisfied_when_no_matching(db_session) -> None:
    from app.models import InstalledModule

    row = InstalledModule(
        id=uuid.uuid4(),
        module_id="legalise.dep2",
        version="0.5.0",
        publisher="legalise",
        visibility="first_party",
        signature_status="verified",
        install_path="<test>",
        manifest_snapshot={"id": "legalise.dep2", "version": "0.5.0"},
        permissions_snapshot={"capabilities": []},
    )
    db_session.add(row)
    await db_session.flush()

    m = _manifest(
        requires=[{"module_id": "legalise.dep2", "version": ">=1.0.0"}]
    )
    result = await resolve_dependencies(m, session=db_session)
    assert result.is_satisfied is False
    miss = result.missing[0]
    assert miss.reason == "version_unsatisfied"
    assert "0.5.0" in miss.available_versions


@pytest.mark.asyncio
async def test_unconstrained_version_accepts_any(db_session) -> None:
    from app.models import InstalledModule

    row = InstalledModule(
        id=uuid.uuid4(),
        module_id="legalise.dep3",
        version="3.14.0",
        publisher="legalise",
        visibility="first_party",
        signature_status="verified",
        install_path="<test>",
        manifest_snapshot={"id": "legalise.dep3", "version": "3.14.0"},
        permissions_snapshot={"capabilities": []},
    )
    db_session.add(row)
    await db_session.flush()

    m = _manifest(requires=[{"module_id": "legalise.dep3"}])
    result = await resolve_dependencies(m, session=db_session)
    assert result.is_satisfied is True


@pytest.mark.asyncio
async def test_multiple_installed_versions_picks_highest_match(
    db_session,
) -> None:
    from app.models import InstalledModule

    for version in ["1.0.0", "1.5.0", "2.0.0"]:
        db_session.add(
            InstalledModule(
                id=uuid.uuid4(),
                module_id="legalise.multi",
                version=version,
                publisher="legalise",
                visibility="first_party",
                signature_status="verified",
                install_path="<test>",
                manifest_snapshot={"id": "legalise.multi", "version": version},
                permissions_snapshot={"capabilities": []},
            )
        )
    await db_session.flush()

    m = _manifest(
        requires=[{"module_id": "legalise.multi", "version": ">=1.0.0,<2.0.0"}]
    )
    result = await resolve_dependencies(m, session=db_session)
    assert result.is_satisfied is True
    # Highest matching version is 1.5.0 (2.0.0 excluded by upper bound).
    assert ("legalise.multi", "1.5.0") in result.satisfied


@pytest.mark.asyncio
async def test_resolution_result_to_dict_serialisable(db_session) -> None:
    import json

    m = _manifest(
        requires=[{"module_id": "missing.dep", "version": ">=1.0.0"}]
    )
    result = await resolve_dependencies(m, session=db_session)
    json.dumps(result.to_dict())


@pytest.mark.asyncio
async def test_invalid_version_spec_in_manifest_reports_unsatisfied(
    db_session,
) -> None:
    from app.models import InstalledModule

    db_session.add(
        InstalledModule(
            id=uuid.uuid4(),
            module_id="legalise.bad",
            version="1.0.0",
            publisher="legalise",
            visibility="first_party",
            signature_status="verified",
            install_path="<test>",
            manifest_snapshot={},
            permissions_snapshot={"capabilities": []},
        )
    )
    await db_session.flush()

    # Spec is gibberish — _matches_spec returns False.
    m = _manifest(
        requires=[{"module_id": "legalise.bad", "version": "not-a-spec"}]
    )
    result = await resolve_dependencies(m, session=db_session)
    assert result.is_satisfied is False
