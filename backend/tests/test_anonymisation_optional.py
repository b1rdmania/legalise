"""The anonymisation stack (Presidio + spaCy) is an optional extra.

`pyproject.toml` ships it under `[project.optional-dependencies]
anonymisation`; the base install boots without it. These tests simulate
the missing-extra environment by patching the import-guard flag in
`presidio_engine` (the test venv has the extra installed, so the happy
path is exercised by the rest of the suite) and assert the degrade
contract:

- `analyse()` raises a clean RuntimeError naming the extra, at call
  time, not import time;
- the POST /api/documents/{id}/anonymise route translates that into a
  503 with install guidance, for both `presidio` and the default `auto`
  engine;
- `legalise doctor` reports the missing extra as a note (slim installs
  are valid), never a fail.
"""

from __future__ import annotations

import io

import pytest

from app.modules.anonymisation import presidio_engine
from app.tools.doctor import check_anonymisation_engine

EMAIL = "anon-optional@example.com"
PASSWORD = "anon-optional-password-1"


@pytest.fixture
def _extra_missing(monkeypatch):
    """Simulate the anonymisation extra not being installed."""
    monkeypatch.setattr(presidio_engine, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(
        presidio_engine,
        "_IMPORT_ERROR",
        ModuleNotFoundError("No module named 'presidio_analyzer'"),
    )
    # Drop any engine singleton built by earlier tests so the guard fires.
    monkeypatch.setattr(presidio_engine, "_engine", None)


def test_module_imports_without_extra_and_reports_unavailable(_extra_missing):
    """The guard is at module load — `is_available()` is a cheap probe."""
    assert presidio_engine.is_available() is False


def test_analyse_raises_clean_runtime_error_naming_the_extra(_extra_missing):
    with pytest.raises(RuntimeError) as excinfo:
        presidio_engine.analyse("Mr Khan of 1 High Street, SW1A 1AA")
    message = str(excinfo.value)
    assert "anonymisation extra not installed" in message
    assert "[anonymisation]" in message  # install guidance names the extra


def test_analyse_empty_text_short_circuits_even_without_extra(_extra_missing):
    """Empty input never touches the engine, installed or not."""
    assert presidio_engine.analyse("") == []


def test_doctor_notes_missing_extra_without_failing(_extra_missing):
    result = check_anonymisation_engine()
    assert result.status == "note"
    assert "anonymisation extra not installed" in result.detail


def test_doctor_reports_ok_when_extra_installed(monkeypatch):
    monkeypatch.setattr(presidio_engine, "_PRESIDIO_AVAILABLE", True)
    result = check_anonymisation_engine()
    assert result.status == "ok"


async def _signup_and_upload_text(client) -> str:
    """Returns a document id with an extracted text body."""
    reg = await client.post(
        "/auth/register", json={"email": EMAIL, "password": PASSWORD}
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": EMAIL, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text

    create = await client.post(
        "/api/matters", json={"title": "Anonymisation Optional Matter"}
    )
    assert create.status_code == 201, create.text
    slug = create.json()["slug"]

    text = "Letter before claim. Mr Aamir Khan, NI number QQ123456C, SW1A 1AA."
    resp = await client.post(
        f"/api/matters/{slug}/documents",
        files={"file": ("letter.txt", io.BytesIO(text.encode("utf-8")), "text/plain")},
        data={"tag": "draft"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("engine_choice", ["presidio", "auto"])
async def test_post_anonymise_returns_503_when_extra_missing(
    client, _extra_missing, engine_choice
) -> None:
    """The endpoint degrades with a clear 503, not a 500 crash."""
    doc_id = await _signup_and_upload_text(client)

    resp = await client.post(
        f"/api/documents/{doc_id}/anonymise", json={"engine": engine_choice}
    )
    assert resp.status_code == 503, resp.text
    detail = resp.json()["detail"]
    assert "anonymisation engine unavailable" in detail
    assert "anonymisation extra not installed" in detail
