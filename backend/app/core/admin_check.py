"""Workspace-admin gate for Phase 1 control-plane endpoints.

Used by registry endpoints (matter-context schemas, state-machine
definitions) where allowing arbitrary authenticated users to write
would let them squat or poison namespaces / module identities used by
first-party or firm-private modules.

Phase 1 gates on ``User.is_superuser`` as the workspace-admin proxy.
Phase 2 may introduce a finer-grained workspace role.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models import User


def require_admin(user: User, *, action_label: str) -> None:
    """Raise 403 ``admin_required`` if ``user`` is not a workspace admin.

    ``action_label`` is interpolated into the user-facing message so
    the frontend can show a specific reason ("state-machine definition
    registration requires workspace administrator privileges"). Same
    envelope across all admin-gated endpoints so the frontend can
    treat them uniformly.

    No-op for superusers.
    """
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "admin_required",
                "message": (
                    f"{action_label} requires workspace administrator "
                    "privileges"
                ),
            },
        )


__all__ = ["require_admin"]
