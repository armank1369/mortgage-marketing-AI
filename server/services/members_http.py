"""Users tab API. Every route re-checks the caller's role in the database; hiding the tab is only a courtesy."""
from flask import Blueprint, g, jsonify

from auth.workspace_context import require_workspace
from errors import PermissionDeniedError
from repositories import members_repository
from services import members as policy
from validation import json_object

blueprint = Blueprint("members", __name__)


def _guard():
    if not policy.can_manage(g.workspace_context["role"]):
        raise PermissionDeniedError()


def _no_store(payload, status=200):
    response = jsonify(payload)
    response.status_code = status
    response.headers["Cache-Control"] = "private, no-store"
    return response


def _optional_role(value):
    if value is None:
        return None
    return policy.check_role_value(value)


@blueprint.get("/api/members")
@require_workspace
def read():
    _guard()
    return _no_store(members_repository.list_people(g.workspace_id, g.workspace_context["workspace_member_id"]))


@blueprint.put("/api/members/<member_id>/role")
@require_workspace
def update_role(member_id):
    _guard()
    data = json_object()
    result = members_repository.change_role(
        g.workspace_id, g.workspace_context["workspace_member_id"], member_id,
        policy.check_role_value(data.get("role")), _optional_role(data.get("expected_role")))
    return _no_store(result)


@blueprint.post("/api/members")
@require_workspace
def grant():
    _guard()
    data = json_object()
    result = members_repository.grant_access(
        g.workspace_id, g.workspace_context["workspace_member_id"], data.get("auth_user_id"),
        policy.check_role_value(data.get("role")))
    return _no_store(result, 201)
