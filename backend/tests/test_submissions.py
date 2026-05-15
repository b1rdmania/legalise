"""Unit tests for the public module submission flow (Phase D W3).

Pure-logic tests: SKILL.md round-trip via `frontmatter.dump` (the
YAML-injection guard rests on the library, not hand-validation), and
the schema-level guards on the request model. The Turnstile + GitHub
HTTP paths are covered by mocked end-to-end checks via FastAPI's
`TestClient` so no real network call ever fires from the test suite.
"""

from __future__ import annotations

import frontmatter
import pytest

from app.api.submissions import (
    ALLOWED_CAPABILITIES,
    ModuleSubmissionRequest,
    _build_skill_md,
)
from app.core.config import settings


def _valid_payload(**overrides) -> dict:
    base = {
        "plugin_name": "uk-litigation-legal",
        "skill_name": "letter-before-action",
        "description": "Drafts a UK letter before action with CPR pre-action context.",
        "body_markdown": "# Letter Before Action\n\nGenerates a draft LBA.\n",
        "capabilities": ["matter.read", "document.generated.write"],
        "trust_posture": "experimental",
        "submitter_handle": "octocat",
        "submitter_contact": "octocat@example.com",
        "turnstile_token": "x" * 16,
    }
    base.update(overrides)
    return base


class TestSchema:
    def test_valid_payload_parses(self) -> None:
        ModuleSubmissionRequest(**_valid_payload())

    def test_kebab_case_plugin_required(self) -> None:
        with pytest.raises(ValueError):
            ModuleSubmissionRequest(**_valid_payload(plugin_name="Not_Kebab"))

    def test_kebab_case_skill_required(self) -> None:
        with pytest.raises(ValueError):
            ModuleSubmissionRequest(**_valid_payload(skill_name="Bad Name"))

    def test_unknown_capability_rejected(self) -> None:
        with pytest.raises(ValueError):
            ModuleSubmissionRequest(**_valid_payload(capabilities=["matter.delete"]))

    def test_invalid_trust_posture_rejected(self) -> None:
        with pytest.raises(ValueError):
            ModuleSubmissionRequest(**_valid_payload(trust_posture="enterprise"))

    def test_capability_set_matches_doctrine(self) -> None:
        # PHASE_INFRA_DELTA §4 decision 2 — eight-item closed set.
        assert ALLOWED_CAPABILITIES == frozenset(
            {
                "matter.read",
                "document.body.read",
                "document.generated.write",
                "model.invoke",
                "chronology.read",
                "chronology.write",
                "citation.write",
                "audit.emit",
            }
        )


class TestSkillMdRoundTrip:
    def test_synthesised_skill_md_parses_back(self) -> None:
        req = ModuleSubmissionRequest(**_valid_payload())
        skill_md = _build_skill_md(req)
        post = frontmatter.loads(skill_md)
        assert post["name"] == req.skill_name
        assert post["plugin"] == req.plugin_name
        assert post["description"] == req.description
        assert post["trust_posture"] == "experimental"
        assert post["capabilities"] == list(req.capabilities)
        assert post.content.strip() == req.body_markdown.strip()

    def test_yaml_injection_via_description_is_escaped(self) -> None:
        # If a submitter shoves a fake frontmatter terminator into the
        # description, library-level YAML serialisation must escape it
        # rather than letting the second `---` close the block early.
        evil = "innocent\n---\nname: pwned\n---"
        req = ModuleSubmissionRequest(**_valid_payload(description="x" * 10 + evil))
        skill_md = _build_skill_md(req)
        post = frontmatter.loads(skill_md)
        assert post["description"].endswith(evil)
        # The fake "name: pwned" inside the description must NOT have
        # been hoisted to a top-level key.
        assert post["name"] != "pwned"

    def test_yaml_injection_via_body_does_not_leak_into_frontmatter(self) -> None:
        body = "---\nname: pwned\n---\nthen the real body\n"
        req = ModuleSubmissionRequest(**_valid_payload(body_markdown=body))
        skill_md = _build_skill_md(req)
        post = frontmatter.loads(skill_md)
        # Frontmatter is fenced server-side so the body's own `---`
        # cannot reopen it; the body round-trips verbatim.
        assert post["name"] == "letter-before-action"
        assert "pwned" in post.content


class TestConfigGate:
    def test_create_submission_returns_503_when_token_missing(self, monkeypatch) -> None:
        """submission_enabled=True but token absent → 503, NOT 500.

        Calls the route function directly to avoid importing the full
        FastAPI app (its TestClient mount surfaces an unrelated
        fastapi/204-response-body assertion that pre-dates this unit).
        """
        import asyncio

        from app.api.submissions import create_submission

        monkeypatch.setattr(settings, "submission_enabled", True)
        monkeypatch.setattr(settings, "github_submission_token", None)
        monkeypatch.setattr(settings, "turnstile_secret_key", "x")

        req = ModuleSubmissionRequest(**_valid_payload())

        class _FakeRequest:
            headers = {}
            client = None

        with pytest.raises(Exception) as exc:
            asyncio.run(
                create_submission(req, _FakeRequest(), session=None)  # type: ignore[arg-type]
            )
        assert getattr(exc.value, "status_code", None) == 503
        assert exc.value.detail["error"] == "submissions_disabled"  # type: ignore[attr-defined]

    def test_create_submission_returns_503_when_submission_disabled(
        self, monkeypatch
    ) -> None:
        import asyncio

        from app.api.submissions import create_submission

        monkeypatch.setattr(settings, "submission_enabled", False)
        monkeypatch.setattr(settings, "github_submission_token", "tok")
        monkeypatch.setattr(settings, "turnstile_secret_key", "x")

        req = ModuleSubmissionRequest(**_valid_payload())

        class _FakeRequest:
            headers = {}
            client = None

        with pytest.raises(Exception) as exc:
            asyncio.run(
                create_submission(req, _FakeRequest(), session=None)  # type: ignore[arg-type]
            )
        assert getattr(exc.value, "status_code", None) == 503

    def test_create_submission_returns_503_when_turnstile_secret_missing(
        self, monkeypatch
    ) -> None:
        import asyncio

        from app.api.submissions import create_submission

        monkeypatch.setattr(settings, "submission_enabled", True)
        monkeypatch.setattr(settings, "github_submission_token", "tok")
        monkeypatch.setattr(settings, "turnstile_secret_key", None)

        req = ModuleSubmissionRequest(**_valid_payload())

        class _FakeRequest:
            headers = {}
            client = None

        with pytest.raises(Exception) as exc:
            asyncio.run(
                create_submission(req, _FakeRequest(), session=None)  # type: ignore[arg-type]
            )
        assert getattr(exc.value, "status_code", None) == 503

    def test_config_endpoint_reports_disabled_when_unprovisioned(
        self, monkeypatch
    ) -> None:
        import asyncio

        from app.api.submissions import submission_config

        monkeypatch.setattr(settings, "submission_enabled", True)
        monkeypatch.setattr(settings, "github_submission_token", None)
        monkeypatch.setattr(settings, "turnstile_site_key", None)
        monkeypatch.setattr(settings, "turnstile_secret_key", None)

        result = asyncio.run(submission_config())
        assert result == {
            "submission_enabled": False,
            "turnstile_site_key": None,
        }

    def test_config_endpoint_reports_enabled_when_fully_provisioned(
        self, monkeypatch
    ) -> None:
        import asyncio

        from app.api.submissions import submission_config

        monkeypatch.setattr(settings, "submission_enabled", True)
        monkeypatch.setattr(settings, "github_submission_token", "tok")
        monkeypatch.setattr(settings, "turnstile_site_key", "site")
        monkeypatch.setattr(settings, "turnstile_secret_key", "secret")

        result = asyncio.run(submission_config())
        assert result == {
            "submission_enabled": True,
            "turnstile_site_key": "site",
        }
