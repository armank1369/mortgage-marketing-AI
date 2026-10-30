"""Authorized preflight, source projection and ai_run persistence for Step J.3.

No provider calls. Invocation rows are guarded by the durable request and a stage
count under the same session lock; a stage with uncertain commit is never replayed.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib

from errors import ChatConflictError, ValidationError
from services.chat_contract import canonical, input_hash, operation_fields, operation_state, text
from repositories import chat_persistence_repository as chats
from db.connection import get_db_transaction
from services.recent_ideas import capture_recent_ideas

PROMPT_VERSION = "legacy-recovery-v1"
SAFE_ERRORS = frozenset({"provider_unavailable", "provider_rate_limited", "provider_outcome_unknown",
                         "invalid_provider_output", "persistence_outcome_unknown", "generation_failed"})


def _clarification_task(original, source, answers):
    questions = source["structured_data"]["payload"]["clarification"]["questions"]
    lines = []
    for answer in answers:
        question = questions[answer["question_index"]]["question"]
        parts = list(answer["selected"])
        if answer["custom"]:
            parts.append(answer["custom"])
        lines.append(f"- {question}: {', '.join(parts) if parts else 'No preference — use your judgment'}")
    return text("Original request: " + original + "\n\nAnswers:\n" + "\n".join(lines), "combined clarification input")


def _chat_task(cur, session_id, request):
    seen, clarifications = set(), []
    while True:
        request_id = str(request["id"])
        if request["role"] != "user" or request_id in seen:
            raise ValidationError("Original request provenance is unsupported.")
        seen.add(request_id)
        envelope = request.get("structured_data") or {}
        effective = envelope.get("generation_input") or {}
        fields = envelope.get("input") or {}
        if effective.get("kind") == "chat":
            original = text(effective.get("message"), "stored original request")
            break
        if fields.get("action") == "send" or request["kind"] != "operation":
            original = text(fields.get("message", request["content"]), "stored original request")
            break
        if not request.get("source_message_id"):
            raise ValidationError("Original request provenance is missing.")
        source = chats._message(cur, session_id, str(request["source_message_id"]))
        if source["role"] != "assistant" or not source.get("request_message_id"):
            raise ValidationError("Original request provenance is missing.")
        if fields.get("action") == "clarify":
            clarifications.append((source, fields["answers"]))
        request = chats._message(cur, session_id, str(source["request_message_id"]))
    for source, answers in reversed(clarifications):
        original = _clarification_task(original, source, answers)
    return original


def _media_input(cur, session_id, fields, source):
    previous = None
    if source["structured_data"]["type"] == "social_image":
        previous = deepcopy(source["structured_data"]["payload"])
    root, seen = source, set()
    while True:
        if root["role"] != "assistant" or str(root["id"]) in seen:
            raise ValidationError("Media provenance is unsupported.")
        seen.add(str(root["id"]))
        envelope = root["structured_data"]
        if envelope["type"] in {"posts", "campaign"}:
            break
        if not root.get("source_message_id"):
            raise ValidationError("Media has no stored publication source.")
        root = chats._message(cur, session_id, str(root["source_message_id"]))
    target = fields["target"]
    envelope = root["structured_data"]
    collection = "posts" if envelope["type"] == "posts" else "content_calendar"
    items = envelope["payload"][envelope["type"]].get(collection, [])
    if target["collection"] != collection or target["index"] >= len(items):
        raise ValidationError("Media target does not match its stored source.")
    item = items[target["index"]]
    slides = item.get("slides")
    body = slides if item.get("format") == "carousel" and isinstance(slides, list) and slides else item.get("caption", "")
    script = deepcopy(item.get("script") or {"hook": item.get("category", ""), "body": body, "cta": ""})
    if fields["action"] == "video":
        body = script.get("body", "")
        parts = [script.get("hook", ""), "\n".join(body) if isinstance(body, list) else body, script.get("cta", "")]
        caption = item.get("caption") or "\n".join(p for p in parts if p)
        return {"kind": "video", "caption": text(caption, "stored caption", 64000),
                "platform": item.get("platform", ""), "category": item.get("category", "")}
    result = {"kind": "social_image", "title": item.get("title") or item.get("category", ""),
              "script": script, "platform": item.get("platform", "")}
    if previous:
        result["previous_attempt"] = previous
    return result


def prepare_operation(workspace_id, session_id, member_id, data):
    """Return a replay BEFORE config reads, or a server-derived explicit task.

    This grants no dispatch rights. claim_operation repeats all ownership/source
    checks atomically after the caller resolves Step I generation context.
    """
    fields = operation_fields(data)
    with get_db_transaction() as cur:
        chats.lock_member(cur, workspace_id, member_id, "chat:write", "ai:generate")
        session = chats.workspace_session(cur, workspace_id, session_id, lock=True)
        existing = chats._request(cur, session_id, fields["operation_key"])
        if existing:
            if existing["structured_data"]["input_hash"] != input_hash(fields):
                raise ChatConflictError("operation_key_reused", "This operation key already has different input.")
            return {"replay": chats._status(cur, existing)}
        excluding = None
        if fields.get("retry_of"):
            prior = chats._request(cur, session_id, fields["retry_of"])
            if not prior:
                from errors import NotFoundError
                raise NotFoundError("Original operation not found.")
            state = operation_state(prior["structured_data"]["operation"])
            if state == "unknown":
                if fields.get("acknowledge_uncertain_outcome") is not True:
                    raise ChatConflictError("uncertain_acknowledgement_required")
                excluding = str(prior["id"])
            elif state not in {"failed", "abandoned"}:
                raise ChatConflictError("operation_not_retryable")
        chats._assert_idle(cur, session_id, excluding=excluding)
        source = chats._source(cur, session_id, fields, excluding_request_id=excluding)
        chats.assert_persona(cur, session, fields, source)
        if fields["action"] == "send":
            result = {"kind": "chat", "message": fields["message"]}
        elif fields["action"] in {"regenerate", "clarify"}:
            task = _chat_task(cur, session_id, chats._message(cur, session_id, str(source["request_message_id"])))
            if fields["action"] == "clarify":
                task = _clarification_task(task, source, fields["answers"])
            result = {"kind": "chat", "message": task}
        else:
            result = _media_input(cur, session_id, fields, source)
        if result["kind"] == "chat":
            result["recent_ideas"] = capture_recent_ideas(cur, workspace_id, str(source["id"]) if source else None)
    return {"generation_input": result}


def _authorize_claim(cur, workspace_id, session_id, member_id, key, token):
    chats.lock_member(cur, workspace_id, member_id, "chat:write", "ai:generate")
    chats.workspace_session(cur, workspace_id, session_id, lock=True)
    row = chats._owned_claim(cur, session_id, key, token, member_id)
    return row


def _run(cur, session_id, request_id, run_id):
    cur.execute("SELECT id,status,response_message_id FROM public.ai_run "
                "WHERE id=%s AND session_id=%s AND request_message_id=%s FOR UPDATE", (run_id, session_id, request_id))
    row = cur.fetchone()
    if not row:
        raise ChatConflictError("run_not_found")
    return row


def _save_run(cur, session_id, request_id, run_id, *, status, metrics=None, response_id=None, safe_error=None):
    row = _run(cur, session_id, request_id, run_id)
    if row["status"] in {"succeeded", "failed"} and status != row["status"]:
        raise ChatConflictError("run_terminal")
    metrics = metrics or {}
    cur.execute("""UPDATE public.ai_run SET status=%s, response_message_id=%s,
        input_tokens=%s,cache_creation_input_tokens=%s,cache_read_input_tokens=%s,
        output_tokens=%s,latency_ms=%s,error_text=%s,model=COALESCE(%s,model)
        WHERE id=%s AND session_id=%s AND request_message_id=%s""",
                (status, response_id, metrics.get("input_tokens"), metrics.get("cache_creation_input_tokens"),
                 metrics.get("cache_read_input_tokens"), metrics.get("output_tokens"), metrics.get("latency_ms"),
                 safe_error, metrics.get("model"), run_id, session_id, request_id))


def start_run(workspace_id, session_id, member_id, key, token, *, model, system, stage, prior_success=None):
    if type(stage) is not int or not 0 <= stage <= 1 or (stage > 0 and not prior_success):
        raise ChatConflictError("provider_stage_unresolved", "A new stage needs a confirmed previous result.")
    prompt_hash = hashlib.sha256(canonical(system).encode("utf-8")).hexdigest()
    with get_db_transaction() as cur:
        request = _authorize_claim(cur, workspace_id, session_id, member_id, key, token)
        if request["structured_data"]["operation"]["state"] == "succeeded":
            raise ChatConflictError("operation_terminal")
        cur.execute("SELECT id FROM public.ai_run WHERE session_id=%s AND request_message_id=%s ORDER BY created_at,id",
                    (session_id, request["id"]))
        runs = cur.fetchall()
        if len(runs) != stage:
            raise ChatConflictError("provider_stage_already_claimed", "This provider stage cannot be dispatched again.")
        if prior_success:
            if not runs or str(runs[-1]["id"]) != prior_success["id"]:
                raise ChatConflictError("run_not_found")
            _save_run(cur, session_id, request["id"], prior_success["id"], status="succeeded", metrics=prior_success["metrics"])
        cur.execute("""INSERT INTO public.ai_run
            (session_id,request_message_id,provider,model,system_prompt_version,system_prompt_hash,prompt_cache_mode,status)
            VALUES (%s,%s,'anthropic',%s,%s,%s,'explicit','started') RETURNING id""",
                    (session_id, request["id"], model, PROMPT_VERSION, prompt_hash))
        run_id = str(cur.fetchone()["id"])
        request["structured_data"]["operation"]["last_progress_at"] = datetime.now(timezone.utc).isoformat()
        chats._save_operation(cur, request)
    return run_id


def complete_generation(workspace_id, session_id, member_id, key, token, response, final_run):
    with get_db_transaction() as cur:
        request = _authorize_claim(cur, workspace_id, session_id, member_id, key, token)
        result = chats._complete_locked(cur, session_id, request, response)
        _save_run(cur, session_id, request["id"], final_run["id"], status="succeeded",
                  metrics=final_run["metrics"], response_id=result["response"]["id"])
    return result


def fail_generation(workspace_id, session_id, member_id, key, token, *, uncertain, safe_error, run=None):
    if type(uncertain) is not bool or safe_error not in SAFE_ERRORS:
        raise ValidationError("Invalid internal generation failure classification.")
    with get_db_transaction() as cur:
        request = _authorize_claim(cur, workspace_id, session_id, member_id, key, token)
        operation = request["structured_data"]["operation"]
        if operation["state"] == "succeeded":
            return chats._status(cur, request)
        if run:
            _save_run(cur, session_id, request["id"], run["id"], status="started" if uncertain else "failed",
                      metrics=run.get("metrics"), safe_error=safe_error)
        operation.update(state="unknown" if uncertain else "failed", safe_error_code=safe_error,
                         last_progress_at=datetime.now(timezone.utc).isoformat())
        chats._save_operation(cur, request)
        chats._touch(cur, session_id)
        result = chats._status(cur, request)
    return result
