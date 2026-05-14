"""Transactional email — Resend with a logging fallback for dev.

The provider is selected at import time by `RESEND_API_KEY` presence.
In dev without a key, links are logged to stdout so signup/reset flows
can still be exercised end-to-end without a real provider.
"""

from __future__ import annotations

import structlog

from app.core.config import settings

logger = structlog.get_logger()


def _resend_enabled() -> bool:
    return bool(settings.resend_api_key)


async def _send(to: str, subject: str, html: str, text: str) -> None:
    if not _resend_enabled():
        logger.info(
            "email.dev_log",
            to=to,
            subject=subject,
            body_text_preview=text[:200],
        )
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
        logger.info("email.sent", to=to, subject=subject)
    except Exception as exc:
        logger.error("email.send_failed", to=to, error=str(exc))


async def send_verification(to: str, link: str) -> None:
    subject = "Confirm your Legalise account"
    text = (
        "Welcome to Legalise.\n\n"
        f"Confirm your email by opening this link:\n{link}\n\n"
        "If you didn't sign up, ignore this message."
    )
    html = (
        f"<p>Welcome to Legalise.</p>"
        f"<p>Confirm your email by opening "
        f"<a href=\"{link}\">this link</a>.</p>"
        f"<p>If you didn't sign up, ignore this message.</p>"
    )
    await _send(to, subject, html, text)


async def send_password_reset(to: str, link: str) -> None:
    subject = "Reset your Legalise password"
    text = (
        "A password reset was requested for your Legalise account.\n\n"
        f"Reset it here:\n{link}\n\n"
        "If you didn't request this, ignore this message."
    )
    html = (
        f"<p>A password reset was requested for your Legalise account.</p>"
        f"<p>Reset it by opening <a href=\"{link}\">this link</a>.</p>"
        f"<p>If you didn't request this, ignore this message.</p>"
    )
    await _send(to, subject, html, text)
