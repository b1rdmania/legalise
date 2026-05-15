"""Public module submission flow — Phase D W3 (§4h).

Unauthenticated POST that opens a draft PR against
`b1rdmania/claude-for-uk-legal`. The endpoint is the auth boundary:
Cloudflare Turnstile rejects bots, an in-memory token bucket adds
per-IP rate-limiting (Redis-backed multi-instance is v0.2), and a
config gate (`submission_enabled` + `github_submission_token`)
degrades to 503 when the surface is not provisioned.

Hard guards (preserved from HANDOVER_INFRA_BUILD §3 + PHASE_INFRA_DELTA §6):
- The PAT must be `b1rdmania`-scoped fine-grained, `contents:write`
  + `pull_requests:write` on `b1rdmania/claude-for-uk-legal` only.
  NOT `ziggythebot`. Caller-supplied tokens are not honoured — the
  token is read from `settings.github_submission_token`.
- SKILL.md frontmatter is synthesised authoritatively server-side
  via `frontmatter.dump(post, handler=frontmatter.YAMLHandler())`
  (NOT string concatenation). Submitters never supply raw YAML.
  This closes Phase D W3 Gotcha 9 (YAML injection) by library, not
  by hand-validation.
- No PII in audit beyond the submitter handle/contact, both
  voluntarily provided.

Audit row: `module.module.submission.opened`, module=`module_lifecycle`.
"""

from __future__ import annotations

import io
import re
import time
import uuid
from base64 import b64encode
from collections import deque
from typing import Literal

import frontmatter
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit
from app.core.config import settings
from app.core.db import get_session


router = APIRouter()


# Closed capability set per PHASE_INFRA_DELTA §4 decision 2.
ALLOWED_CAPABILITIES = frozenset(
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


ALLOWED_TRUST_POSTURES = frozenset({"trusted", "third_party", "experimental"})


# Kebab-case identifier pattern. Mirrors the `name` regex in
# `schemas/module.json` so submitted manifest names round-trip through
# the catalogue validator without rejection.
_KEBAB_RE = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$")


# In-memory per-IP token bucket. Single-process; multi-instance Redis
# rate-limiting is v0.2 doctrine (see PHASE_INFRA_DELTA §5). Bucket
# entries are deques of UNIX timestamps; we sweep old ones on each
# call. No background reaper — small process memory footprint at
# launch traffic and the OS reclaims when the worker recycles.
_RATE_BUCKETS: dict[str, deque[float]] = {}
_RATE_WINDOW_SECONDS = 3600


def _rate_limit_check(ip: str) -> int | None:
    """Return None if allowed, or the seconds-until-retry if rate-limited."""
    now = time.time()
    bucket = _RATE_BUCKETS.setdefault(ip, deque())
    cutoff = now - _RATE_WINDOW_SECONDS
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= settings.submission_rate_limit_per_hour:
        retry_after = int(bucket[0] + _RATE_WINDOW_SECONDS - now) + 1
        return max(retry_after, 1)
    bucket.append(now)
    return None


class ModuleSubmissionRequest(BaseModel):
    plugin_name: str = Field(min_length=2, max_length=64)
    skill_name: str = Field(min_length=2, max_length=64)
    description: str = Field(min_length=10, max_length=500)
    body_markdown: str = Field(min_length=20, max_length=40000)
    capabilities: list[str] = Field(default_factory=list, max_length=8)
    trust_posture: Literal["trusted", "third_party", "experimental"] = "experimental"
    submitter_handle: str = Field(min_length=1, max_length=64)
    submitter_contact: str = Field(min_length=3, max_length=200)
    turnstile_token: str = Field(min_length=10, max_length=4096)

    @field_validator("plugin_name", "skill_name")
    @classmethod
    def _kebab(cls, v: str) -> str:
        if not _KEBAB_RE.match(v):
            raise ValueError("must be kebab-case (lowercase letters, digits, hyphens)")
        return v

    @field_validator("capabilities")
    @classmethod
    def _capabilities_closed_set(cls, v: list[str]) -> list[str]:
        bad = [c for c in v if c not in ALLOWED_CAPABILITIES]
        if bad:
            raise ValueError(f"unknown capabilities: {sorted(set(bad))}")
        # dedupe while preserving order
        seen: set[str] = set()
        out: list[str] = []
        for c in v:
            if c not in seen:
                seen.add(c)
                out.append(c)
        return out

    @field_validator("submitter_handle")
    @classmethod
    def _handle(cls, v: str) -> str:
        # GitHub handle: alphanumerics + single hyphens, 1..39 chars.
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}", v):
            raise ValueError("submitter_handle must look like a GitHub username")
        return v


class ModuleSubmissionResponse(BaseModel):
    submission_id: str
    pull_request_url: str
    branch_name: str


def _client_ip(request: Request) -> str:
    # Trust only `CF-Connecting-IP` (set by Cloudflare for traffic that
    # transited the tunnel/edge). `X-Forwarded-For` is rejected outright:
    # if Fly is reachable directly an attacker can rotate the header to
    # bypass the rate limit on this unauthenticated PR-opener.
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    if request.client:
        return request.client.host
    return "unknown"


async def _verify_turnstile(token: str, remoteip: str) -> bool:
    if not settings.turnstile_secret_key:
        # Caller is responsible for the 503 check; this path is unreachable
        # in production but guards dev mistakes.
        return False
    payload = {
        "secret": settings.turnstile_secret_key,
        "response": token,
        "remoteip": remoteip,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data=payload,
            )
    except httpx.HTTPError:
        return False
    if resp.status_code != 200:
        return False
    try:
        body = resp.json()
    except ValueError:
        return False
    return bool(body.get("success"))


def _build_skill_md(req: ModuleSubmissionRequest) -> str:
    """Synthesise a SKILL.md from form fields.

    Frontmatter is built authoritatively server-side via
    `frontmatter.dump(post, handler=frontmatter.YAMLHandler())`. The
    submitter never supplies raw frontmatter — this closes the YAML
    injection vector by library, not by hand-validation.
    """
    metadata = {
        "name": req.skill_name,
        "plugin": req.plugin_name,
        "description": req.description,
        "trust_posture": req.trust_posture,
        "capabilities": list(req.capabilities),
        "submitter": {
            "handle": req.submitter_handle,
            "contact": req.submitter_contact,
        },
    }
    post = frontmatter.Post(req.body_markdown, **metadata)
    buf = io.BytesIO()
    frontmatter.dump(post, buf, handler=frontmatter.YAMLHandler())
    return buf.getvalue().decode("utf-8")


def _build_module_json(plugin_name: str, skill_name: str, description: str) -> str:
    """Authoritative module.json synthesis.

    The submitter never supplies a module.json — the endpoint builds
    one matching the `schemas/module.json` shape so the catalogue
    discovery validator accepts the submission. Pre-existing
    `module.json` files for the plugin are preserved by the GitHub
    contents API (existing-file SHA passed through on PUT) so we
    do not clobber other skills owned by the plugin.
    """
    import json

    manifest = {
        "name": plugin_name,
        "version": "0.0.1",
        "description": description,
        "nav": {"label": skill_name.replace("-", " ").title(), "order": 60},
        "routes": {
            "backend_prefix": f"/api/modules/{plugin_name}",
            "frontend_route": f"/matters/$slug/modules/{plugin_name}",
        },
    }
    return json.dumps(manifest, indent=2) + "\n"


def _sanitise_gh_error(resp: httpx.Response) -> dict:
    """Reduce a GitHub error response to a safe payload.

    Strips upstream JSON bodies (which can echo our request) and
    leaves a stable shape for the frontend.
    """
    return {
        "error": "github_upstream",
        "status": resp.status_code,
        "message": "GitHub API rejected the request.",
    }


async def _gh_request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    token: str,
    json_body: dict | None = None,
) -> httpx.Response:
    url = f"https://api.github.com{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "legalise-submission-flow",
    }
    return await client.request(method, url, headers=headers, json=json_body)


async def _open_draft_pr(
    req: ModuleSubmissionRequest,
    skill_md: str,
    short_id: str,
) -> tuple[str, str, int]:
    """Open a draft PR on `b1rdmania/claude-for-uk-legal`.

    Returns `(pr_url, branch_name, pr_number)`. Raises HTTPException
    with a sanitised 502 payload on any upstream failure.
    """
    token = settings.github_submission_token
    if not token:
        # Defensive — caller should have gated this. Surface 503.
        raise HTTPException(
            status_code=503,
            detail={
                "error": "submissions_disabled",
                "message": "Submission backend not configured.",
            },
        )

    repo = settings.github_submission_repo
    base_branch = settings.github_submission_base_branch
    branch_name = f"submission/{req.plugin_name}/{req.skill_name}-{short_id}"

    skill_path = f"plugins/{req.plugin_name}/skills/{req.skill_name}/SKILL.md"
    module_json_path = f"plugins/{req.plugin_name}/module.json"

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Get base branch SHA.
        ref_resp = await _gh_request(
            client, "GET", f"/repos/{repo}/git/ref/heads/{base_branch}", token
        )
        if ref_resp.status_code != 200:
            raise HTTPException(status_code=502, detail=_sanitise_gh_error(ref_resp))
        base_sha = ref_resp.json()["object"]["sha"]

        # 2. Create branch.
        new_ref = await _gh_request(
            client,
            "POST",
            f"/repos/{repo}/git/refs",
            token,
            json_body={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
        )
        if new_ref.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=_sanitise_gh_error(new_ref))

        # 3. PUT the SKILL.md (new file on a fresh branch — no SHA needed).
        skill_put = await _gh_request(
            client,
            "PUT",
            f"/repos/{repo}/contents/{skill_path}",
            token,
            json_body={
                "message": f"submission: {req.plugin_name}/{req.skill_name} (SKILL.md)",
                "content": b64encode(skill_md.encode("utf-8")).decode("ascii"),
                "branch": branch_name,
            },
        )
        if skill_put.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=_sanitise_gh_error(skill_put))

        # 4. Create module.json only when the plugin does not already
        # exist on the base branch. The new branch inherits the file
        # from main; re-PUTting identical content is rejected by the
        # GitHub Contents API ("no changes detected"). Sibling skills
        # under an existing plugin stay intact; Andy reconciles the
        # additive merge at PR review.
        existing = await _gh_request(
            client,
            "GET",
            f"/repos/{repo}/contents/{module_json_path}?ref={base_branch}",
            token,
        )
        if existing.status_code == 404:
            module_put = await _gh_request(
                client,
                "PUT",
                f"/repos/{repo}/contents/{module_json_path}",
                token,
                json_body={
                    "message": f"submission: {req.plugin_name}/{req.skill_name} (module.json)",
                    "content": b64encode(
                        _build_module_json(
                            req.plugin_name, req.skill_name, req.description
                        ).encode("utf-8")
                    ).decode("ascii"),
                    "branch": branch_name,
                },
            )
            if module_put.status_code not in (200, 201):
                raise HTTPException(status_code=502, detail=_sanitise_gh_error(module_put))
        elif existing.status_code != 200:
            raise HTTPException(status_code=502, detail=_sanitise_gh_error(existing))

        # 5. Open the draft PR.
        pr_body = (
            f"Public submission via legalise.dev.\n\n"
            f"- Submitter handle: @{req.submitter_handle}\n"
            f"- Contact: {req.submitter_contact}\n"
            f"- Plugin: `{req.plugin_name}`\n"
            f"- Skill: `{req.skill_name}`\n"
            f"- Declared trust posture: `{req.trust_posture}`\n"
            f"- Declared capabilities: "
            f"{', '.join(f'`{c}`' for c in req.capabilities) if req.capabilities else '(none)'}\n\n"
            f"Manifest fields are declarations under review, not enforcement. "
            f"Maintainer reviews before merge."
        )
        pr_resp = await _gh_request(
            client,
            "POST",
            f"/repos/{repo}/pulls",
            token,
            json_body={
                "title": f"submission: {req.plugin_name}/{req.skill_name}",
                "head": branch_name,
                "base": base_branch,
                "body": pr_body,
                "draft": True,
            },
        )
        if pr_resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=_sanitise_gh_error(pr_resp))
        pr_json = pr_resp.json()
        return pr_json["html_url"], branch_name, pr_json["number"]


@router.get("/submissions/config")
async def submission_config() -> dict:
    """Public config probe for the submission form.

    Frontend reads `submission_enabled` to decide whether to render
    the form at all. The site key surfaces so the widget can mount
    without an extra round-trip.
    """
    enabled = bool(
        settings.submission_enabled
        and settings.github_submission_token
        and settings.turnstile_site_key
        and settings.turnstile_secret_key
    )
    return {
        "submission_enabled": enabled,
        "turnstile_site_key": settings.turnstile_site_key if enabled else None,
    }


@router.post("/submissions", response_model=ModuleSubmissionResponse)
async def create_submission(
    payload: ModuleSubmissionRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ModuleSubmissionResponse:
    """Open a draft PR on `b1rdmania/claude-for-uk-legal`.

    Pipeline: config gate → Turnstile verify → IP rate-limit →
    server-authoritative SKILL.md synthesis → GitHub draft PR →
    audit row.
    """
    # 1. Config / submission gate.
    if not settings.submission_enabled:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "submissions_disabled",
                "message": "Module submissions are currently closed.",
            },
        )
    if not settings.github_submission_token:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "submissions_disabled",
                "message": "Submission backend not configured (token).",
            },
        )
    if not settings.turnstile_secret_key:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "submissions_disabled",
                "message": "Submission backend not configured (turnstile).",
            },
        )

    remote_ip = _client_ip(request)

    # 2. Turnstile verify.
    if not await _verify_turnstile(payload.turnstile_token, remote_ip):
        raise HTTPException(
            status_code=403,
            detail={"error": "turnstile_failed", "message": "Captcha check failed."},
        )

    # 3. Rate-limit (after Turnstile to avoid spending budget on bots).
    retry_after = _rate_limit_check(remote_ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limited",
                "retry_after_seconds": retry_after,
                "message": "Too many submissions from this IP. Try later.",
            },
        )

    # 4. Build the SKILL.md authoritatively and round-trip it to catch
    # any pathological body before we touch GitHub.
    skill_md = _build_skill_md(payload)
    try:
        frontmatter.loads(skill_md)
    except Exception as exc:  # noqa: BLE001 — frontmatter raises varied types
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_skill_md", "message": str(exc)[:200]},
        ) from exc

    submission_id = uuid.uuid4().hex
    short_id = submission_id[:8]

    # 5. Open the draft PR.
    pr_url, branch_name, pr_number = await _open_draft_pr(payload, skill_md, short_id)

    # 6. Audit. No PII beyond the handle/contact the submitter
    # voluntarily supplied. Token, IP, raw body excluded.
    await audit.log(
        session,
        "module.module.submission.opened",
        actor_id=None,
        module="module_lifecycle",
        resource_type="module_submission",
        resource_id=submission_id,
        payload={
            "submission_id": submission_id,
            "submitter_handle": payload.submitter_handle,
            "submitter_contact": payload.submitter_contact,
            "plugin": payload.plugin_name,
            "skill": payload.skill_name,
            "pr_number": pr_number,
            "pr_url": pr_url,
            "branch_name": branch_name,
            "capabilities": list(payload.capabilities),
            "trust_posture": payload.trust_posture,
        },
    )
    await session.commit()

    return ModuleSubmissionResponse(
        submission_id=submission_id,
        pull_request_url=pr_url,
        branch_name=branch_name,
    )
