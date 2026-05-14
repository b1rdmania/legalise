#!/usr/bin/env python3
"""Letter catalogue routing against a live backend.

Asserts that the matter-type routing surfaced via /letters/catalog
matches what unit tests in backend/tests/test_letter_catalog.py verify
in isolation. Creates a transient civil matter for the cross-check, then
deletes it (well — leaves it; matters delete is v0.2).

Run:
    EVAL_API_BASE=http://localhost:3000/api python evals/smoke_letter_routing.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from urllib import error as urlerr
from urllib import request

API = os.environ.get("EVAL_API_BASE", "http://localhost:3000/api").rstrip("/")
DEMO_SLUG = "khan-v-acme-trading-2026"


def _req(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | str]:
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = request.Request(url, data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            ct = resp.headers.get("Content-Type", "")
            return resp.status, (json.loads(raw) if "application/json" in ct else raw)
    except urlerr.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"


def step(name: str) -> None:
    print(f"\n→ {name}")


def ok(msg: str) -> None:
    print(f"  {PASS} {msg}")


def fail(msg: str) -> None:
    print(f"  {FAIL} {msg}")
    sys.exit(1)


def main() -> int:
    print(f"API base: {API}\n")

    step("ET matter catalogue")
    status, body = _req("GET", f"/matters/{DEMO_SLUG}/letters/catalog")
    if status != 200:
        fail(f"catalog failed: {status} {body}")
    assert isinstance(body, dict)
    types = body["letter_types"]
    ids = [lt["id"] for lt in types]
    if len(types) != 6:
        fail(f"expected 6 ET letter types, got {len(types)}: {ids}")
    if ids[0] != "lba":
        fail(f"expected lba first (default), got {ids[0]}")
    if not types[0]["is_default"]:
        fail("first letter type missing is_default=true")
    if "lbc" in ids:
        fail(f"civil-only lbc leaked into ET catalogue: {ids}")
    ok(f"ET returns 6 types · default={ids[0]} · {ids}")

    step("civil matter catalogue (transient)")
    civil_slug = f"eval-pneg-{int(time.time())}"
    status, body = _req("POST", "/matters", {
        "title": f"Eval Prof Neg {int(time.time())}",
        "matter_type": "professional_negligence",
        "cause": "professional negligence eval transient",
        "privilege_posture": "B_mixed",
    })
    if status != 201:
        fail(f"failed to create civil matter: {status} {body}")
    assert isinstance(body, dict)
    civil_slug = body["slug"]
    ok(f"created transient civil matter · slug={civil_slug}")

    status, body = _req("GET", f"/matters/{civil_slug}/letters/catalog")
    if status != 200:
        fail(f"civil catalog failed: {status} {body}")
    assert isinstance(body, dict)
    ids = [lt["id"] for lt in body["letter_types"]]
    if "lbc" not in ids or ids[0] != "lbc":
        fail(f"expected lbc as default for civil, got {ids}")
    if "lba" in ids:
        fail(f"ET-only lba leaked into civil catalogue: {ids}")
    ok(f"civil returns {len(ids)} types · default={ids[0]} · {ids}")

    step("cross-rejection: lbc against ET")
    status, body = _req("POST", f"/matters/{DEMO_SLUG}/letters/draft", {"letter_type": "lbc", "inputs": {}})
    if status != 400:
        fail(f"expected 400, got {status} {body}")
    detail = (body.get("detail") if isinstance(body, dict) else str(body)) or ""
    if "not available for matter type" not in detail:
        fail(f"unexpected rejection message: {detail!r}")
    ok(f"rejected with: {detail!r}")

    step("cross-rejection: lba against civil")
    status, body = _req("POST", f"/matters/{civil_slug}/letters/draft", {"letter_type": "lba", "inputs": {}})
    if status != 400:
        fail(f"expected 400, got {status} {body}")
    ok("rejected as expected")

    step("unknown matter_type returns empty catalogue (no 500)")
    unknown_slug = f"eval-unknown-{int(time.time())}"
    status, body = _req("POST", "/matters", {
        "title": f"Eval Unknown {int(time.time())}",
        "matter_type": "something_weird",
        "cause": "transient eval",
        "privilege_posture": "B_mixed",
    })
    if status != 201:
        fail(f"failed to create unknown-type matter: {status} {body}")
    assert isinstance(body, dict)
    unknown_slug = body["slug"]
    status, body = _req("GET", f"/matters/{unknown_slug}/letters/catalog")
    if status != 200:
        fail(f"expected 200 even for unknown matter_type, got {status} {body}")
    assert isinstance(body, dict)
    if body["letter_types"] != []:
        fail(f"expected empty letter_types for unknown matter_type, got {body['letter_types']}")
    ok("unknown matter_type returns 200 with empty letter_types")

    print(f"\n{PASS} all routing evals passed")
    print(f"\nTransient matters left in workspace: {civil_slug}, {unknown_slug}")
    print("(matters delete is v0.2)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
