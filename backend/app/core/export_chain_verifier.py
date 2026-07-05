"""Offline verifier for the audit hash chain in a Legalise matter export.

This file is copied verbatim into every export zip as ``verify_chain.py``.
It must run on a bare Python 3 install: standard library only, no imports
from the Legalise application.

Usage (from inside an unpacked export):

    python verify_chain.py

It reads ``audit_chain.json`` from the same directory (or a path passed as
the first argument), recomputes every entry hash and chain link hash from
the exported field values, and checks the chain runs unbroken from
sequence 1 to the head hash stated in the file. If ``audit.json`` sits
alongside, it also checks the two files describe the same set of entries.

Exit code 0 means the chain verified. Exit code 1 means it did not.

The hash recipe below mirrors ``app/core/audit_chain.py`` (which in turn
mirrors the PL/pgSQL trigger recipe). A test in the backend suite runs this
script against a chain produced by the real database trigger, so any drift
between the recipes fails CI.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ENTRY_PREFIX = "audit-chain-entry-v1"
LINK_PREFIX = "audit-chain-link-v1"
SUPPORTED_FORMAT = "legalise-audit-chain-export-v1"

# Order matters: this is the canonical field order the entry hash is
# computed over. The export writes every value as a string (or null),
# already rendered the way the canonical recipe expects — timestamps in
# UTC ``%Y-%m-%dT%H:%M:%S.%fZ`` form, numbers as decimal strings, the
# payload as the verbatim ``payload::text`` from Postgres.
ENTRY_HASH_FIELDS = (
    "id",
    "timestamp",
    "actor_id",
    "matter_id",
    "action",
    "module",
    "resource_type",
    "resource_id",
    "model_used",
    "prompt_hash",
    "response_hash",
    "token_count",
    "latency_ms",
    "tokens_in",
    "tokens_out",
    "cost_micros",
    "currency",
    "provider",
    "model_id",
    "payload_text",
)


def _field(value: str | None) -> str:
    if value is None:
        return "-1:"
    return f"{len(value)}:{value}"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def entry_hash(entry: dict[str, Any]) -> str:
    parts = [ENTRY_PREFIX]
    for name in ENTRY_HASH_FIELDS:
        value = entry.get(name)
        parts.append(_field(None if value is None else str(value)))
    return _hash("\n".join(parts))


def chain_link_hash(entry: dict[str, Any], computed_entry_hash: str) -> str:
    matter_id = entry.get("matter_id")
    previous = entry.get("previous_chain_hash")
    parts = [
        LINK_PREFIX,
        _field(str(entry["chain_version"])),
        _field(str(entry["scope_type"])),
        _field(None if matter_id is None else str(matter_id)),
        _field(str(entry["scope_sequence"])),
        _field(str(entry["id"])),
        _field(None if previous is None else str(previous)),
        _field(computed_entry_hash),
    ]
    return _hash("\n".join(parts))


def verify(chain_path: Path) -> list[str]:
    """Return a list of problems. Empty list means the chain verified."""
    problems: list[str] = []

    try:
        data = json.loads(chain_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"could not read {chain_path.name}: {exc}"]

    if data.get("format") != SUPPORTED_FORMAT:
        return [f"unsupported format marker: {data.get('format')!r}"]

    entries = data.get("entries", [])
    head = data.get("head")

    if not entries:
        if head is not None:
            problems.append("file states a head hash but contains no entries")
        return problems

    if head is None:
        return ["file contains entries but states no head hash"]

    previous_hash: str | None = None
    for position, entry in enumerate(entries, start=1):
        label = f"entry {position} (audit id {entry.get('id')})"

        if entry.get("scope_sequence") != position:
            problems.append(
                f"{label}: expected sequence {position}, file says "
                f"{entry.get('scope_sequence')}"
            )

        if entry.get("previous_chain_hash") != previous_hash:
            problems.append(f"{label}: previous-hash link does not match the prior entry")

        computed_entry = entry_hash(entry)
        if entry.get("entry_hash") != computed_entry:
            problems.append(
                f"{label}: entry hash does not match its contents "
                "(a field or the payload was altered)"
            )

        computed_chain = chain_link_hash(entry, computed_entry)
        if entry.get("chain_hash") != computed_chain:
            problems.append(f"{label}: chain hash does not match")

        previous_hash = entry.get("chain_hash")

    if head.get("chain_hash") != previous_hash:
        problems.append(
            "the chain does not terminate at the stated head hash "
            f"(head says {head.get('chain_hash')}, chain ends at {previous_hash})"
        )
    if head.get("entry_count") != len(entries):
        problems.append(
            f"head states {head.get('entry_count')} entries, file contains {len(entries)}"
        )

    # Cross-check against audit.json when it travels in the same pack: the
    # human-readable log and the hashed chain must describe the same rows.
    audit_path = chain_path.parent / "audit.json"
    if audit_path.exists():
        try:
            audit_rows = json.loads(audit_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            problems.append(f"could not read audit.json for cross-check: {exc}")
        else:
            chain_ids = {str(e.get("id")) for e in entries}
            audit_ids = {str(r.get("id")) for r in audit_rows}
            if audit_ids != chain_ids:
                missing = sorted(audit_ids - chain_ids)
                extra = sorted(chain_ids - audit_ids)
                if missing:
                    problems.append(
                        f"{len(missing)} audit.json entr(y/ies) missing from the chain: "
                        + ", ".join(missing[:5])
                    )
                if extra:
                    problems.append(
                        f"{len(extra)} chain entr(y/ies) missing from audit.json: "
                        + ", ".join(extra[:5])
                    )

    return problems


def main(argv: list[str]) -> int:
    if len(argv) > 1:
        chain_path = Path(argv[1])
    else:
        chain_path = Path(__file__).resolve().parent / "audit_chain.json"

    problems = verify(chain_path)
    if problems:
        print("FAIL: the audit chain did NOT verify.")
        for problem in problems:
            print(f"  - {problem}")
        print(
            "The exported record does not match its hash chain. "
            "Treat this pack as altered until explained."
        )
        return 1

    data = json.loads(chain_path.read_text(encoding="utf-8"))
    count = len(data.get("entries", []))
    head = data.get("head") or {}
    print(f"PASS: audit chain verified — {count} entries, unbroken from sequence 1.")
    if head.get("chain_hash"):
        print(f"Head hash: {head['chain_hash']}")
    print(
        "Every audit entry hashes to its recorded value and each link chains "
        "to the next. Editing, deleting, or reordering any entry would have "
        "failed this check."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
