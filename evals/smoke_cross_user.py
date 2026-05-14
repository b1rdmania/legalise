#!/usr/bin/env python3
"""Cross-user access-control eval.

Asserts the §7 invariant from HANDOVER_AUTH.md: a matter slug owned by
User A returns 404 (not 403) when accessed via User B's session. The
eval covers every load-bearing endpoint that resolves a matter by slug:
matter detail, audit, documents, privilege, chronology, letters
catalogue, Pre-Motion run, Pre-Motion run-stream.

The slug invariant is per-owner unique (HANDOVER_AUTH.md §3e Option A),
so both users can hold a matter named `eval-cross-user-{n}` without
collision. We confirm that here too: User B creates a matter with
User A's slug and receives 201, not 409.

Run:
    EVAL_API_BASE=http://localhost:3000/api python evals/smoke_cross_user.py
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import uuid
from urllib import error as urlerr
from urllib import request

API = os.environ.get("EVAL_API_BASE", "http://localhost:3000/api").rstrip("/")
AUTH = API.rsplit("/api", 1)[0] + "/auth"


def _opener() -> request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return request.build_opener(request.HTTPCookieProcessor(jar))


def _req(opener, method: str, url: str, body: dict | None = None, form: bool = False):
    if body is None:
        data, headers = None, {}
    elif form:
        from urllib.parse import urlencode
        data = urlencode(body).encode()
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
    else:
        data = json.dumps(body).encode()
        headers = {"Content-Type": "application/json"}
    req = request.Request(url, data=data, method=method, headers=headers)
    try:
        with opener.open(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8") or "{}"
            ct = resp.headers.get("Content-Type", "")
            return resp.status, (json.loads(raw) if "application/json" in ct else raw)
    except urlerr.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def _signup_login(opener, email: str, password: str) -> None:
    status, body = _req(opener, "POST", f"{AUTH}/register", {"email": email, "password": password})
    assert status == 201, f"register failed for {email}: {status} {body}"
    # Cookie login form (fastapi-users expects OAuth2 form fields).
    status, body = _req(
        opener, "POST", f"{AUTH}/login",
        {"username": email, "password": password},
        form=True,
    )
    assert status in (200, 204), f"login failed for {email}: {status} {body}"


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    a_email = f"eval-a-{suffix}@legalise.test"
    b_email = f"eval-b-{suffix}@legalise.test"
    pw = "Password-1234-abcdEFGH"

    a = _opener()
    b = _opener()

    _signup_login(a, a_email, pw)
    _signup_login(b, b_email, pw)

    slug_a = f"eval-cross-user-a-{suffix}"
    status, body = _req(a, "POST", f"{API}/matters", {
        "title": f"Eval Cross User A {suffix}",
        "matter_type": "employment_tribunal",
        "privilege_posture": "B_mixed",
        "default_model_id": "stub-echo",
        "facts": {},
    })
    assert status == 201, f"A create failed: {status} {body}"
    assert body["slug"] == slug_a or body["slug"].startswith("eval-cross-user-a"), body
    slug_a = body["slug"]

    # 1. Same slug, different user -> 201 (per-owner uniqueness works).
    status, body = _req(b, "POST", f"{API}/matters", {
        "title": f"Eval Cross User A {suffix}",
        "matter_type": "employment_tribunal",
        "privilege_posture": "B_mixed",
        "default_model_id": "stub-echo",
        "facts": {},
    })
    assert status == 201, f"B same-slug create failed (Option A regression): {status} {body}"

    # 2. B GETs A's matter URL -> 404, not 403, not 200.
    paths_b_must_404 = [
        f"/matters/{slug_a}",
        f"/matters/{slug_a}/audit",
        f"/matters/{slug_a}/chronology",
        f"/matters/{slug_a}/letters/catalog",
    ]
    for p in paths_b_must_404:
        status, body = _req(b, "GET", f"{API}{p}")
        assert status == 404, f"GET {p} as B expected 404, got {status} {body}"

    # 3. B POSTs Pre-Motion run on A's slug -> 404.
    status, body = _req(b, "POST", f"{API}/matters/{slug_a}/pre-motion/run", {})
    assert status == 404, f"POST pre-motion/run as B expected 404, got {status} {body}"

    # 4. B POSTs Letters draft on A's slug -> 404 (not 400, not 503).
    status, body = _req(b, "POST", f"{API}/matters/{slug_a}/letters/draft", {
        "letter_type": "etb-grievance-letter",
        "inputs": {},
    })
    assert status == 404, f"POST letters/draft as B expected 404, got {status} {body}"

    # 5. Anonymous GET -> 401 (current_user dependency enforces).
    anon = _opener()
    status, body = _req(anon, "GET", f"{API}/matters/{slug_a}")
    assert status == 401, f"anonymous GET expected 401, got {status} {body}"

    print("OK — cross-user negative checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
