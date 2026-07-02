"""Application settings — environment-driven."""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Core
    environment: str = "development"
    debug: bool = True

    # Database
    postgres_dsn: str = "postgresql+psycopg://legalise:legalise@db:5432/legalise"

    # Cache / queue
    redis_url: str = "redis://redis:6379/0"

    # Storage (MinIO / S3-compatible)
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "legalise"
    s3_secret_key: str = "legalisesecret"
    s3_bucket: str = "legalise-docs"
    s3_region: str = "eu-west-2"

    # Document conversion
    gotenberg_url: str = "http://gotenberg:3000"

    # AI providers
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    ollama_url: str = "http://ollama:11434"
    # Sonnet is the recommended default: strong quality at materially lower
    # cost and latency than Opus, and it answers matter questions cleanly
    # (Opus 4.7 was the legacy default and tended to deflect). A user's own
    # default_model_id, then an explicit per-matter choice, override this.
    default_model_id: str = "claude-sonnet-4-6"

    # Retrieval embedding backend. "fastembed" (default) runs a local,
    # keyless ONNX model (BAAI/bge-small-en-v1.5, 384-dim) so privileged
    # content is never sent to a third party to be indexed. "hash" is a
    # deterministic, dependency-free fallback for tests / keyless CI.
    embedding_backend: str = Field(
        default="fastembed", alias="LEGALISE_EMBEDDING_BACKEND"
    )

    # Auth — fastapi-users with cookie transport + DatabaseStrategy.
    # SESSION_SECRET signs short-lived JWTs for email-verify and
    # password-reset flows (cookie sessions are validated against the
    # `access_token` table, not via JWT). Override in production via Fly secret.
    session_secret: str = "change-me-in-deployment"
    # Cookie session lifetime in seconds (default 7 days).
    session_lifetime_seconds: int = 60 * 60 * 24 * 7
    # Cookie name. Httponly + Secure + SameSite=Lax are enforced in code.
    session_cookie_name: str = "legalise_session"
    # Secure cookies are required in production; dev runs over plain http.
    session_cookie_secure: bool = False

    # API key encryption — master key for AES-256-GCM of user_api_keys.
    # Must be 32 bytes hex-encoded (64 chars). In production, missing or
    # empty value causes the app to refuse to boot. Dev gets a
    # generated-on-boot key when missing.
    key_encryption_secret: str | None = Field(default=None, alias="LEGALISE_KEY_ENCRYPTION_SECRET")
    # Server-key fallback for the model gateway. When true *and* environment
    # is dev/development/local, ModelGateway.call() may use the server-level
    # provider key if the user hasn't added one. Production reads this as
    # false regardless of value (enforced in gateway code).
    allow_server_key_fallback: bool = Field(
        default=False, alias="LEGALISE_ALLOW_SERVER_KEY_FALLBACK"
    )
    # Firm role gates. When true, the law-firm role
    # hierarchy is enforced: B_mixed matters require qualified_solicitor
    # (posture gate) and advice-boundary tiers enforce their role rules.
    # When false (the default for local/hosted/eval), those gates go
    # DORMANT — any authenticated user can run B_mixed matters — so an
    # evaluator doesn't have to learn the solicitor hierarchy to use the
    # demo. C_paused stays a hard stop regardless. The substrate (roles,
    # posture/advice primitives, admin role pages, audit) is unchanged;
    # this only toggles enforcement. Named setting, NOT inferred from
    # ENVIRONMENT, so support/debugging is unambiguous.
    firm_role_gates_enabled: bool = Field(
        default=False, alias="LEGALISE_FIRM_ROLE_GATES_ENABLED"
    )
    # Author≠signer rule (deployable four-eyes). When true, a signer may
    # not sign (signed / signed_with_observations) an artifact they
    # authored — a second account must take ownership. Rejecting your own
    # work stays allowed: refusal is always permitted. Default False
    # preserves the sole-practitioner hero loop (author self-sign,
    # labelled via signer_is_author rather than hidden).
    signoff_author_must_differ: bool = Field(
        default=False, alias="SIGNOFF_AUTHOR_MUST_DIFFER"
    )
    # Local/eval convenience only: when true in a dev environment, the
    # first registered user is promoted to workspace admin. Production
    # ignores the flag so a hosted deployment cannot accidentally open
    # an admin path through env drift.
    dev_auto_admin_first_user: bool = Field(
        default=False, alias="LEGALISE_DEV_AUTO_ADMIN_FIRST_USER"
    )

    # Email — Resend transactional provider.
    resend_api_key: str | None = None
    email_from: str = "Legalise <no-reply@legalise.dev>"
    # Path-form (not hash-form) — the SPA routes are path-based; the
    # `#/auth/verify` shape only survives via a legacy-hash rewrite shim
    # and shows an ugly interstitial URL. Production overrides these to
    # https://legalise.dev/auth/{verify,reset}.
    email_verify_url_base: str = "http://localhost:5173/auth/verify"
    password_reset_url_base: str = "http://localhost:5173/auth/reset"

    # CORS. Override with the CORS_ORIGINS env var as a JSON array, e.g.
    # CORS_ORIGINS='["https://legalise.dev","http://localhost:3000"]'.
    # The live demo's frontend at legalise.dev calls the backend at
    # api.legalise.dev, so the demo origin must be in this list for the
    # cross-origin POST/SSE/fetch shapes to succeed. Self-host with both
    # frontend and backend on the same origin (compose proxy) does not
    # need the override.
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "https://legalise.dev"]
    )

    # Matter filesystem materialisation
    matters_root: str = "/data/matters"

    # Optional GitHub token for the external skill importers (Lawve,
    # GitHub-repo). Read-only use: raises the API rate limit. Accepts the
    # legacy GITHUB_SUBMISSION_TOKEN env name so existing deployments
    # keep working after the submissions flow was removed.
    github_read_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "GITHUB_READ_TOKEN", "GITHUB_SUBMISSION_TOKEN"
        ),
    )



    # agent-kit eval adapter (POST /api/evals/agent) shared secret.
    # Unset (the default) disables the endpoint entirely — it returns
    # 503, mirroring how the old submissions flow gated on unset
    # config. Set via env AGENT_KIT_SECRET; the agent-kit runner sends
    # it in the X-Agent-Kit-Secret header.
    agent_kit_secret: str | None = Field(default=None, alias="AGENT_KIT_SECRET")

    # Retention enforcement. The sweeper (app.tools.retention_sweep) can run
    # on the worker as a daily arq cron, purging matters past retention_until
    # via the audited tombstone. OFF by default — it deletes data, so a
    # deployment opts in explicitly. `limit` caps the per-run blast radius
    # (longest-lapsed first); `hour` is the UTC hour the daily sweep runs.
    retention_sweep_enabled: bool = Field(
        default=False, alias="LEGALISE_RETENTION_SWEEP_ENABLED"
    )
    retention_sweep_limit: int = Field(
        default=50, alias="LEGALISE_RETENTION_SWEEP_LIMIT"
    )
    retention_sweep_hour: int = Field(
        default=3, alias="LEGALISE_RETENTION_SWEEP_HOUR"
    )

    # Privileged DSN for schema migrations (alembic). When the app role is
    # reduced-privilege (WORM role split: legalise_app lacks DDL and cannot
    # mutate audit_entries), set this to a role with DDL authority so
    # `alembic upgrade` works while the app stays restricted. Unset = use
    # postgres_dsn (single-role deployments).
    migration_dsn: str | None = Field(default=None, alias="MIGRATION_DSN")

    # Per-matter cumulative assistant token budget. 0 = no limit (the
    # default). When > 0, a new assistant turn is refused once the matter's
    # recorded token usage reaches the ceiling — the spend guard the audit
    # already has the data for. Per-request output is bounded separately by
    # the gateway's max_tokens.
    matter_token_budget: int = Field(
        default=0, alias="LEGALISE_MATTER_TOKEN_BUDGET"
    )

    # Error tracking. Unset (default) disables it entirely — no SDK init, no
    # network. Set SENTRY_DSN to capture unhandled exceptions; the sample
    # rate controls performance tracing (0 = errors only).
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(
        default=0.0, alias="SENTRY_TRACES_SAMPLE_RATE"
    )

    # Unit 8 — observability
    # Log format: "console" (human-readable, default) or "json" (log drain).
    log_format: str = "console"
    # Optional structured-log drain endpoint. No content is forwarded until
    # a future adapter wires this up; the setting documents the intended
    # integration point. Leave unset in dev.
    logs_endpoint: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
