"""
server/auth/workspace_context.py
Step F.10: Connects Step E authenticated identity to authorized workspace scope.
Enforces multi-tenant authorization using public.workspace_member with strict environment gates.
"""

import logging
from functools import wraps
from typing import Optional, Dict, Any
from flask import request, g

from db.connection import get_db_cursor
from errors import WorkspaceAccessDeniedError, DatabaseUnavailableError
from logging_utils import log_db_operation

logger = logging.getLogger(__name__)


def resolve_user_workspace(auth_user_id: str, requested_workspace_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolves a verified auth_user_id into an authorized workspace.
    Uses public.workspace_member(auth_user_id, workspace_id, role).
    """
    if not auth_user_id:
        raise WorkspaceAccessDeniedError("Missing authenticated user identity.")

    try:
        with get_db_cursor() as cursor:
            # 1. Look up explicit membership in public.workspace_member
            if requested_workspace_id:
                query = """
                    SELECT wm.workspace_id, w.name AS workspace_name, wm.role
                    FROM public.workspace_member wm
                    JOIN public.workspace w ON w.id = wm.workspace_id
                    WHERE wm.auth_user_id = %s
                      AND wm.workspace_id = %s
                    LIMIT 1;
                """
                cursor.execute(query, (auth_user_id, requested_workspace_id))
            else:
                query = """
                    SELECT wm.workspace_id, w.name AS workspace_name, wm.role
                    FROM public.workspace_member wm
                    JOIN public.workspace w ON w.id = wm.workspace_id
                    WHERE wm.auth_user_id = %s
                    ORDER BY wm.created_at ASC
                    LIMIT 1;
                """
                cursor.execute(query, (auth_user_id,))

            member_row = cursor.fetchone()

            if member_row:
                ws_id = str(member_row["workspace_id"])
                log_db_operation(
                    "resolve_user_workspace",
                    workspace_id=ws_id,
                    status="success_membership",
                    extra={"role": member_row["role"]}
                )
                return {
                    "workspace_id": ws_id,
                    "workspace_name": member_row["workspace_name"],
                    "role": member_row["role"],
                    "auth_user_id": auth_user_id
                }

            # Only actual workspace membership grants access. No implicit admin
            # access to the development workspace for otherwise unknown users.
            # Reject unauthorized foreign workspace or users with no membership
            if requested_workspace_id:
                logger.warning("Unauthorized workspace selection denied")
                raise WorkspaceAccessDeniedError("Access to the requested workspace is forbidden.")

    except WorkspaceAccessDeniedError:
        raise
    except Exception as e:
        # Do not log user identifiers, query arguments, or raw DB exception text.
        logger.error("Workspace membership lookup failed: %s", type(e).__name__)
        raise DatabaseUnavailableError("Failed to resolve workspace membership.") from e

    raise WorkspaceAccessDeniedError("User does not have an active membership in any workspace.")


def require_workspace(f):
    """Verify the Neon Auth bearer JWT, then authorize workspace membership.

    The identity must come from Step E's signature/claims verification, never
    a caller-provided user-id header or an unverified Flask request context.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Import here to preserve the existing lazy-import startup behavior.
        from auth_utils import authenticate_request

        failure = authenticate_request()
        if failure is not None:
            return failure  # Same 401 / 500 / 503 response as Step E.

        requested_ws = request.headers.get("X-Workspace-Id") or request.args.get("workspace_id")
        context = resolve_user_workspace(auth_user_id, requested_workspace_id=requested_ws)
        g.workspace_id = context["workspace_id"]
        g.workspace_context = context
        return f(*args, **kwargs)
    return decorated_function
        auth_user_id = g.auth_user_id  # Set only after verified JWT claims.
