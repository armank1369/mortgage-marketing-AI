"""Verified JWT -> current membership -> authorized workspace, without cached grants."""
import logging
from functools import wraps

from flask import request, g

from db.connection import get_db_cursor
from errors import (WorkspaceAccessDeniedError, DatabaseUnavailableError,
                    WorkspaceSelectionRequiredError, ValidationError)
from validation import uuid_string
from auth.permissions import ROLE_CAPABILITIES

logger = logging.getLogger(__name__)


def list_user_workspaces(auth_user_id):
    """Return zero or more memberships; never assign a default membership.

    Removed memberships are denied immediately. The approved optional revoked_at
    design is read through to_jsonb: no column is assumed to exist and no schema
    change is performed. Deployment readiness still requires live verification.
    """
    if not auth_user_id:
        raise WorkspaceAccessDeniedError("Missing authenticated user identity.")
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT wm.id AS workspace_member_id, wm.workspace_id,
                       w.name AS workspace_name, w.environment, wm.role,
                       to_jsonb(wm)->>'revoked_at' AS revoked_at
                FROM public.workspace_member wm
                JOIN public.workspace w ON w.id = wm.workspace_id
                WHERE wm.auth_user_id = %s
                ORDER BY wm.created_at, wm.id;
            """, (auth_user_id,))
            return [dict(row, workspace_id=str(row["workspace_id"]),
                         workspace_member_id=str(row["workspace_member_id"]),
                         auth_user_id=auth_user_id)
                    for row in cursor.fetchall()
                    if row["role"] in ROLE_CAPABILITIES and row.get("revoked_at") is None]
    except Exception as exc:
        logger.error("Workspace membership lookup failed: %s", type(exc).__name__)
        raise DatabaseUnavailableError("Failed to resolve workspace membership.") from exc


def resolve_user_workspace(auth_user_id, requested_workspace_id=None):
    if requested_workspace_id is not None:
        requested_workspace_id = uuid_string(requested_workspace_id, "workspace_id")
    memberships = list_user_workspaces(auth_user_id)
    if requested_workspace_id is not None:
        for context in memberships:
            if context["workspace_id"] == requested_workspace_id:
                return context
        raise WorkspaceAccessDeniedError()
    if not memberships:
        raise WorkspaceAccessDeniedError("No workspace membership is available.")
    if len(memberships) != 1:
        raise WorkspaceSelectionRequiredError()
    return memberships[0]


def requested_workspace():
    values = request.args.getlist("workspace_id")
    header = request.headers.get("X-Workspace-Id")
    if header is not None:
        values.append(header)
    normalized = [uuid_string(value, "workspace_id") for value in values]
    if len(set(normalized)) > 1 or len(request.args.getlist("workspace_id")) > 1:
        raise ValidationError("Conflicting or duplicate workspace selections.")
    return normalized[0] if normalized else None


def require_workspace(view):
    """Reuse Step E authentication; recheck membership for every request."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        from auth_utils import authenticate_request
        failure = authenticate_request()
        if failure is not None:
            return failure
        context = resolve_user_workspace(g.auth_user_id, requested_workspace())
        g.workspace_id = context["workspace_id"]
        g.workspace_context = context
        return view(*args, **kwargs)
    return wrapped
