# Troubleshooting

**Status:** stub. Full failure guide lands in Phase 16 E.

This file will catalogue the common setup errors a forker can hit
locally, sourced from the actual Phase 15 hardening cycle so the
fixes are real:

- `POSTGRES_DSN` set in shell but backend hits the default DB
- `auth.user.*` audit rows missing from a matter timeline
- `vite preview` not proxying `/api`
- `bootstrap_admin` exiting with usage error
- Audit reconstruction empty for a user who just got CLI-promoted

Each entry will follow symptom → diagnosis → fix.

Until then, [`legalise doctor`](../README.md#try-it) is the first stop
when something looks wrong.
