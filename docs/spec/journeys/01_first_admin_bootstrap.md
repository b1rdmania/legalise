# Journey 01 — First admin bootstrap (CLI surface)

The in-CLI half of Journey 00 — the part the UI doesn't see.

## Preconditions

- User registered via `POST /auth/register`; `is_superuser=false`.
- No other superusers exist.

## Goal

The newly-registered user becomes the workspace's first admin without DBA access.

## Trigger

Operator runs the CLI from the host:

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -m app.tools.bootstrap_admin \
    --email <user-email> \
    --role workspace_admin
```

## Steps

1. CLI reads `POSTGRES_DSN` from env; opens an async session.
2. Validates `--role` in `{solicitor, qualified_solicitor, workspace_admin}` → raises `BootstrapError(EXIT_INVALID_ROLE=5)` if not.
3. Looks up target user by email → `BootstrapError(EXIT_USER_NOT_FOUND=2)` if absent.
4. Checks for existing superuser → `BootstrapError(EXIT_SUPERUSER_EXISTS=3)` if found and `--force` absent.
5. (Only with `--force`) verifies `LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true` → `BootstrapError(EXIT_FORCE_REQUIRES_ENV=4)` if not.
6. Mutates `User.is_superuser = True`; optionally `User.role` per the flag.
7. Writes `user.admin.bootstrapped` audit row with `actor_id=None`.
8. Commits + prints success line to stdout.

## Audit emissions

| Step | Action | Audit row |
| --- | --- | --- |
| 7 | Bootstrap | `user.admin.bootstrapped` (payload: target_user_id, target_email, is_superuser_was, is_superuser_is, role_was, role_is, forced, bootstrapped_at) |

## Acceptance criteria

- [ ] CLI exits 0 on first-admin path.
- [ ] DB reflects `is_superuser=True`.
- [ ] Audit row landed; reconstruction view picks it up.
- [ ] Second-run without `--force` exits 3, no DB mutation.
- [ ] `--force` without env var exits 4, no DB mutation.

## Not covered

- HTTP variant of the bootstrap (Phase 12 explicitly CLI-only).
- Bulk bootstrap (one user per invocation).
- Demote a superuser — Phase 12 deliberately doesn't ship this; off-boarding stays on DB.
