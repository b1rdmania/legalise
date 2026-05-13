"""Audit middleware — every API call touching a matter is logged.

v0.1 stub. Real implementation lands Week 1 Day 3.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs requests against the audit trail.

    Day 3 of Week 1: extracts user, matter slug (if present in path), action verb from method,
    and writes an AuditEntry row. Pre-build placeholder lets the app boot.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # TODO(Week 1 Day 3): write AuditEntry row.
        return response
