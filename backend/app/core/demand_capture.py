"""Demand-capture vocabulary + email-domain classification (Gate 4).

Launch-day instrumentation: who is signing up, and through which
channel. Three rules keep this honest:

1. Everything self-reported is **optional** — persona and channel are
   nullable; an invalid value is silently dropped, never a signup
   blocker. No dark patterns, no required marketing fields.
2. The only derived field is the email domain, computed **server-side**
   from the address the user already gave us. We store the raw domain
   plus a coarse class (firm-like vs generic mail provider). The class
   is a heuristic allowlist of consumer providers, nothing cleverer —
   "firm-like" means "not a known generic mailbox", not "verified firm".
3. Channel tags are a tiny locked vocabulary (`?c=hn|li|x|conf`), so the
   funnel query is a GROUP BY, not a parsing exercise.
"""

from __future__ import annotations

# Self-reported persona vocabulary. Mirrors the signup <select>.
PERSONAS: frozenset[str] = frozenset(
    {
        "practising_solicitor",
        "in_house",
        "legal_ops",
        "engineer",
        "other",
    }
)

# Launch channel tags (?c=...). Documented in docs/OPERATIONS.md §Launch.
CHANNELS: frozenset[str] = frozenset({"hn", "li", "x", "conf"})

DOMAIN_CLASS_FIRM = "firm-like"
DOMAIN_CLASS_GENERIC = "generic"

# Consumer / generic mail providers. Deliberately a short, obvious list —
# the point is to separate "someone at a firm/org" from "personal inbox",
# not to fingerprint employers.
GENERIC_EMAIL_DOMAINS: frozenset[str] = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "outlook.com",
        "outlook.co.uk",
        "hotmail.com",
        "hotmail.co.uk",
        "live.com",
        "live.co.uk",
        "msn.com",
        "yahoo.com",
        "yahoo.co.uk",
        "ymail.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "proton.me",
        "protonmail.com",
        "pm.me",
        "aol.com",
        "gmx.com",
        "gmx.net",
        "mail.com",
        "fastmail.com",
        "fastmail.fm",
        "hey.com",
        "zoho.com",
        "yandex.com",
        "yandex.ru",
        "tutanota.com",
        "tuta.com",
        "tuta.io",
        "duck.com",
        "qq.com",
        "163.com",
        "126.com",
    }
)


def normalise_persona(value: str | None) -> str | None:
    """Allowlisted persona or None. Never raises — analytics must not
    break signup."""
    if not value:
        return None
    token = value.strip().lower()
    return token if token in PERSONAS else None


def normalise_channel(value: str | None) -> str | None:
    """Allowlisted channel tag or None. Never raises."""
    if not value:
        return None
    token = value.strip().lower()
    return token if token in CHANNELS else None


def classify_email_domain(email: str) -> tuple[str | None, str | None]:
    """Return ``(raw_domain, domain_class)`` for an email address.

    domain_class is ``generic`` when the domain is a known consumer
    provider, else ``firm-like``. Malformed input → ``(None, None)``.
    """
    if not email or "@" not in email:
        return None, None
    domain = email.rsplit("@", 1)[1].strip().lower().rstrip(".")
    if not domain:
        return None, None
    klass = (
        DOMAIN_CLASS_GENERIC
        if domain in GENERIC_EMAIL_DOMAINS
        else DOMAIN_CLASS_FIRM
    )
    return domain, klass
