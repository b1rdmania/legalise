"""Transactional email — Resend with a strict-dev-only logging fallback.

Provider selection:
- `RESEND_API_KEY` set: send via Resend.
- Missing in a dev environment ({development, dev, local}): log a
  dev-shaped notice with only the link target (no PII, no token, no
  email body preview). Lets local signup/reset exercise end-to-end
  without a provider account.
- Missing in any other environment: raise. Production must NOT fall
  back to logs — the body contains verify/reset links that grant
  account access, and our log streams aren't a confidentiality
  boundary.

Auth-link bodies (verification, password reset) are sensitive and
never logged. The structured-log payload records the kind of email
sent and the destination domain only.
"""

from __future__ import annotations

import structlog

from app.core.config import settings
from app.core.encryption import _DEV_ENVIRONMENTS  # noqa: F401 — re-use the constant

logger = structlog.get_logger()

DEV_ENVIRONMENTS = {"development", "dev", "local"}


def _resend_enabled() -> bool:
    return bool(settings.resend_api_key)


def _domain_of(address: str) -> str:
    """Email domain only — used for log lines that must not include PII."""
    return address.split("@", 1)[-1] if "@" in address else "unknown"


class EmailDeliveryUnavailable(RuntimeError):
    """Raised in production when no email provider is configured."""


async def _send(kind: str, to: str, subject: str, html: str, text: str) -> None:
    if not _resend_enabled():
        if settings.environment not in DEV_ENVIRONMENTS:
            # Fail closed. We will NOT log verification/reset bodies in
            # production — the link is a credential.
            raise EmailDeliveryUnavailable(
                f"email provider not configured (kind={kind}); set RESEND_API_KEY"
            )
        # Dev-only log: kind + recipient domain. No body, no token, no
        # subject (which can encode user state).
        logger.info("email.dev_log", kind=kind, to_domain=_domain_of(to))
        return

    # resend SDK is synchronous; call it inline. Volumes at v0.1 launch
    # don't justify a worker — and signup is rate-limited by fastapi-users.
    import resend

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            }
        )
        logger.info("email.sent", kind=kind, to_domain=_domain_of(to))
    except Exception as exc:
        # No email contents in the error log either.
        logger.error("email.send_failed", kind=kind, to_domain=_domain_of(to), error=str(exc))
        raise


def _render_html(
    *,
    heading: str,
    body_paragraphs: list[str],
    cta_label: str,
    cta_link: str,
    footer_lines: list[str],
) -> str:
    """Paper-ink transactional email body. Table-based for legacy clients,
    inline styles only (most email clients strip <style>). No images.
    Mirrors docs/DESIGN.md tokens at the level email clients support: ink
    on paper, JetBrains Mono CTA, no rounded corners, hairline rules.
    """
    body_html = "".join(
        f'<p style="margin:0 0 16px 0;color:#4B5563;font-size:16px;line-height:1.6">{p}</p>'
        for p in body_paragraphs
    )
    footer_html = "".join(
        f'<p style="margin:0 0 8px 0;color:#9CA3AF;font-size:13px;line-height:1.5">{line}</p>'
        for line in footer_lines
    )
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        f'<title>{heading}</title></head>'
        '<body style="margin:0;padding:0;background:#F4F4F4;'
        'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Inter,sans-serif">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'width="100%" style="background:#F4F4F4;padding:40px 16px">'
        '<tr><td align="center">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'width="560" style="max-width:560px;background:#FFFFFF;'
        'border:1px solid #E5E5E5">'
        # Wordmark strip
        '<tr><td style="padding:24px 32px;border-bottom:1px solid #E5E5E5">'
        '<span style="font-size:11px;font-weight:700;letter-spacing:0.2em;'
        'color:#9CA3AF;text-transform:uppercase">LEGALISE</span>'
        '</td></tr>'
        # Heading
        '<tr><td style="padding:32px 32px 8px 32px">'
        f'<h1 style="margin:0 0 24px 0;color:#181818;font-size:24px;'
        'line-height:1.2;letter-spacing:-0.02em;font-weight:700">'
        f'{heading}</h1>'
        f'{body_html}'
        '</td></tr>'
        # CTA
        '<tr><td style="padding:8px 32px 32px 32px">'
        f'<a href="{cta_link}" '
        'style="display:inline-block;background:#181818;color:#FFFFFF;'
        'text-decoration:none;font-size:14px;font-weight:500;'
        'padding:12px 20px;font-family:\'JetBrains Mono\',ui-monospace,monospace">'
        f'{cta_label}'
        '</a>'
        f'<p style="margin:16px 0 0 0;color:#9CA3AF;font-size:13px;line-height:1.5">'
        f'Or copy this URL into your browser:<br>'
        f'<span style="color:#4B5563;word-break:break-all">{cta_link}</span></p>'
        '</td></tr>'
        # Footer
        '<tr><td style="padding:20px 32px;border-top:1px solid #E5E5E5;'
        'background:#F4F4F4">'
        f'{footer_html}'
        '</td></tr>'
        '</table>'
        '</td></tr></table></body></html>'
    )


def _render_text(*, body_paragraphs: list[str], cta_label: str, cta_link: str, footer_lines: list[str]) -> str:
    body = "\n\n".join(body_paragraphs)
    footer = "\n".join(footer_lines)
    return (
        f"{body}\n\n"
        f"{cta_label}:\n{cta_link}\n\n"
        f"--\n{footer}\n"
        "Legalise — github.com/b1rdmania/legalise"
    )


async def send_verification(to: str, link: str) -> None:
    subject = "Confirm your Legalise account"
    body_paragraphs = [
        "Welcome to Legalise — the open-source UK legal AI workspace.",
        "Confirm your email below to activate your account. After that "
        "you can sign in, add a provider API key, and open the seeded "
        "Khan v Acme demo matter.",
    ]
    footer_lines = [
        "If you didn't sign up, ignore this message — no account will be created without confirmation.",
        "This link expires shortly after issue.",
    ]
    html = _render_html(
        heading="Confirm your email",
        body_paragraphs=body_paragraphs,
        cta_label="Confirm email",
        cta_link=link,
        footer_lines=footer_lines,
    )
    text = _render_text(
        body_paragraphs=body_paragraphs,
        cta_label="Confirm email",
        cta_link=link,
        footer_lines=footer_lines,
    )
    await _send("verification", to, subject, html, text)


async def send_password_reset(to: str, link: str) -> None:
    subject = "Reset your Legalise password"
    body_paragraphs = [
        "A password reset was requested for your Legalise account.",
        "Use the link below within the next hour to choose a new password. "
        "Your current password remains valid until you complete the reset.",
    ]
    footer_lines = [
        "If you didn't request this, ignore this message — your password won't change.",
        "If reset links keep arriving and you didn't ask for them, sign in and review recent activity in your audit log.",
    ]
    html = _render_html(
        heading="Reset your password",
        body_paragraphs=body_paragraphs,
        cta_label="Reset password",
        cta_link=link,
        footer_lines=footer_lines,
    )
    text = _render_text(
        body_paragraphs=body_paragraphs,
        cta_label="Reset password",
        cta_link=link,
        footer_lines=footer_lines,
    )
    await _send("password_reset", to, subject, html, text)
