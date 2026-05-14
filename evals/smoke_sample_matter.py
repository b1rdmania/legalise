#!/usr/bin/env python3
"""End-to-end smoke against the seeded Khan v Acme matter.

Asserts the audit-row contract across the four v0.1 module surfaces:
matter list / detail, Pre-Motion run, Letters draft, PDF export.

The script does NOT make claims about model output quality — verdict
JSON varies run-to-run and depends on whether ANTHROPIC_API_KEY is set
on the backend. What we assert is the shape: HTTP statuses, audit row
counts, and the presence of load-bearing fields like envelope_hash.

Run:
    EVAL_API_BASE=http://localhost:3000/api python evals/smoke_sample_matter.py
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


# ----- HTTP helpers --------------------------------------------------------

def _req(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | str]:
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = request.Request(url, data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            ct = resp.headers.get("Content-Type", "")
            return resp.status, (json.loads(raw) if "application/json" in ct else raw)
    except urlerr.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def _audit(slug: str, limit: int = 100) -> list[dict]:
    status, body = _req("GET", f"/matters/{slug}/audit?limit={limit}")
    assert status == 200, f"audit fetch failed: {status} {body}"
    assert isinstance(body, list)
    return body


# ----- assertions ---------------------------------------------------------

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"


def step(name: str) -> None:
    print(f"\n→ {name}")


def ok(msg: str) -> None:
    print(f"  {PASS} {msg}")


def fail(msg: str) -> None:
    print(f"  {FAIL} {msg}")
    sys.exit(1)


# ----- evaluation ---------------------------------------------------------

def main() -> int:
    print(f"API base: {API}\n")
    print(f"Demo matter: {DEMO_SLUG}\n")

    step("health")
    # /health lives at the backend root, not under /api. Derive the root by
    # stripping the trailing /api segment from the configured base.
    backend_root = API.rsplit("/api", 1)[0] if API.endswith("/api") else API
    status, body = _req_raw_root(backend_root)
    if status != 200:
        fail(f"/health returned {status}")
    ok(f"backend reachable (status {status})")

    step("matter exists")
    status, body = _req("GET", f"/matters/{DEMO_SLUG}")
    if status != 200:
        fail(f"matter not found — set ENVIRONMENT=demo on the backend so the Khan seed runs. status={status} body={body}")
    assert isinstance(body, dict)
    assert body["slug"] == DEMO_SLUG, f"slug mismatch: {body}"
    assert body["matter_type"] == "employment_tribunal", f"matter_type drift: {body['matter_type']}"
    posture = body["privilege_posture"]
    ok(f"matter loaded · type={body['matter_type']} · posture={posture}")
    if posture == "C_paused":
        fail("seeded matter is C_paused — Pre-Motion + Letters will fast-fail; flip to A_cleared or B_mixed before running this eval")

    baseline = len(_audit(DEMO_SLUG))
    ok(f"baseline audit rows: {baseline}")

    # ----- Letters catalogue + draft (3-row contract) --------------------
    step("letters · catalogue is ET-shaped")
    status, body = _req("GET", f"/matters/{DEMO_SLUG}/letters/catalog")
    assert status == 200, f"catalog failed: {status} {body}"
    assert isinstance(body, dict)
    ids = [lt["id"] for lt in body["letter_types"]]
    if not (ids and ids[0] == "lba"):
        fail(f"expected lba as default ET letter, got {ids}")
    ok(f"catalogue returns {len(ids)} types, default={ids[0]}")

    step("letters · draft writes 3 audit rows")
    before = len(_audit(DEMO_SLUG))
    status, body = _req("POST", f"/matters/{DEMO_SLUG}/letters/draft", {"letter_type": "lba", "inputs": {}})
    if status != 200:
        fail(f"draft failed: {status} {body}")
    assert isinstance(body, dict)
    assert body["plugin"] == "uk-employment-legal"
    assert body["skill"] == "lba-drafter"
    assert body["draft_markdown"], "empty draft_markdown"
    after = len(_audit(DEMO_SLUG))
    delta = after - before
    if delta != 3:
        fail(f"expected 3 new audit rows (http.post + plugin.invoked + model.call), got {delta}")
    ok(f"draft returned; +{delta} rows · model={body['model_used']} · tokens={body['token_count']}")

    step("letters · civil id against ET matter returns 400")
    before = len(_audit(DEMO_SLUG))
    status, body = _req("POST", f"/matters/{DEMO_SLUG}/letters/draft", {"letter_type": "lbc", "inputs": {}})
    if status != 400:
        fail(f"expected 400 for civil-id on ET, got {status} {body}")
    after = len(_audit(DEMO_SLUG))
    # 1 row (http.post 400 from middleware) — no plugin.invoked, no model.call
    if after - before != 1:
        fail(f"expected 1 new audit row on rejected draft, got {after - before}")
    ok("rejection has middleware-only audit row, no semantic rows")

    # ----- Pre-Motion run (12-row contract) -------------------------------
    step("pre-motion · run writes 12 audit rows + envelope shape")
    before = len(_audit(DEMO_SLUG))
    t0 = time.time()
    status, body = _req("POST", f"/matters/{DEMO_SLUG}/pre-motion/run", {"depth": "thorough"})
    elapsed = time.time() - t0
    if status != 200:
        fail(f"run failed: {status} {body}")
    assert isinstance(body, dict)
    for k in ("matter_slug", "stages", "optimistic", "evidence_flags", "synthesis"):
        if k not in body:
            fail(f"missing envelope field: {k}")
    assert len(body["stages"]) == 4, f"expected 4 stages, got {len(body['stages'])}"
    stage_names = [s["name"] for s in body["stages"]]
    assert stage_names == ["optimistic", "evidence", "premortem", "synthesis"], f"stage order drift: {stage_names}"
    assert body["synthesis"]["verdict"] in {"steelman", "borderline", "strawman"}
    after = len(_audit(DEMO_SLUG))
    delta = after - before
    if delta != 12:
        fail(f"expected 12 new audit rows (http.post + start + 9 model.call + complete), got {delta}")
    ok(f"run completed in {elapsed:.1f}s · +{delta} rows · verdict={body['synthesis']['verdict']}")
    run_envelope = body

    # ----- PDF export (2-row contract, envelope_hash) ---------------------
    step("pre-motion · pdf export writes 2 rows incl. envelope_hash")
    before = len(_audit(DEMO_SLUG))
    # Use the urllib path that returns raw bytes — _req decodes JSON only
    url = f"{API}/matters/{DEMO_SLUG}/pre-motion/pdf"
    req = request.Request(
        url,
        data=json.dumps(run_envelope).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=120) as resp:
            pdf_bytes = resp.read()
            pdf_status = resp.status
            content_type = resp.headers.get("Content-Type", "")
    except urlerr.HTTPError as exc:
        fail(f"pdf export failed: {exc.code} {exc.read().decode('utf-8')[:300]}")

    if pdf_status != 200:
        fail(f"pdf export failed: {pdf_status}")
    if "application/pdf" not in content_type:
        fail(f"expected application/pdf content-type, got {content_type!r}")
    if not pdf_bytes.startswith(b"%PDF"):
        fail("response is not a PDF (no %PDF magic bytes)")
    after = len(_audit(DEMO_SLUG))
    delta = after - before
    if delta != 2:
        fail(f"expected 2 new audit rows (http.post + pdf.exported), got {delta}")
    audit_after = _audit(DEMO_SLUG)
    pdf_rows = [r for r in audit_after if r["action"] == "module.pre_motion.pdf.exported"]
    if not pdf_rows:
        fail("no module.pre_motion.pdf.exported row found")
    payload = pdf_rows[0].get("payload") or {}
    if "envelope_hash" not in payload:
        fail(f"envelope_hash missing from pdf.exported payload — R5 P2 regressed. payload={payload}")
    if len(payload["envelope_hash"]) != 64:
        fail(f"envelope_hash is not a sha256: len={len(payload['envelope_hash'])}")
    ok(f"pdf {len(pdf_bytes)} bytes · +{delta} rows · envelope_hash={payload['envelope_hash'][:12]}…")

    # ----- Summary --------------------------------------------------------
    total_after = len(_audit(DEMO_SLUG))
    print(f"\n{PASS} all evals passed · audit rows: {baseline} → {total_after} (+{total_after - baseline})")
    print("\nNote: this proves the audit-row contract holds. Model output quality is\n"
          "not asserted here — see evals/README.md for the scope boundary.")
    return 0


def _req_raw_root(root: str) -> tuple[int, dict | str]:
    """Fetch the bare /health on a different origin than API."""
    req = request.Request(f"{root}/health")
    try:
        with request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urlerr.HTTPError as exc:
        return exc.code, exc.read().decode()


if __name__ == "__main__":
    sys.exit(main())
