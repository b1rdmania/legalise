"""Static-invariant test: every `audit_api.log()` callsite under
`backend/app/modules/` whose action string starts with `module.` must
pass a `module=` kwarg.

Rationale: external audit (2026-05-21) flagged Pre-Motion start/complete
rows omitting `module="pre_motion"`. A regression here breaks the public
"keep the audit trail" claim because audit queries filter by module
namespace; rows with `module=NULL` are invisible to per-module
provenance views.

AST walk catches the bug class across all module callsites, not only the
three Pre-Motion sites the audit named.
"""

from __future__ import annotations

import ast
import pathlib


MODULES_ROOT = pathlib.Path(__file__).resolve().parents[1] / "app" / "modules"


def _find_missing_module_kwarg() -> list[tuple[str, int, str]]:
    """Return (path, lineno, action) for every audit_api.log call with a
    `module.*` action string that does not pass `module=` as a kwarg."""
    issues: list[tuple[str, int, str]] = []
    for py in MODULES_ROOT.rglob("*.py"):
        tree = ast.parse(py.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not (
                isinstance(func, ast.Attribute)
                and func.attr == "log"
                and isinstance(func.value, ast.Name)
                and func.value.id in {"audit_api", "audit"}
            ):
                continue
            action = None
            if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant):
                value = node.args[1].value
                if isinstance(value, str):
                    action = value
            if not (action and action.startswith("module.")):
                continue
            if any(kw.arg == "module" for kw in node.keywords):
                continue
            issues.append((str(py.relative_to(MODULES_ROOT.parents[2])), node.lineno, action))
    return issues


def test_all_module_audit_log_calls_pass_module_kwarg() -> None:
    issues = _find_missing_module_kwarg()
    assert not issues, (
        "audit_api.log callsites with module.* action strings must pass module= kwarg:\n"
        + "\n".join(f"  {path}:{lineno} — {action}" for path, lineno, action in issues)
    )
