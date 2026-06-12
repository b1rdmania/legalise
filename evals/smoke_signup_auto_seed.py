#!/usr/bin/env python3
"""Signup auto-seed eval.

Asserts that registering a new user → completing verification (or, in dev,
hitting the autoverify path) lands the user in a workspace where the Khan
v Acme demo matter is already populated with its three seeded documents
and seven chronology events.

Also asserts slug tenancy Option A: two independently-registered users
both hold a matter at slug `khan-v-acme-trading-2026`, and neither can
read the other's row.

Requires the backend to be running with ENVIRONMENT in {development, dev,
local} so the dev autoverify path fires (production needs a real email
loop, which the eval can't drive).

Run:
    EVAL_API_BASE=http://localhost:3000/api python evals/smoke_signup_auto_seed.py
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
KHAN_SLUG = "khan-v-acme-trading-2026"


def _opener() -> request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return request.build_opener(request.HTTPCookieProcessor(jar))


def _req(opener, method: str, url: str, body=None, form: bool = False):
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
    status, body = _req(
        opener, "POST", f"{AUTH}/login",
        {"username": email, "password": password},
        form=True,
    )
    assert status in (200, 204), f"login failed for {email}: {status} {body}"


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    a_email = f"eval-seed-a-{suffix}@evals.legalise.dev"
    b_email = f"eval-seed-b-{suffix}@evals.legalise.dev"
    pw = "Password-1234-abcdEFGH"

    a = _opener()
    b = _opener()

    # 1. Register + log in two users. on_after_register dev path autoverifies
    #    and calls _post_verify → seed_demo_matter_for_user. Khan should
    #    exist for both immediately on first authenticated request.
    _signup_login(a, a_email, pw)
    _signup_login(b, b_email, pw)

    # 2. Both users see a populated Khan at the shared slug.
    for label, opener in (("A", a), ("B", b)):
        status, body = _req(opener, "GET", f"{API}/matters/{KHAN_SLUG}")
        assert status == 200, f"{label} GET Khan expected 200, got {status} {body}"
        assert body["slug"] == KHAN_SLUG, f"{label} slug mismatch: {body['slug']}"
        assert body["matter_type"] == "employment_tribunal", f"{label} matter_type drift"
        assert body["case_theory"], f"{label} case_theory empty — seed didn't populate"
        assert body["pivot_fact"], f"{label} pivot_fact empty"

    # 3. Documents seeded for both users.
    for label, opener in (("A", a), ("B", b)):
        status, body = _req(opener, "GET", f"{API}/matters/{KHAN_SLUG}/documents")
        assert status == 200, f"{label} GET documents expected 200, got {status}"
        assert isinstance(body, list) and len(body) == 3, (
            f"{label} expected 3 seeded documents, got {len(body) if isinstance(body, list) else body}"
        )
        filenames = sorted(d["filename"] for d in body)
        assert filenames == sorted([
            "khan-dismissal-letter.pdf",
            "witness-statement-khan.docx",
            "synthetic-mutual-nda.docx",
        ]), f"{label} document filenames drift: {filenames}"
        disclosure_count = sum(1 for d in body if d.get("from_disclosure"))
        assert disclosure_count == 1, (
            f"{label} expected 1 disclosure-tainted document, got {disclosure_count}"
        )

    # 4. Chronology seeded for both users; CPR 31.22 gate is pending
    #    (tainted_event_count > 0, confirmed=False) until acknowledged.
    for label, opener in (("A", a), ("B", b)):
        status, body = _req(opener, "GET", f"{API}/matters/{KHAN_SLUG}/chronology")
        assert status == 200, f"{label} GET chronology expected 200, got {status}"
        assert "events" in body, f"{label} chronology body missing events"
        assert len(body["events"]) == 7, (
            f"{label} expected 7 seeded events, got {len(body['events'])}"
        )
        assert body["gate"]["required"] is True, f"{label} CPR 31.22 gate not flagged required"
        assert body["gate"]["confirmed"] is False, f"{label} gate already confirmed on fresh user"
        assert body["gate"]["tainted_event_count"] >= 1, (
            f"{label} expected at least 1 tainted event, got {body['gate']['tainted_event_count']}"
        )

    # 5. Cross-user segregation on the shared slug: each user's Khan must
    #    have a distinct matter_id. We can't read the id off the other
    #    user's row (they're 404 to each other), but a write by one must
    #    not be visible to the other. Verify by flipping A's posture and
    #    confirming B sees no change.
    status, body_a = _req(a, "GET", f"{API}/matters/{KHAN_SLUG}")
    a_id = body_a["id"]
    a_posture_before = body_a["privilege_posture"]

    new_posture = "A_cleared" if a_posture_before != "A_cleared" else "B_mixed"
    status, _ = _req(a, "PATCH", f"{API}/matters/{KHAN_SLUG}/privilege", {
        "privilege_posture": new_posture,
    })
    assert status == 200, f"A posture flip failed: {status}"

    status, body_b = _req(b, "GET", f"{API}/matters/{KHAN_SLUG}")
    assert status == 200, f"B re-read failed: {status}"
    assert body_b["id"] != a_id, "A and B share a matter id — slug tenancy regressed"
    assert body_b["privilege_posture"] == "B_mixed", (
        f"B's posture changed when A flipped — cross-user write leak: {body_b['privilege_posture']}"
    )

    # 6. Anonymous can't read either user's Khan.
    anon = _opener()
    status, body = _req(anon, "GET", f"{API}/matters/{KHAN_SLUG}")
    assert status == 401, f"anonymous GET expected 401, got {status} {body}"

    print("OK — signup auto-seed checks passed:")
    print("  · register → autoverify → Khan present (matter, 3 docs, 7 events, CPR gate)")
    print("  · slug tenancy Option A: two users hold the same slug independently")
    print("  · cross-user write leak: A's posture flip does not touch B's row")
    return 0


if __name__ == "__main__":
    sys.exit(main())
