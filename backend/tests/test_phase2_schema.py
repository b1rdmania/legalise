"""Phase 2 — v2 manifest JSON Schema validation tests.

Covers the JSON Schema itself (`schemas/module.v2.json`) loaded via
the registry validator. The canonical example from
``MANIFEST_V2_SCHEMA.md`` must validate; structural violations must
be rejected.

Pure-unit tests — no DB.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from app.core.registry.validator import (
    InvalidManifestError,
    assert_manifest_v2,
    validate_manifest_v2,
)


def _base_manifest() -> dict:
    """A minimal valid v2 manifest. Tests start from this and mutate
    specific fields to exercise validation."""
    return {
        "schema_version": "2.0.0",
        "id": "test.module",
        "name": "Test Module",
        "version": "1.0.0",
        "publisher": "tests",
        "visibility": "example",
        "runtime": "native",
        "entrypoint": {
            "python_module": "tests.fixture",
            "entry": "Module",
        },
        "capabilities": [
            {
                "id": "default",
                "kind": "skill",
                "scope": "matter",
                "reads": ["matter.read"],
                "writes": ["citation.write"],
                "model_access": "none",
                "external_network": False,
                "data_movement": {
                    "sends_document_body": False,
                    "sends_document_binary": False,
                    "sends_matter_metadata": True,
                    "external_destinations": [],
                    "local_only": True,
                },
                "gates": ["privilege_posture"],
                "ui": {"slot": "matter.workflows", "label": "Test"},
                "streaming_mode": "sync",
                "advice_tier_max": "draft_advice",
                "audit_events": ["test.invoked"],
            }
        ],
    }


def test_base_manifest_is_valid() -> None:
    is_valid, errors = validate_manifest_v2(_base_manifest())
    assert is_valid, f"base manifest must validate; got errors: {errors}"


def test_backend_packaged_schema_matches_repo_root_schema() -> None:
    """Fly builds from backend/, so the v2 schema must also be packaged
    there. Pin equality so the deploy fallback cannot drift from the
    repo-root canonical schema."""
    repo_root = Path(__file__).resolve().parents[2]
    root_schema = repo_root / "schemas" / "module.v2.json"
    backend_schema = repo_root / "backend" / "schemas" / "module.v2.json"

    assert backend_schema.exists()
    assert json.loads(backend_schema.read_text(encoding="utf-8")) == json.loads(
        root_schema.read_text(encoding="utf-8")
    )


def test_missing_capabilities_array_rejected() -> None:
    m = _base_manifest()
    del m["capabilities"]
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid
    assert any("capabilities" in e["path"] or "capabilities" in e["message"] for e in errors)


def test_empty_capabilities_array_rejected() -> None:
    m = _base_manifest()
    m["capabilities"] = []
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid


def test_unknown_kind_rejected() -> None:
    m = _base_manifest()
    m["capabilities"][0]["kind"] = "wizard"
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid


def test_unknown_scope_rejected() -> None:
    m = _base_manifest()
    m["capabilities"][0]["scope"] = "universe"
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid


def test_invalid_schema_version_rejected() -> None:
    m = _base_manifest()
    m["schema_version"] = "1.0.0"  # must be 2.x
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid


def test_invalid_semver_rejected() -> None:
    m = _base_manifest()
    m["version"] = "not-a-semver"
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid


def test_unknown_capability_string_rejected() -> None:
    m = _base_manifest()
    m["capabilities"][0]["reads"] = ["not.a.valid.cap"]  # not legacy, scope must be matter/workspace/global
    m["capabilities"][0]["reads"] = ["foo.bar.baz"]
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid
    assert any("reads" in e["path"] for e in errors)


def test_v2_grammar_capability_string_accepted() -> None:
    m = _base_manifest()
    m["capabilities"][0]["reads"] = [
        "matter.documents.body.read",
        "matter.context.legalise_memory.facts.read",
    ]
    m["capabilities"][0]["writes"] = ["matter.notes.write"]
    is_valid, errors = validate_manifest_v2(m)
    assert is_valid, errors


def test_unknown_ui_slot_rejected() -> None:
    m = _base_manifest()
    m["capabilities"][0]["ui"]["slot"] = "matter.invented_slot"
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid
    assert any("ui/slot" in e["path"] for e in errors)


def test_ui_default_request_accepted() -> None:
    m = _base_manifest()
    m["capabilities"][0]["ui"]["default_request"] = "Summarise {filename}."
    is_valid, errors = validate_manifest_v2(m)
    assert is_valid, errors


def test_gate_with_gates_rejected() -> None:
    """A capability kind=gate cannot itself declare gates."""
    m = _base_manifest()
    m["capabilities"][0]["kind"] = "gate"
    m["capabilities"][0]["gates"] = ["another_gate"]
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid
    assert any("gates" in e["path"] for e in errors)


def test_external_network_without_destinations_rejected() -> None:
    m = _base_manifest()
    m["capabilities"][0]["external_network"] = True
    # destinations stays empty
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid
    assert any("external_destinations" in e["path"] for e in errors)


def test_model_access_required_without_provider_rejected() -> None:
    """model_access=required requires a provider capability OR a
    provider dependency in requires."""
    m = _base_manifest()
    m["capabilities"][0]["model_access"] = "required"
    is_valid, errors = validate_manifest_v2(m)
    assert not is_valid
    assert any("model_access" in e["path"] for e in errors)


def test_model_access_required_with_provider_capability_accepted() -> None:
    m = _base_manifest()
    m["capabilities"][0]["model_access"] = "required"
    m["capabilities"].append(
        {
            "id": "anthropic",
            "kind": "provider",
            "scope": "workspace",
            "reads": [],
            "writes": [],
            "model_access": "none",
            "external_network": True,
            "data_movement": {
                "sends_document_body": True,
                "external_destinations": ["api.anthropic.com"],
            },
            "gates": [],
            "ui": {"slot": "assistant.tools"},
            "streaming_mode": "streaming",
            "advice_tier_max": "factual_extraction",
            "audit_events": ["model.call"],
        }
    )
    is_valid, errors = validate_manifest_v2(m)
    assert is_valid, errors


def test_mcp_stdio_entrypoint_accepted() -> None:
    m = _base_manifest()
    m["runtime"] = "mcp"
    m["entrypoint"] = {
        "transport": "stdio",
        "command": "python",
        "args": ["server.py"],
    }
    is_valid, errors = validate_manifest_v2(m)
    assert is_valid, errors


def test_mcp_sse_entrypoint_accepted() -> None:
    m = _base_manifest()
    m["runtime"] = "mcp"
    m["entrypoint"] = {
        "transport": "sse",
        "url": "https://example.com/mcp",
    }
    is_valid, errors = validate_manifest_v2(m)
    assert is_valid, errors


def test_assert_manifest_v2_raises_on_invalid() -> None:
    m = _base_manifest()
    m["capabilities"][0]["kind"] = "wizard"
    with pytest.raises(InvalidManifestError) as exc:
        assert_manifest_v2(m)
    assert exc.value.errors
