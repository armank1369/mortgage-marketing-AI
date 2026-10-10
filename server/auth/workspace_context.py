"""
server/auth/workspace_context.py
Step F.10: Connects Step E authenticated identity to authorized workspace scope.
Enforces multi-tenant authorization using public.workspace_member with strict environment gates.
"""

import os
import logging
from functools import wraps
from typing import Optional, Dict, Any
from flask import request, g

from db.connection import get_db_cursor
from errors import WorkspaceAccessDeniedError, NotFoundError, DatabaseUnavailableError
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
                    extra={"auth_user_id": auth_user_id, "role": member_row["role"]}
                )
                return {
                    "workspace_id": ws_id,
                    "workspace_name": member_row["workspace_name"],
                    "role": member_row["role"],
                    "auth_user_id": auth_user_id
                }

            # 2. Gated Development Fallback
            # Only permitted when explicitly enabled in local development config
            allow_dev_fallback = os.getenv("ALLOW_DEV_WORKSPACE_FALLBACK", "").lower() in ("true", "1")
            is_dev_env = os.getenv("FLASK_ENV") == "development" or os.getenv("ENVIRONMENT") == "development"

            if allow_dev_fallback and is_dev_env:
                cursor.execute(
                    "SELECT id, name FROM public.workspace WHERE slug = 'lucie-development' LIMIT 1;"
                )
                default_ws = cursor.fetchone()
                if default_ws:
                    dev_ws_id = str(default_ws["id"])
                    if requested_workspace_id is None or requested_workspace_id == dev_ws_id:
                        log_db_operation(
                            "resolve_user_workspace",
                            workspace_id=dev_ws_id,
                            status="success_dev_default",
                            extra={"auth_user_id": auth_user_id}
                        )
                        return {
                            "workspace_id": dev_ws_id,
                            "workspace_name": default_ws["name"],
                            "role": "admin",
                            "auth_user_id": auth_user_id
                        }

            # Reject unauthorized foreign workspace or users with no membership
            if requested_workspace_id:
                logger.warning(
                    "Unauthorized workspace access attempted: auth_user=%s requested=%s",
                    auth_user_id,
                    requested_workspace_id
                )
                raise WorkspaceAccessDeniedError("Access to the requested workspace is forbidden.")

    except WorkspaceAccessDeniedError:
        raise
    except Exception as e:
        logger.error("Error resolving workspace for auth_user %s: %s", auth_user_id, str(e))
        raise DatabaseUnavailableError("Failed to resolve workspace membership.") from e

    raise WorkspaceAccessDeniedError("User does not have an active membership in any workspace.")


def require_workspace(f):
    """
    Flask route decorator.
    Enforces Step E JWT authentication first, then resolves the verified workspace_id.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 1. Check existing verified identity on Flask g
        auth_user_id = getattr(g, "auth_user_id", None)
        if not auth_user_id:
            try:
                from auth_utils import get_authenticated_user
                user = get_authenticated_user()
                if user:
                    auth_user_id = user.get("id") or user.get("sub")
                    g.auth_user_id = auth_user_id
            except Exception:
                pass

        # 2. Strict development bypass: only allowed if explicitly configured in development environment
        allow_dev_header = os.getenv("ALLOW_DEV_AUTH_BYPASS", "").lower() in ("true", "1")
        is_dev_env = os.getenv("FLASK_ENV") == "development" or os.getenv("ENVIRONMENT") == "development"

        if not auth_user_id and allow_dev_header and is_dev_env:
            auth_user_id = request.headers.get("X-Dev-Auth-User-Id")
            if auth_user_id:
                g.auth_user_id = auth_user_id

        if not auth_user_id:
            raise WorkspaceAccessDeniedError("Unauthenticated: Valid Neon Auth session or token required.")

        requested_ws = request.headers.get("X-Workspace-Id") or request.args.get("workspace_id")
        context = resolve_user_workspace(auth_user_id, requested_workspace_id=requested_ws)

        g.workspace_id = context["workspace_id"]
        g.workspace_context = context

        return f(*args, **kwargs)

    return decorated_function