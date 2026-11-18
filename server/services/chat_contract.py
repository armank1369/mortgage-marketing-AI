"""Step J v1 validation and safe projections; no database or provider access."""
import base64
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from uuid import UUID

from errors import ValidationError
from validation import uuid_string

PROVIDER_ACTIONS = frozenset({"send", "clarify", "regenerate", "video", "social_image"})
ACTIONS = PROVIDER_ACTIONS | {"shorten"}
TYPES = frozenset({"text", "posts", "clarification", "campaign", "video", "social_image"})
MAX_BODY_BYTES = 128 * 1024
UNCERTAIN_AFTER_SECONDS = 300


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def text(value, field, limit=16000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or "\x00" in value:
        raise ValidationError(f"{field} must contain 1–{limit} characters of text.")
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise ValidationError(f"{field} must be valid Unicode text.") from None
    return value.strip()


def only(data, allowed):
    if not isinstance(data, dict) or data.keys() - set(allowed):
        raise ValidationError("Unknown fields or invalid object.")


def create_fields(data):
    only(data, {"title", "persona_id"})
    return {"title": text(data.get("title"), "title", 200),
            "persona_id": uuid_string(data.get("persona_id"), "persona_id")}


def patch_fields(data):
    only(data, {"title", "default_persona_id", "archived"})
    if not data:
        raise ValidationError("Supply at least one conversation setting.")
    result = {}
    if "title" in data:
        result["title"] = text(data["title"], "title", 200)
    if "default_persona_id" in data:
        result["default_persona_id"] = (None if data["default_persona_id"] is None else
                                        uuid_string(data["default_persona_id"], "default_persona_id"))
    if "archived" in data:
        if type(data["archived"]) is not bool:
            raise ValidationError("archived must be a boolean.")
        result["archived"] = data["archived"]
    return result


def operation_fields(data):
    only(data, {"operation_key", "action", "persona_id", "message", "source_message_id",
                "target", "answers", "retry_of", "acknowledge_uncertain_outcome"})
    try:
        if len(canonical(data).encode("utf-8")) > MAX_BODY_BYTES:
            raise ValidationError("Operation body exceeds 128 KiB.")
    except (ValueError, TypeError, RecursionError, UnicodeError):
        raise ValidationError("Operation must contain finite JSON values.") from None
    action = data.get("action")
    if not isinstance(action, str) or action not in ACTIONS:
        raise ValidationError("Unknown operation action.")
    result = {"operation_key": uuid_string(data.get("operation_key"), "operation_key"), "action": action}
    if action in PROVIDER_ACTIONS:
        result["persona_id"] = uuid_string(data.get("persona_id"), "persona_id")
    elif "persona_id" in data:
        raise ValidationError("shorten uses the original response persona.")
    if action == "send":
        result["message"] = text(data.get("message"), "message")
        if set(data) & {"source_message_id", "target", "answers"}:
            raise ValidationError("send accepts a message, not a source or answers.")
    else:
        result["source_message_id"] = uuid_string(data.get("source_message_id"), "source_message_id")
        if "message" in data:
            raise ValidationError("Source actions use stored content.")
    if "target" in data:
        if action not in {"video", "social_image"}:
            raise ValidationError("Only media operations accept target.")
        target = data["target"]
        only(target, {"collection", "index"})
        if (not isinstance(target.get("collection"), str) or target.get("collection") not in {"posts", "content_calendar"} or
                type(target.get("index")) is not int or target["index"] < 0):
            raise ValidationError("Invalid media target.")
        result["target"] = dict(target)
    if action == "clarify":
        answers = data.get("answers")
        if not isinstance(answers, list) or not 1 <= len(answers) <= 40:
            raise ValidationError("answers must contain 1–40 question answers.")
        result["answers"] = []
        seen = set()
        for answer in answers:
            only(answer, {"question_index", "selected", "custom"})
            index, selected, custom = answer.get("question_index"), answer.get("selected", []), answer.get("custom", "")
            if (type(index) is not int or index < 0 or index in seen or
                    not isinstance(selected, list) or len(selected) > 40 or
                    any(not isinstance(s, str) or len(s) > 16000 or "\x00" in s for s in selected) or
                    not isinstance(custom, str) or len(custom) > 16000 or "\x00" in custom):
                raise ValidationError("Invalid clarification answer.")
            seen.add(index)
            result["answers"].append({"question_index": index, "selected": selected, "custom": custom.strip()})
        result["answers"].sort(key=lambda answer: answer["question_index"])
    elif "answers" in data:
        raise ValidationError("Only clarify accepts answers.")
    if "retry_of" in data:
        result["retry_of"] = uuid_string(data["retry_of"], "retry_of")
        if result["retry_of"] == result["operation_key"]:
            raise ValidationError("A retry requires a new operation_key.")
    if "acknowledge_uncertain_outcome" in data:
        if type(data["acknowledge_uncertain_outcome"]) is not bool or "retry_of" not in data:
            raise ValidationError("Uncertainty acknowledgement requires retry_of and a boolean.")
        result["acknowledge_uncertain_outcome"] = data["acknowledge_uncertain_outcome"]
    return result


def input_hash(fields):
    return hashlib.sha256(canonical(fields).encode("utf-8")).hexdigest()


def metadata_etag(session):
    return '"' + hashlib.sha256(canonical({
        "title": session.get("title"),
        "default_persona_id": str(session["default_persona_id"]) if session.get("default_persona_id") else None,
        "archived": session.get("archived_at") is not None,
    }).encode("utf-8")).hexdigest() + '"'


def serialize(value):
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {k: serialize(v) for k, v in value.items() if k != "claim_token"}
    if isinstance(value, (list, tuple)):
        return [serialize(v) for v in value]
    return value


def operation_state(operation, now=None):
    if operation.get("state") != "running":
        return operation.get("state")
    now = now or datetime.now(timezone.utc)
    try:
        progress = datetime.fromisoformat(operation["last_progress_at"].replace("Z", "+00:00"))
        if (now - progress).total_seconds() >= UNCERTAIN_AFTER_SECONDS:
            return "unknown"
    except (KeyError, TypeError, ValueError):
        return "unknown"  # Legacy/malformed progress never authorizes takeover.
    return "running"


def public_message(message):
    result = serialize(deepcopy(dict(message)))
    envelope = result.get("structured_data") or {}
    if envelope.get("schema_version") == 1 and "operation" in envelope:
        envelope["operation"]["state"] = operation_state(envelope["operation"])
    return result


def page_limit(value, default):
    if value is None:
        return default
    if not isinstance(value, str) or not value.isascii() or not value.isdigit() or not 1 <= int(value) <= 100:
        raise ValidationError("limit must be an integer between 1 and 100.")
    return int(value)


def encode_cursor(timestamp, row_id):
    return base64.urlsafe_b64encode(canonical([serialize(timestamp), str(row_id)]).encode()).decode().rstrip("=")


def decode_cursor(value):
    if value is None:
        return None
    try:
        if not isinstance(value, str) or len(value) > 512:
            raise ValueError()
        parts = json.loads(base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True))
        if not isinstance(parts, list) or len(parts) != 2 or not isinstance(parts[0], str):
            raise ValueError()
        timestamp = datetime.fromisoformat(parts[0].replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            raise ValueError()
        return timestamp, uuid_string(parts[1], "cursor")
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise ValidationError("Invalid page cursor.") from None
