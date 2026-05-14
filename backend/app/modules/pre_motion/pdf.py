"""Pre-Motion PDF rendering — synthesis envelope → HTML → Gotenberg → bytes.

The HTML template is intentionally minimal Oxide-register-styled markup so
the PDF reads as the same artefact the workspace renders. Gotenberg
Chromium converts the HTML to PDF; we POST a single-file multipart upload
to the Chromium `forms/chromium/convert/html` route.
"""

from __future__ import annotations

import html
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.models import Matter

from .schemas import PreMotionRunResult


def _esc(value: str | None) -> str:
    return html.escape(value or "")


def _render_html(matter: Matter, result: PreMotionRunResult) -> str:
    """Render the run envelope to a print-shaped HTML document.

    Stays in the Oxide register but uses print-friendly CSS — light surfaces,
    dark text, no terminal cursor. Designed to look like a solicitor's brief
    rather than a terminal screenshot.
    """
    synthesis = result.synthesis
    verdict_colour = {
        "steelman": "#00875f",
        "strawman": "#b3261e",
    }.get(synthesis.verdict, "#3a3a3a")

    stage_rows = "".join(
        f"<tr><td>{_esc(s.name)}</td><td>{s.sub_agent_count}</td>"
        f"<td>{s.duration_ms / 1000:.1f}s</td><td>{s.token_count}</td>"
        f"<td>{len(s.errors)}</td></tr>"
        for s in result.stages
    )

    failure_html = "".join(
        f"<li><strong>{_esc(fs.category)}</strong> · prob {fs.probability} · "
        f"impact {fs.impact}<br/>{_esc(fs.scenario)}"
        + (f"<br/><em>Mitigation —</em> {_esc(fs.mitigation)}" if fs.mitigation else "")
        + "</li>"
        for fs in synthesis.failure_scenarios
    )

    blind_html = "".join(f"<li>{_esc(bs)}</li>" for bs in synthesis.blind_spots)
    inconsistency_html = "".join(
        f"<li><strong>[{_esc(ei.severity)}]</strong> {_esc(ei.claim)} — {_esc(ei.issue)}</li>"
        for ei in synthesis.evidence_inconsistencies
    )

    rendered_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Pre-Motion brief — {_esc(matter.title)}</title>
<style>
  @page {{ size: A4; margin: 22mm 18mm; }}
  body {{ font-family: "Inter", "Helvetica Neue", Arial, sans-serif; font-size: 11pt;
          color: #1f2124; line-height: 1.45; }}
  h1 {{ font-size: 22pt; margin: 0 0 6pt 0; font-weight: 400; }}
  h2 {{ font-size: 13pt; margin: 16pt 0 6pt 0; font-weight: 400;
        border-bottom: 1px solid #c9c9c9; padding-bottom: 3pt; }}
  .meta {{ font-family: "Courier New", monospace; font-size: 9pt; color: #5d5e61;
           letter-spacing: 0.04em; margin-bottom: 14pt; }}
  .verdict {{ display: inline-block; padding: 2pt 6pt; border: 1px solid {verdict_colour};
              color: {verdict_colour}; font-family: "Courier New", monospace;
              font-size: 10pt; text-transform: uppercase; letter-spacing: 0.06em; }}
  blockquote {{ border-left: 2pt solid #b3261e; margin: 10pt 0; padding-left: 10pt;
                font-style: italic; font-size: 12pt; color: #1f2124; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 10pt; }}
  th, td {{ border: 1px solid #d4d4d4; padding: 4pt 6pt; text-align: left; }}
  th {{ background: #f3f3f3; font-weight: 400; text-transform: uppercase;
        font-family: "Courier New", monospace; font-size: 9pt; letter-spacing: 0.04em; }}
  ul {{ padding-left: 18pt; }}
  li {{ margin-bottom: 5pt; }}
  footer {{ margin-top: 24pt; padding-top: 6pt; border-top: 1px solid #d4d4d4;
            font-family: "Courier New", monospace; font-size: 9pt; color: #5d5e61; }}
</style>
</head>
<body>
  <h1>Pre-Motion — {_esc(matter.title)}</h1>
  <div class="meta">
    matter: {_esc(matter.slug)} · type: {_esc(matter.matter_type)} ·
    rendered: {rendered_at} · model: {_esc(result.model_used)} ·
    tokens: {result.total_token_count} · duration: {result.total_duration_ms / 1000:.1f}s
  </div>

  <h2>Verdict</h2>
  <p><span class="verdict">{_esc(synthesis.verdict)}</span></p>
  <p>{_esc(synthesis.verdict_reasoning)}</p>
  {f'<blockquote>{_esc(synthesis.if_we_lose_this_will_be_why)}</blockquote>' if synthesis.if_we_lose_this_will_be_why else ''}

  <h2>Summary</h2>
  <p style="white-space: pre-wrap;">{_esc(synthesis.summary)}</p>

  <h2>Pipeline stages</h2>
  <table><thead><tr><th>stage</th><th>calls</th><th>duration</th><th>tokens</th><th>errors</th></tr></thead>
  <tbody>{stage_rows}</tbody></table>

  {f'<h2>Failure scenarios</h2><ul>{failure_html}</ul>' if failure_html else ''}
  {f'<h2>Blind spots</h2><ul>{blind_html}</ul>' if blind_html else ''}
  {f'<h2>Evidence inconsistencies</h2><ul>{inconsistency_html}</ul>' if inconsistency_html else ''}

  <footer>
    Legalise v{settings.app_version if hasattr(settings, "app_version") else "0.1.0a0"} ·
    Pre-Motion adversarial premortem · {rendered_at}
  </footer>
</body>
</html>"""


async def render_pre_motion_pdf(*, matter: Matter, result: PreMotionRunResult) -> bytes:
    """POST the rendered HTML to Gotenberg's Chromium convert route."""
    html_doc = _render_html(matter, result)

    files = {"files": ("index.html", html_doc, "text/html")}
    url = f"{settings.gotenberg_url.rstrip('/')}/forms/chromium/convert/html"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, files=files)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Gotenberg unreachable at {url}: {exc}") from exc

    if resp.status_code != 200:
        raise RuntimeError(
            f"Gotenberg returned {resp.status_code}: {resp.text[:200]}"
        )
    return resp.content
