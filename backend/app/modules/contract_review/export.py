"""Contract Review export — markdown synthesis for the .docx pipeline.

Phase B's `generate_docx` tool does not render markdown tables, so the
redline section ships as paired Original / Suggested paragraphs rather
than the two-column diff layout the UI shows.

The markdown shape mirrors `pre_motion/router.py::_render_synthesis_markdown`
so the two .docx exports read consistently to a partner skimming both.
"""

from __future__ import annotations

from app.models import Matter

from .schemas import ContractReviewResult


_PRIORITY_LABEL = {
    "must": "MUST",
    "suggested": "Suggested",
    "nice_to_have": "Nice-to-have",
}

_SEVERITY_LABEL = {"high": "HIGH", "medium": "Medium", "low": "Low"}


def render_contract_review_markdown(matter: Matter, result: ContractReviewResult) -> str:
    """Render a ContractReviewResult to Word-friendly markdown."""
    s = result.summary
    lines: list[str] = []

    lines.append(
        f"matter: {matter.slug} | document: {result.document_filename} | "
        f"posture: {result.posture} | type: {result.contract_type}"
    )
    lines.append(
        f"model: {result.model_used} | tokens: {result.total_token_count} | "
        f"duration: {result.total_duration_ms / 1000:.1f}s"
    )
    lines.append("")

    # ----- Executive summary --------------------------------------------
    lines.append("## Executive summary")
    lines.append("")
    lines.append(s.executive_summary or "(no summary produced)")
    if s.recommendation:
        lines.append("")
        lines.append(f"**Recommendation:** {s.recommendation}")

    # ----- Contract metadata --------------------------------------------
    p = result.parsed
    lines.append("")
    lines.append("## Contract")
    lines.append("")
    lines.append(f"- Title: {p.title or '(unknown)'}")
    lines.append(
        f"- Parties: {', '.join(p.parties) if p.parties else '(unknown)'}"
    )
    lines.append(f"- Type (detected): {p.document_type}")
    lines.append(
        f"- Governing law (stated): {p.governing_law_stated or 'NOT STATED'}"
    )
    lines.append(f"- Clause count: {len(p.clauses)}")

    if s.key_terms:
        lines.append("")
        lines.append("## Key terms")
        lines.append("")
        for t in s.key_terms:
            lines.append(f"- {t}")

    # ----- Risk overview ------------------------------------------------
    if s.risk_overview:
        lines.append("")
        lines.append("## Risk overview")
        lines.append("")
        lines.append(s.risk_overview)

    # ----- UK callouts --------------------------------------------------
    if s.uk_specific_callouts:
        lines.append("")
        lines.append("## UK-specific callouts")
        lines.append("")
        for c in s.uk_specific_callouts:
            lines.append(f"- {c}")

    # ----- Clause-by-clause analysis -----------------------------------
    if result.analyses:
        lines.append("")
        lines.append("## Clause-by-clause analysis")
        lines.append("")
        # Build a clause-id → title lookup for human-friendly headings.
        clause_lookup = {c.id: c for c in p.clauses}
        for a in result.analyses:
            clause = clause_lookup.get(a.clause_id)
            heading = a.clause_id
            if clause:
                if clause.section:
                    heading = f"{a.clause_id} ({clause.section} {clause.title})".strip()
                elif clause.title:
                    heading = f"{a.clause_id} — {clause.title}"
            risk = a.risk_score
            risk_label = "—" if risk == 0 else "⚠" * min(risk, 5)
            lines.append(f"### {heading}  ·  risk {risk}/5 {risk_label}")
            lines.append("")
            if a.summary:
                lines.append(a.summary)
            for issue in a.uk_issues:
                sev = _SEVERITY_LABEL.get(issue.severity, issue.severity)
                ref = f" ({issue.statute_ref})" if issue.statute_ref else ""
                lines.append(
                    f"- [{sev}] {issue.category}{ref}: {issue.description}"
                )
            if a.posture_note:
                lines.append("")
                lines.append(f"*{a.posture_note}*")
            lines.append("")

    # ----- Redlines (paragraphs, not tables — see module docstring) ----
    if result.redlines:
        lines.append("")
        lines.append("## Redlines")
        lines.append("")
        lines.append(
            "Suggested replacement wording per flagged clause. Priorities: "
            "MUST (deal-blocking), Suggested (improvement), Nice-to-have (tidy)."
        )
        for r in result.redlines:
            label = _PRIORITY_LABEL.get(r.priority, r.priority)
            lines.append("")
            lines.append(f"### {r.clause_id}  ·  {label}")
            lines.append("")
            lines.append("**Original:**")
            lines.append("")
            lines.append(r.original_text or "*(no original text — clause to be inserted)*")
            lines.append("")
            lines.append("**Suggested:**")
            lines.append("")
            lines.append(r.suggested_text or "*(no suggested text)*")
            if r.explanation:
                lines.append("")
                lines.append(f"*Why:* {r.explanation}")

    # ----- Pipeline stages ---------------------------------------------
    lines.append("")
    lines.append("## Pipeline stages")
    lines.append("")
    for st in result.stages:
        err = f" · {len(st.errors)} errors" if st.errors else ""
        lines.append(
            f"- {st.name}: {st.status} · {st.duration_ms / 1000:.1f}s · "
            f"{st.token_count} tok{err}"
        )

    return "\n\n".join(lines)
