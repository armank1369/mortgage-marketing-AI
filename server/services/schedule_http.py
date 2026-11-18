from flask import Blueprint, Response, g, jsonify, request

from auth.permissions import require_capability
from auth.workspace_context import require_workspace
from errors import ValidationError
from repositories import schedule
from validation import json_object

blueprint = Blueprint("schedule", __name__)


@blueprint.get("/api/calendar")
@require_workspace
@require_capability("workspace:read")
def read():
    # Revalidate only after membership checks. Browser caches are private to the signed-in scope.
    known = request.if_none_match.as_set()
    version, result = schedule.snapshot(g.workspace_id, next(iter(known)) if len(known) == 1 else None)
    response = jsonify(result) if result is not None else Response(status=304)
    response.set_etag(version)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@blueprint.post("/api/calendar")
@require_workspace
@require_capability("chat:write")
def write():
    request.max_content_length = 2 * 1024 * 1024
    expected = request.if_match.as_set()
    if len(expected) != 1:
        raise ValidationError("Supply the last calendar revision in If-Match.")
    schedule.mutate(g.workspace_id, g.workspace_context["workspace_member_id"], expected.pop(), json_object())
    return "", 204
