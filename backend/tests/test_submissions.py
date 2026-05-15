"""Unit tests for the public module submission flow (Phase D W3).

Coverage:
- Schema-level guards on `ModuleSubmissionRequest`.
- SKILL.md round-trip via `frontmatter.dump` (the YAML-injection guard
  rests on the library, not hand-validation), including all three
  submitter-controlled frontmatter surfaces (description, body,
  submitter_contact).
- Config-gate 503s (submission_enabled, token absent, turnstile secret
  absent) via direct route-function calls.
- Mocked Turnstile + GitHub HTTP paths via monkeypatch (`_verify_turnstile`
  and `_gh_request` stubbed). No real network call ever fires.
- Rate-limit 429 after quota.
- Fresh-plugin vs existing-plugin GitHub flow asymmetry (module.json is
  PUT only when the plugin does not already exist upstream — reviewer
  P1 #2 fix).
- GitHub upstream-failure sanitisation (raw upstream body never leaked).
"""

from __future__ import annotations

import json

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

    def test_yaml_injection_via_submitter_contact_is_escaped(self) -> None:
        # submitter_contact also lands inside the synthesised frontmatter,
        # so any fake terminator there must be library-escaped too.
        evil = "octocat@example.com\n---\nname: pwned\n---"
        req = ModuleSubmissionRequest(**_valid_payload(submitter_contact=evil))
        skill_md = _build_skill_md(req)
        post = frontmatter.loads(skill_md)
        # The fake top-level "name: pwned" must NOT have hoisted out.
        assert post["name"] != "pwned"
        # The actual submitter_contact value (if it's surfaced) carries
        # the literal evil string. If submitter_contact is NOT in the
        # frontmatter and only ends up in the PR body, that's also fine.
        if "submitter_contact" in post.metadata:
            assert post["submitter_contact"].endswith(evil)


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


# ---------------------------------------------------------------------------
# Mocked Turnstile / GitHub flow — never makes real HTTP.
# ---------------------------------------------------------------------------


class _FakeSession:
    """Captures audit.log writes without touching a real DB."""

    def __init__(self) -> None:
        self.added: list = []

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        return None

    async def scalar(self, *args, **kwargs):
        return None

    async def execute(self, *args, **kwargs):
        class _R:
            def first(self):
                return None

        return _R()


class _ReqWithIp:
    def __init__(self, ip: str) -> None:
        self.headers = {"cf-connecting-ip": ip}

        class _Client:
            host = ip

        self.client = _Client()


def _provision(monkeypatch) -> None:
    monkeypatch.setattr(settings, "submission_enabled", True)
    monkeypatch.setattr(settings, "github_submission_token", "tok")
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    monkeypatch.setattr(settings, "turnstile_site_key", "site")


def _reset_rate_limit() -> None:
    from app.api import submissions as sub_module

    sub_module._RATE_BUCKETS.clear()


class TestTurnstileGate:
    def test_turnstile_failure_returns_403_and_skips_github(
        self, monkeypatch
    ) -> None:
        import asyncio

        from app.api import submissions as sub_module

        _provision(monkeypatch)
        _reset_rate_limit()

        async def _no(*a, **k):
            return False

        gh_calls: list = []

        async def _gh_should_not_run(*a, **k):
            gh_calls.append(a)

        monkeypatch.setattr(sub_module, "_verify_turnstile", _no)
        monkeypatch.setattr(sub_module, "_open_draft_pr", _gh_should_not_run)

        req = ModuleSubmissionRequest(**_valid_payload())
        with pytest.raises(Exception) as exc:
            asyncio.run(
                sub_module.create_submission(
                    req, _ReqWithIp("1.1.1.1"), session=_FakeSession()
                )
            )
        assert getattr(exc.value, "status_code", None) == 403
        assert exc.value.detail["error"] == "turnstile_failed"
        assert gh_calls == []


class TestRateLimit:
    def test_returns_429_after_quota_exhausted(self, monkeypatch) -> None:
        import asyncio

        from app.api import submissions as sub_module

        _provision(monkeypatch)
        monkeypatch.setattr(settings, "submission_rate_limit_per_hour", 2)
        _reset_rate_limit()

        async def _yes(*a, **k):
            return True

        async def _gh_ok(payload, skill_md, short_id):
            return ("https://github.com/x/y/pull/1", "submission/x/y-z", 1)

        monkeypatch.setattr(sub_module, "_verify_turnstile", _yes)
        monkeypatch.setattr(sub_module, "_open_draft_pr", _gh_ok)

        req = ModuleSubmissionRequest(**_valid_payload())
        ip = "9.9.9.9"

        # Two successful submissions exhaust the per-hour quota.
        asyncio.run(
            sub_module.create_submission(req, _ReqWithIp(ip), session=_FakeSession())
        )
        asyncio.run(
            sub_module.create_submission(req, _ReqWithIp(ip), session=_FakeSession())
        )

        with pytest.raises(Exception) as exc:
            asyncio.run(
                sub_module.create_submission(
                    req, _ReqWithIp(ip), session=_FakeSession()
                )
            )
        assert getattr(exc.value, "status_code", None) == 429
        assert exc.value.detail["error"] == "rate_limited"
        assert exc.value.detail["retry_after_seconds"] > 0


class _FakeGHResp:
    def __init__(self, status_code: int, body: dict | None = None) -> None:
        self.status_code = status_code
        self._body = body or {}
        self.text = json.dumps(self._body)

    def json(self) -> dict:
        return self._body


class TestGithubFlow:
    def test_fresh_plugin_puts_module_json(self, monkeypatch) -> None:
        """A submission for a plugin that does not exist upstream must
        PUT a fresh `module.json` alongside the SKILL.md."""
        import asyncio

        from app.api import submissions as sub_module

        _provision(monkeypatch)
        _reset_rate_limit()
        monkeypatch.setattr(sub_module, "_verify_turnstile", _yes_coro())

        calls: list[tuple[str, str]] = []

        async def _fake_gh(client, method, path, token, json_body=None):
            calls.append((method, path))
            if method == "GET" and "/git/ref/heads/" in path:
                return _FakeGHResp(200, {"object": {"sha": "basesha"}})
            if method == "POST" and path.endswith("/git/refs"):
                return _FakeGHResp(201)
            if (
                method == "GET"
                and "/contents/" in path
                and "module.json" in path
            ):
                return _FakeGHResp(404)
            if method == "PUT" and "/contents/" in path:
                return _FakeGHResp(201)
            if method == "POST" and path.endswith("/pulls"):
                return _FakeGHResp(
                    201,
                    {
                        "number": 42,
                        "html_url": "https://github.com/b1rdmania/claude-for-uk-legal/pull/42",
                    },
                )
            return _FakeGHResp(500, {"message": "unhandled"})

        monkeypatch.setattr(sub_module, "_gh_request", _fake_gh)

        req = ModuleSubmissionRequest(**_valid_payload())
        result = asyncio.run(
            sub_module.create_submission(
                req, _ReqWithIp("2.2.2.2"), session=_FakeSession()
            )
        )
        assert result.pull_request_url.endswith("/pull/42")

        puts = [(m, p) for (m, p) in calls if m == "PUT" and "/contents/" in p]
        skill_puts = [p for (_, p) in puts if p.endswith("SKILL.md")]
        module_puts = [p for (_, p) in puts if p.endswith("module.json")]
        assert len(skill_puts) == 1
        assert len(module_puts) == 1  # fresh plugin → write module.json

    def test_existing_plugin_skips_module_json_put(self, monkeypatch) -> None:
        """When the plugin already exists upstream, module.json is
        already on the new branch by inheritance — re-PUTting identical
        content is rejected by the GitHub Contents API. The endpoint
        must skip the PUT entirely (reviewer P1 #2 fix)."""
        import asyncio

        from app.api import submissions as sub_module

        _provision(monkeypatch)
        _reset_rate_limit()
        monkeypatch.setattr(sub_module, "_verify_turnstile", _yes_coro())

        calls: list[tuple[str, str]] = []

        async def _fake_gh(client, method, path, token, json_body=None):
            calls.append((method, path))
            if method == "GET" and "/git/ref/heads/" in path:
                return _FakeGHResp(200, {"object": {"sha": "basesha"}})
            if method == "POST" and path.endswith("/git/refs"):
                return _FakeGHResp(201)
            if (
                method == "GET"
                and "/contents/" in path
                and "module.json" in path
            ):
                return _FakeGHResp(
                    200,
                    {"sha": "existing-sha", "content": "e30=\n"},
                )
            if method == "PUT" and "/contents/" in path:
                return _FakeGHResp(201)
            if method == "POST" and path.endswith("/pulls"):
                return _FakeGHResp(
                    201,
                    {
                        "number": 43,
                        "html_url": "https://github.com/b1rdmania/claude-for-uk-legal/pull/43",
                    },
                )
            return _FakeGHResp(500, {"message": "unhandled"})

        monkeypatch.setattr(sub_module, "_gh_request", _fake_gh)

        req = ModuleSubmissionRequest(**_valid_payload())
        result = asyncio.run(
            sub_module.create_submission(
                req, _ReqWithIp("3.3.3.3"), session=_FakeSession()
            )
        )
        assert result.pull_request_url.endswith("/pull/43")

        puts = [(m, p) for (m, p) in calls if m == "PUT" and "/contents/" in p]
        skill_puts = [p for (_, p) in puts if p.endswith("SKILL.md")]
        module_puts = [p for (_, p) in puts if p.endswith("module.json")]
        assert len(skill_puts) == 1
        assert module_puts == []  # existing plugin → no module.json PUT

    def test_github_upstream_failure_returns_sanitised_502(
        self, monkeypatch
    ) -> None:
        import asyncio

        from app.api import submissions as sub_module

        _provision(monkeypatch)
        _reset_rate_limit()
        monkeypatch.setattr(sub_module, "_verify_turnstile", _yes_coro())

        async def _fake_gh(client, method, path, token, json_body=None):
            if method == "GET" and "/git/ref/heads/" in path:
                return _FakeGHResp(
                    500,
                    {"message": "internal — leak me", "secret": "should-not-surface"},
                )
            return _FakeGHResp(404)

        monkeypatch.setattr(sub_module, "_gh_request", _fake_gh)

        req = ModuleSubmissionRequest(**_valid_payload())
        with pytest.raises(Exception) as exc:
            asyncio.run(
                sub_module.create_submission(
                    req, _ReqWithIp("4.4.4.4"), session=_FakeSession()
                )
            )
        assert getattr(exc.value, "status_code", None) == 502
        detail = exc.value.detail  # type: ignore[attr-defined]
        # Sanitised: top-level "error" key only, no raw GitHub keys leaked.
        assert "secret" not in json.dumps(detail)


def _yes_coro():
    async def _yes(*a, **k):
        return True

    return _yes
