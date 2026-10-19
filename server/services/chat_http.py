"""Creator-private durable chat HTTP adapters."""
from flask import Blueprint, jsonify, request, g, current_app

from auth.workspace_context import require_workspace
from auth.permissions import require_capability, check_capability
from errors import ValidationError
from repositories import chat_persistence_repository as chats
from services.chat_contract import (create_fields, patch_fields, operation_fields, only,
                                    page_limit, decode_cursor, MAX_BODY_BYTES, PROVIDER_ACTIONS)
from validation import json_object, uuid_string
from services.generation_operations import execute_operation, response_status

blueprint = Blueprint("durable_chats", __name__)


def body():
    request.max_content_length = MAX_BODY_BYTES
    return json_object()


def member_id():
    return g.workspace_context["workspace_member_id"]


def _unique_args(names):
    for name in names:
        if len(request.args.getlist(name)) > 1:
            raise ValidationError("Duplicate pagination parameter.")


def list_v2():
    _unique_args({"version", "archived", "limit", "cursor"})
    archived = request.args.get("archived", "false")
    if archived not in {"true", "false"}:
        raise ValidationError("archived must be true or false.")
    return jsonify(chats.list_sessions(g.workspace_id, member_id(), archived=archived == "true",
                                      limit=page_limit(request.args.get("limit"), 30),
                                      cursor=decode_cursor(request.args.get("cursor"))))


def detail_v2(session_id):
    _unique_args({"version", "limit", "before"})
    result = chats.get_session(g.workspace_id, uuid_string(session_id, "session_id"), member_id(),
                               limit=page_limit(request.args.get("limit"), 50),
                               before=decode_cursor(request.args.get("before")))
    response = jsonify(result)
    response.headers["ETag"] = result["etag"]
    return response


@blueprint.route("/api/chat/sessions/<session_id>", methods=["PUT"])
@require_workspace
@require_capability("chat:create")
def create(session_id):
    fields = create_fields(body())
    result, created = chats.create_session(g.workspace_id, uuid_string(session_id, "session_id"), member_id(), **fields)
    response = jsonify(result)
    response.status_code = 201 if created else 200
    response.headers["ETag"] = result["etag"]
    return response


@blueprint.route("/api/chat/sessions/<session_id>", methods=["PATCH"])
@require_workspace
@require_capability("chat:write")
def patch(session_id):
    result = chats.patch_session(g.workspace_id, uuid_string(session_id, "session_id"), member_id(),
                                  patch_fields(body()), request.headers.get("If-Match"))
    response = jsonify(result)
    response.headers["ETag"] = result["etag"]
    return response


@blueprint.route("/api/chat/sessions/<session_id>/operations", methods=["POST"])
@require_workspace
@require_capability("chat:write")
def submit(session_id):
    fields = operation_fields(body())
    session_id = uuid_string(session_id, "session_id")
    if fields["action"] in PROVIDER_ACTIONS:
        check_capability(g.workspace_context, "ai:generate")
        result = execute_operation(g.workspace_id, session_id, member_id(), fields,
                                   current_app.extensions["generation_runtime"])
    else:
        result = chats.shorten_operation(g.workspace_id, session_id, member_id(), fields)
    response = jsonify(result)
    response.status_code = response_status(result)
    response.headers["Location"] = f"/api/chat/sessions/{session_id}/operations/{fields['operation_key']}"
    return response


@blueprint.route("/api/chat/sessions/<session_id>/operations/<operation_key>", methods=["GET"])
@require_workspace
@require_capability("chat:read")
def status(session_id, operation_key):
    return jsonify(chats.get_operation(g.workspace_id, uuid_string(session_id, "session_id"), member_id(),
                                       uuid_string(operation_key, "operation_key")))


@blueprint.route("/api/chat/sessions/<session_id>/operations/<operation_key>/abandon", methods=["POST"])
@require_workspace
@require_capability("chat:write")
def abandon(session_id, operation_key):
    data = body()
    only(data, {"acknowledge_uncertain_outcome"})
    if data.get("acknowledge_uncertain_outcome") is not True:
        raise ValidationError("Acknowledge the uncertain outcome explicitly.")
    return jsonify(chats.abandon_operation(g.workspace_id, uuid_string(session_id, "session_id"), member_id(),
                                           uuid_string(operation_key, "operation_key"), acknowledged=True))
