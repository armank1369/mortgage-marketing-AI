"""Step J durable primitives. Short transactions; never imports/calls an AI provider.

All mutations lock membership before the creator-scoped session. Completion is an
internal service API, never an HTTP endpoint. JSON claim tokens are server-only.
"""
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from psycopg.types.json import Jsonb

from auth.permissions import check_capability
from db.connection import get_db_transaction
from errors import (NotFoundError, WorkspaceAccessDeniedError, ValidationError,
                    ChatConflictError, PreconditionRequiredError, PreconditionFailedError)
from services.chat_contract import (PROVIDER_ACTIONS, TYPES, canonical, text, metadata_etag,
                                    serialize, public_message, operation_state, input_hash,
                                    operation_fields, patch_fields, encode_cursor)
from validation import uuid_string

SESSION_COLUMNS = "id, workspace_id, created_by_member_id, default_persona_id, title, summary_status, started_at, updated_at, archived_at"
MESSAGE_COLUMNS = "id, session_id, author_member_id, persona_id, role, kind, mode, content, content_format, structured_data, compliance_flags, client_message_key, request_message_id, source_message_id, created_at"


def _contains_nul(value):
    if isinstance(value, str):
        return "\x00" in value
    if isinstance(value, dict):
        return any(_contains_nul(key) or _contains_nul(item) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_nul(item) for item in value)
    return False


def lock_member(cur, workspace_id, member_id, *capabilities):
    cur.execute("""SELECT wm.id, wm.role, w.environment
        FROM public.workspace_member wm JOIN public.workspace w ON w.id=wm.workspace_id
        WHERE wm.id=%s AND wm.workspace_id=%s
          AND (to_jsonb(wm)->>'revoked_at') IS NULL FOR SHARE OF wm""",
                (uuid_string(member_id, "member_id"), uuid_string(workspace_id, "workspace_id")))
    member = cur.fetchone()
    if not member:
        raise WorkspaceAccessDeniedError()
    for capability in capabilities:
        check_capability(member, capability)
    return member


def owned_session(cur, workspace_id, session_id, member_id, *, lock=False, include_archived=False):
    cur.execute(f"SELECT {SESSION_COLUMNS} FROM public.chat_session "
                "WHERE id=%s AND workspace_id=%s AND created_by_member_id=%s "
                + ("" if include_archived else "AND archived_at IS NULL ")
                + ("FOR UPDATE" if lock else "FOR SHARE"),
                (uuid_string(session_id, "session_id"), uuid_string(workspace_id, "workspace_id"),
                 uuid_string(member_id, "member_id")))
    row = cur.fetchone()
    if not row:
        raise NotFoundError("Conversation not found.")
    return dict(row)


def active_persona(cur, workspace_id, persona_id):
    cur.execute("SELECT id, name, slug FROM public.persona WHERE id=%s AND workspace_id=%s "
                "AND deleted_at IS NULL FOR SHARE", (uuid_string(persona_id, "persona_id"), workspace_id))
    row = cur.fetchone()
    if not row:
        raise NotFoundError("The selected persona is unavailable in this workspace.")
    return {k: str(row[k]) for k in ("id", "name", "slug")}


def session_dto(row):
    return dict(serialize(dict(row)), etag=metadata_etag(row))


def create_session(workspace_id, session_id, member_id, *, title, persona_id):
    title = text(title, "title", 200)
    workspace_id = uuid_string(workspace_id, "workspace_id")
    member_id = uuid_string(member_id, "member_id")
    session_id = uuid_string(session_id, "session_id")
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:create")
        # Check ownership before resolving persona on an idempotent replay.
        cur.execute(f"SELECT {SESSION_COLUMNS} FROM public.chat_session WHERE id=%s FOR UPDATE", (session_id,))
        existing = cur.fetchone()
        if existing:
            if str(existing["workspace_id"]) != workspace_id or str(existing["created_by_member_id"]) != member_id:
                raise NotFoundError("Conversation not found.")
            result, created = session_dto(existing), False
        else:
            active_persona(cur, workspace_id, persona_id)
            cur.execute(f"""INSERT INTO public.chat_session (id, workspace_id, created_by_member_id, title, default_persona_id)
                VALUES (%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING RETURNING {SESSION_COLUMNS}""",
                        (session_id, workspace_id, member_id, title, persona_id))
            row = cur.fetchone()
            if row:
                result, created = session_dto(row), True
            else:
                # Another connection won the absent-row race. Never overwrite it.
                row = owned_session(cur, workspace_id, session_id, member_id, lock=True, include_archived=True)
                result, created = session_dto(row), False
    return result, created


def list_sessions(workspace_id, member_id, *, archived=False, limit=30, cursor=None):
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:read")
        params = [workspace_id, member_id]
        where = "AND archived_at IS NOT NULL" if archived else "AND archived_at IS NULL"
        if cursor:
            where += " AND (updated_at,id)<(%s,%s)"
            params.extend(cursor)
        cur.execute(f"SELECT {SESSION_COLUMNS} FROM public.chat_session "
                    f"WHERE workspace_id=%s AND created_by_member_id=%s {where} "
                    "ORDER BY updated_at DESC,id DESC LIMIT %s", (*params, limit + 1))
        rows = cur.fetchall()
    page = rows[:limit]
    return {"sessions": [session_dto(row) for row in page],
            "next_cursor": encode_cursor(page[-1]["updated_at"], page[-1]["id"]) if len(rows) > limit else None}


def _unresolved_requests(cur, session_id):
    cur.execute(f"SELECT {MESSAGE_COLUMNS} FROM public.chat_message WHERE session_id=%s "
                "AND role='user' AND kind='operation' AND structured_data->>'schema_version'='1' "
                "AND structured_data->'operation'->>'state' IN ('running','unknown') "
                "ORDER BY created_at,id", (session_id,))
    return [dict(row) for row in cur.fetchall()]


def _request(cur, session_id, key):
    cur.execute(f"SELECT {MESSAGE_COLUMNS} FROM public.chat_message "
                "WHERE session_id=%s AND client_message_key=%s AND role='user' AND kind='operation'",
                (session_id, "request:" + uuid_string(key, "operation_key")))
    row = cur.fetchone()
    return dict(row) if row else None


def _message(cur, session_id, message_id):
    cur.execute(f"SELECT {MESSAGE_COLUMNS} FROM public.chat_message WHERE session_id=%s AND id=%s",
                (session_id, uuid_string(message_id, "message_id")))
    row = cur.fetchone()
    if not row:
        raise NotFoundError("Message not found.")
    return dict(row)


def _status(cur, request):
    data = request["structured_data"]
    operation = data["operation"]
    response = None
    if operation.get("response_message_id"):
        response = public_message(_message(cur, request["session_id"], operation["response_message_id"]))
    return {"operation_key": data["input"]["operation_key"], "action": data["input"]["action"],
            "state": operation_state(operation), "request_message_id": str(request["id"]),
            "response": response, "safe_error_code": operation.get("safe_error_code")}


def get_session(workspace_id, session_id, member_id, *, limit=50, before=None):
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:read")
        session = owned_session(cur, workspace_id, session_id, member_id, include_archived=True)
        params = [session_id]
        where = ""
        if before:
            where = " AND (created_at,id)<(%s,%s)"
            params.extend(before)
        cur.execute(f"SELECT {MESSAGE_COLUMNS} FROM public.chat_message WHERE session_id=%s{where} "
                    "ORDER BY created_at DESC,id DESC LIMIT %s", (*params, limit + 1))
        rows = cur.fetchall()
        page = rows[:limit]
        operations = [_status(cur, row) for row in _unresolved_requests(cur, session_id)]
        result = session_dto(session)
        result.update(messages=[public_message(row) for row in reversed(page)], operations=operations,
                      before_cursor=encode_cursor(page[-1]["created_at"], page[-1]["id"]) if len(rows) > limit else None)
    return result


def get_operation(workspace_id, session_id, member_id, operation_key):
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:read")
        owned_session(cur, workspace_id, session_id, member_id, include_archived=True)
        row = _request(cur, session_id, operation_key)
        if not row:
            raise NotFoundError("Operation not found.")
        result = _status(cur, row)
    return result


def patch_session(workspace_id, session_id, member_id, fields, if_match):
    fields = patch_fields(fields)
    if not if_match:
        raise PreconditionRequiredError()
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:write")
        session = owned_session(cur, workspace_id, session_id, member_id, lock=True, include_archived=True)
        if if_match != metadata_etag(session):
            raise PreconditionFailedError()
        if fields.get("archived") is True:
            _assert_idle(cur, session_id)
        if fields.get("default_persona_id"):
            active_persona(cur, workspace_id, fields["default_persona_id"])
        assignments, params = [], []
        for key in ("title", "default_persona_id"):
            if key in fields:
                assignments.append(key + "=%s")
                params.append(fields[key])
        if "archived" in fields:
            assignments.append("archived_at=COALESCE(archived_at,clock_timestamp())" if fields["archived"] else "archived_at=NULL")
        assignments.append("updated_at=clock_timestamp()")
        cur.execute(f"UPDATE public.chat_session SET {','.join(assignments)} WHERE id=%s RETURNING {SESSION_COLUMNS}",
                    (*params, session_id))
        result = session_dto(cur.fetchone())
    return result


def _assert_idle(cur, session_id, excluding=None):
    for row in _unresolved_requests(cur, session_id):
        if str(row["id"]) != excluding and row["structured_data"]["operation"]["state"] in {"running", "unknown"}:
            raise ChatConflictError("operation_in_progress", "Resolve the active operation before continuing.")


def _touch(cur, session_id):
    cur.execute("UPDATE public.chat_session SET updated_at=clock_timestamp() WHERE id=%s", (session_id,))


def _save_operation(cur, row):
    cur.execute("UPDATE public.chat_message SET structured_data=%s WHERE id=%s AND session_id=%s",
                (Jsonb(row["structured_data"]), row["id"], row["session_id"]))


def _abandon(cur, row, acknowledged):
    operation = row["structured_data"]["operation"]
    if operation["state"] == "abandoned":
        return
    if acknowledged is not True or operation_state(operation) != "unknown":
        raise ChatConflictError("uncertain_acknowledgement_required", "Only an acknowledged uncertain operation can be abandoned.")
    operation.update(state="abandoned", claim_token=None, last_progress_at=datetime.now(timezone.utc).isoformat())
    _save_operation(cur, row)


def abandon_operation(workspace_id, session_id, member_id, key, *, acknowledged):
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:write")
        owned_session(cur, workspace_id, session_id, member_id, lock=True)
        row = _request(cur, session_id, key)
        if not row:
            raise NotFoundError("Operation not found.")
        _abandon(cur, row, acknowledged)
        _touch(cur, session_id)
        result = _status(cur, row)
    return result


def _source(cur, session_id, fields, *, excluding_request_id=None):
    if fields["action"] == "send":
        return None
    source = _message(cur, session_id, fields["source_message_id"])
    envelope = source.get("structured_data") or {}
    if source["role"] != "assistant" or envelope.get("schema_version") != 1 or envelope.get("type") not in TYPES:
        raise ValidationError("This operation requires a supported assistant source.")
    action, kind = fields["action"], envelope["type"]
    expected = {"clarify": {"clarification"}, "regenerate": {"text", "posts", "campaign"},
                "shorten": {"text"}, "video": {"campaign", "posts", "video"},
                "social_image": {"campaign", "posts", "social_image"}}
    if kind not in expected[action]:
        raise ValidationError("Source type does not support this operation.")
    # A successful direct revision supersedes its predecessor; failed requests do not.
    cur.execute("SELECT id FROM public.chat_message WHERE session_id=%s AND source_message_id=%s "
                "AND role='assistant' AND kind='revision' LIMIT 1", (session_id, source["id"]))
    if cur.fetchone():
        raise ChatConflictError("stale_source", "Choose the current response revision.")
    if action in {"video", "social_image"}:
        target = fields.get("target")
        if kind in {"campaign", "posts"}:
            collection = "content_calendar" if kind == "campaign" else "posts"
            items = envelope["payload"][kind].get(collection)
            if not target or target["collection"] != collection or not isinstance(items, list) or target["index"] >= len(items):
                raise ValidationError("Choose an existing source item for media generation.")
            # A second browser may still display the parent without its new media.
            # Require that browser to reload and use the saved artifact as source,
            # so a new attempt becomes a linked revision, not a hidden sibling.
            cur.execute("SELECT id FROM public.chat_message WHERE session_id=%s AND source_message_id=%s "
                        "AND role='assistant' AND structured_data->>'type'=%s "
                        "AND structured_data->'target'=%s LIMIT 1",
                        (session_id, source["id"], action, Jsonb(target)))
            if cur.fetchone():
                raise ChatConflictError("stale_source", "Reload the saved media and use its current revision.")
        elif target != envelope.get("target"):
            raise ValidationError("Media regeneration must retain its original target.")
    if action == "clarify":
        questions = envelope["payload"]["clarification"].get("questions", [])
        answers = fields["answers"]
        if {a["question_index"] for a in answers} != set(range(len(questions))):
            raise ValidationError("Answer each stored clarification question once.")
        for answer in answers:
            question = questions[answer["question_index"]]
            if (any(s not in question.get("options", []) for s in answer["selected"]) or
                    len(answer["selected"]) != len(set(answer["selected"])) or
                    (question.get("type") == "single" and len(answer["selected"]) > 1)):
                raise ValidationError("Selections must match the stored clarification options.")
        original_id = envelope.get("original_request_id") or source.get("request_message_id")
        original = _message(cur, session_id, str(original_id)) if original_id else None
        if len((original or {}).get("content", "")) + len(canonical(answers)) + 32 > 16000:
            raise ValidationError("Combined clarification input exceeds 16000 characters.")
        cur.execute("SELECT id FROM public.chat_message WHERE session_id=%s AND source_message_id=%s "
                    "AND role='user' AND kind='operation' AND structured_data->'input'->>'action'='clarify' "
                    "AND structured_data->'operation'->>'state' IN ('running','unknown','succeeded') "
                    + ("AND id<>%s " if excluding_request_id else "") + "LIMIT 1",
                    (session_id, source["id"], excluding_request_id) if excluding_request_id else (session_id, source["id"]))
        if cur.fetchone():
            raise ChatConflictError("clarification_already_submitted", "These questions already have submitted answers.")
    if not source.get("request_message_id"):
        raise ValidationError("Source has no original request provenance.")
    request = _message(cur, session_id, str(source["request_message_id"]))
    if request["role"] != "user":
        raise ValidationError("Source provenance must identify a user request.")
    if envelope.get("original_request_id"):
        if _message(cur, session_id, envelope["original_request_id"])["role"] != "user":
            raise ValidationError("Original provenance must identify a user request.")
    return source


def _claim_locked(cur, workspace_id, session_id, member_id, fields, *, generation_input=None, persona_snapshot=None, context_factory=None):
    old = _request(cur, session_id, fields["operation_key"])
    digest = input_hash(fields)
    if old:
        if old["structured_data"]["input_hash"] != digest:
            raise ChatConflictError("operation_key_reused", "This operation key already has different input.")
        return old, False
    if fields.get("retry_of"):
        previous = _request(cur, session_id, fields["retry_of"])
        if not previous:
            raise NotFoundError("Original operation not found.")
        state = operation_state(previous["structured_data"]["operation"])
        if state == "unknown":
            _abandon(cur, previous, fields.get("acknowledge_uncertain_outcome"))
        elif state not in {"failed", "abandoned"}:
            raise ChatConflictError("operation_not_retryable", "The original operation is not ready for a new attempt.")
    _assert_idle(cur, session_id)
    source = _source(cur, session_id, fields)
    snapshot = (active_persona(cur, workspace_id, fields["persona_id"]) if fields["action"] in PROVIDER_ACTIONS
                else deepcopy(source["structured_data"].get("persona_snapshot")))
    if persona_snapshot is not None:
        if (not isinstance(persona_snapshot, dict) or set(persona_snapshot) != {"id", "name", "slug"}
                or persona_snapshot["id"] != fields.get("persona_id")
                or any(not isinstance(v, str) or not v for v in persona_snapshot.values())):
            raise ValidationError("Invalid server persona snapshot.")
        snapshot = deepcopy(persona_snapshot)
    now = datetime.now(timezone.utc).isoformat()
    envelope = {"schema_version": 1, "input": fields, "input_hash": digest,
                "persona_snapshot": snapshot, "operation": {
                    "state": "running", "claim_token": str(uuid4()), "started_at": now,
                    "last_progress_at": now, "response_message_id": None, "safe_error_code": None}}
    if generation_input is not None:
        envelope["generation_input"] = deepcopy(generation_input)
        if context_factory is not None and generation_input.get("kind") == "chat":
            envelope["generation_input"]["conversation_context"] = context_factory(cur, session_id, fields, source)
    if source:
        envelope["original_request_id"] = (source["structured_data"].get("original_request_id") or
                                           str(source["request_message_id"]))
    content = fields.get("message") or (canonical(fields["answers"]) if fields["action"] == "clarify" else fields["action"])
    cur.execute(f"""INSERT INTO public.chat_message
        (session_id,author_member_id,persona_id,role,kind,mode,content,content_format,structured_data,client_message_key,source_message_id,created_at)
        VALUES (%s,%s,%s,'user','operation',%s,%s,'plain_text',%s,%s,%s,clock_timestamp()) RETURNING {MESSAGE_COLUMNS}""",
                (session_id, member_id, fields.get("persona_id"), fields["action"], content, Jsonb(envelope),
                 "request:" + fields["operation_key"], fields.get("source_message_id")))
    row = dict(cur.fetchone())
    _touch(cur, session_id)
    return row, True


def claim_operation(workspace_id, session_id, member_id, data, *, generation_input=None, persona_snapshot=None, context_factory=None):
    """Internal only. J.3 must resolve Step I configuration before a NEW provider claim.

    Only the caller receiving created=True may dispatch, after this function commits.
    Reconciliation/replays never grant dispatch rights.
    """
    fields = operation_fields(data)
    capabilities = ("chat:write", "ai:generate") if fields["action"] in PROVIDER_ACTIONS else ("chat:write",)
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, *capabilities)
        owned_session(cur, workspace_id, session_id, member_id, lock=True)
        row, created = _claim_locked(cur, workspace_id, session_id, member_id, fields,
                                    generation_input=generation_input, persona_snapshot=persona_snapshot, context_factory=context_factory)
        result = {"created": created, "request": deepcopy(row), "status": _status(cur, row)}
    return result  # Contains private claim token: service use only, never jsonify.


def _owned_claim(cur, session_id, key, token):
    row = _request(cur, session_id, key)
    if not row:
        raise NotFoundError("Operation not found.")
    operation = row["structured_data"]["operation"]
    if not token or operation.get("claim_token") != token or operation["state"] not in {"running", "unknown", "succeeded"}:
        raise ChatConflictError("operation_superseded", "This operation no longer owns completion.")
    return row


def _complete_locked(cur, session_id, row, response):
    operation = row["structured_data"]["operation"]
    if operation["state"] == "succeeded":
        return _status(cur, row)
    if not isinstance(response, dict) or not isinstance(response.get("type"), str) or response["type"] not in TYPES:
        raise ValidationError("Unsupported normalized assistant response.")
    try:
        encoded = canonical(response)
        encoded.encode("utf-8")
        if _contains_nul(response):
            raise ValueError()
    except (ValueError, TypeError, RecursionError, UnicodeError):
        raise ValidationError("Assistant output must contain finite JSON values.") from None
    fields = row["structured_data"]["input"]
    allowed = {"send": {"text", "posts", "clarification", "campaign"},
               "clarify": {"text", "posts", "clarification", "campaign"},
               "regenerate": {"text", "posts", "clarification", "campaign"},
               "shorten": {"text"}, "video": {"video"}, "social_image": {"social_image"}}
    if response["type"] not in allowed[fields["action"]]:
        raise ValidationError("Response type does not match the claimed action.")
    response = deepcopy(response)
    kind = response.pop("type")
    flags = response.pop("compliance_flags", [])
    if not isinstance(flags, list) or any(not isinstance(flag, str) for flag in flags):
        raise ValidationError("Invalid normalized compliance flags.")
    field = "response" if kind == "text" else kind
    if kind == "text":
        if not isinstance(response.get(field), str) or not response[field].strip():
            raise ValidationError("Assistant text cannot be empty.")
    elif kind == "social_image":
        if not isinstance(response.get("template"), str) or not isinstance(response.get("slots"), dict):
            raise ValidationError("Invalid normalized image specification.")
    elif not isinstance(response.get(field), dict):
        raise ValidationError("Invalid normalized assistant payload.")
    if kind in {"posts", "clarification"}:
        collection = "posts" if kind == "posts" else "questions"
        values = response[field].get(collection)
        if not isinstance(values, list) or not values or any(not isinstance(v, dict) for v in values):
            raise ValidationError("Normalized assistant collection is missing or empty.")
    if kind == "campaign":
        campaign = response["campaign"]
        if (not isinstance(campaign.get("content_strategy"), dict) or
                not isinstance(campaign.get("platform_breakdown"), list) or
                not isinstance(campaign.get("content_calendar"), list) or not campaign["content_calendar"]):
            raise ValidationError("Normalized campaign structure is incomplete.")
    if kind == "video" and any(not isinstance(response["video"].get(k), dict)
                                for k in ("script", "creative_direction", "quick_details")):
        raise ValidationError("Normalized video structure is incomplete.")
    if kind == "social_image" and any(not isinstance(response.get(k), str) or not response[k].strip()
                                       for k in ("compliance_footer", "business_name")):
        raise ValidationError("Normalized image identity/disclosure is missing.")
    source = None
    if fields["action"] != "send":
        # Clarification's own running request is the submission; validation already
        # happened at claim. Rechecking it would reject its own completion.
        if fields["action"] != "clarify":
            source = _source(cur, session_id, fields)
        else:
            source = _message(cur, session_id, fields["source_message_id"])
    is_revision = fields["action"] in {"shorten", "regenerate"} or (
        fields["action"] in {"video", "social_image"} and source["structured_data"]["type"] in {"video", "social_image"})
    envelope = {"schema_version": 1, "type": kind, "payload": response,
                "persona_snapshot": row["structured_data"].get("persona_snapshot"),
                "original_request_id": row["structured_data"].get("original_request_id") or str(row["id"])}
    if fields.get("target"):
        envelope["target"] = fields["target"]
    if kind == "social_image":
        envelope["render_version"] = 1
    content = response["response"] if kind == "text" else canonical(response)
    cur.execute(f"""INSERT INTO public.chat_message
        (session_id,persona_id,role,kind,mode,content,content_format,structured_data,compliance_flags,
         client_message_key,request_message_id,source_message_id,created_at)
        VALUES (%s,%s,'assistant',%s,%s,%s,%s,%s,%s,%s,%s,%s,clock_timestamp()) RETURNING {MESSAGE_COLUMNS}""",
                (session_id, row.get("persona_id"), "revision" if is_revision else "response",
                 kind, content, "plain_text" if kind == "text" else "json", Jsonb(envelope), Jsonb(flags),
                 "response:" + fields["operation_key"], row["id"], fields.get("source_message_id")))
    saved = dict(cur.fetchone())
    operation.update(state="succeeded", response_message_id=str(saved["id"]),
                     last_progress_at=datetime.now(timezone.utc).isoformat())
    _save_operation(cur, row)
    _touch(cur, session_id)
    result = {"operation_key": fields["operation_key"], "action": fields["action"], "state": "succeeded",
              "request_message_id": str(row["id"]), "response": public_message(saved), "safe_error_code": None}
    return result


def complete_operation(workspace_id, session_id, member_id, key, token, response):
    """Internal completion of an already normalized, post-compliance server result."""
    with get_db_transaction() as cur:
        member = lock_member(cur, workspace_id, member_id, "chat:write")
        owned_session(cur, workspace_id, session_id, member_id, lock=True)
        row = _owned_claim(cur, session_id, key, token)
        if row["structured_data"]["input"]["action"] in PROVIDER_ACTIONS:
            check_capability(member, "ai:generate")
        result = _complete_locked(cur, session_id, row, response)
    return result


def progress_operation(workspace_id, session_id, member_id, key, token, *, state="running", safe_error_code=None):
    """Internal heartbeat/failure transition; never dispatches or reclaims work."""
    if state not in {"running", "failed", "unknown"} or safe_error_code not in {
            None, "provider_unavailable", "provider_rate_limited", "provider_outcome_unknown", "invalid_provider_output"}:
        raise ValidationError("Invalid internal operation transition.")
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:write", "ai:generate")
        owned_session(cur, workspace_id, session_id, member_id, lock=True)
        row = _owned_claim(cur, session_id, key, token)
        if row["structured_data"]["operation"]["state"] == "succeeded":
            raise ChatConflictError("operation_terminal")
        row["structured_data"]["operation"].update(state=state, safe_error_code=safe_error_code,
                                                   last_progress_at=datetime.now(timezone.utc).isoformat())
        _save_operation(cur, row)
        result = _status(cur, row)
    return result


def shorten_operation(workspace_id, session_id, member_id, data):
    fields = operation_fields(data)
    if fields["action"] != "shorten":
        raise ValidationError("Expected shorten action.")
    with get_db_transaction() as cur:
        lock_member(cur, workspace_id, member_id, "chat:write")
        owned_session(cur, workspace_id, session_id, member_id, lock=True)
        row, created = _claim_locked(cur, workspace_id, session_id, member_id, fields)
        if not created:
            result = _status(cur, row)
        else:
            source = _message(cur, session_id, fields["source_message_id"])
            original = source["structured_data"]["payload"]["response"]
            lines = [line for line in original.split("\n") if line]
            footer = next((i for i, line in enumerate(lines) if " | NMLS #" in line and " | DRE #" in line), None)
            if footer is None:
                raise ValidationError("This response has no complete stored disclosure to preserve.")
            # Preserve the complete original footer suffix, including blank lines and extras.
            original_lines = original.split("\n")
            suffix_start = next(i for i, line in enumerate(original_lines) if " | NMLS #" in line and " | DRE #" in line)
            shortened = "\n".join(lines[:min(2, footer)]) + "\n\n" + "\n".join(original_lines[suffix_start:])
            row["persona_id"] = source.get("persona_id")
            cur.execute("UPDATE public.chat_message SET persona_id=%s WHERE id=%s AND session_id=%s",
                        (row["persona_id"], row["id"], session_id))
            result = _complete_locked(cur, session_id, row,
                                      {"type": "text", "response": shortened, "compliance_flags": source["compliance_flags"]})
    return result
