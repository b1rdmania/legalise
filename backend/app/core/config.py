"""Application settings — environment-driven."""

from functools import lru_cache

from pydantic import Field
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
    default_model_id: str = "claude-opus-4-7"

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
    email_verify_url_base: str = "http://localhost:5173/#/auth/verify"
    password_reset_url_base: str = "http://localhost:5173/#/auth/reset"

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

    # claude-for-uk-legal plugin suite checkout. Bind-mounted into the
    # backend container in dev (see infra/docker-compose.yml).
    plugins_root: str = "/plugins"
    plugins_repo: str | None = "https://github.com/b1rdmania/claude-for-uk-legal"
    plugins_repo_ref: str | None = "f8201f1da72f6485c296eff620b19db18f016b68"

    # Public module submission flow. Opens a draft PR on
    # `b1rdmania/claude-for-uk-legal` via a fine-grained PAT scoped to that
    # repo only. PAT owner MUST be `b1rdmania` — NOT `ziggythebot`. The
    # endpoint degrades to 503 when the token is unset so the surface
    # cannot accidentally hit GitHub without a configured PAT. Turnstile
    # site/secret keys gate the unauthenticated POST against bots; in-memory
    # token bucket adds defense in depth on a single Fly instance. Redis
    # rate-limiting is v0.2 per docs/ROADMAP.md.
    submission_enabled: bool = True
    github_submission_token: str | None = None
    github_submission_repo: str = "b1rdmania/claude-for-uk-legal"
    github_submission_base_branch: str = "main"
    turnstile_site_key: str | None = None
    turnstile_secret_key: str | None = None
    submission_rate_limit_per_hour: int = 5


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
