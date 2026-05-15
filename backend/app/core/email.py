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
    await _send("verification", to, subject, html, text)


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
    await _send("password_reset", to, subject, html, text)
