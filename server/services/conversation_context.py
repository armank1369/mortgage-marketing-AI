"""Bounded, untrusted same-conversation projection captured under the session lock.

The caller must authorize membership, capabilities and workspace access first.
No provider calls, writes, summaries, cross-session lookups or publication mutation.
"""
from services.chat_contract import canonical
from errors import ValidationError

PROJECTION_VERSION = 1
MAX_EXCHANGES = 6
MAX_HISTORY_BYTES = 16 * 1024
MAX_ARTIFACT_BYTES = 4 * 1024
TRUNCATION_MARKER = "\n[Context projection truncated]"

# Pick the latest completed non-media result for each original user task. In
# particular, shorten/regenerate commands are not fed back as user utterances.
# Every join repeats session equality; JSON IDs are compared as text, never cast.
CONTEXT_SQL = """
WITH latest AS (
  SELECT DISTINCT ON (root.id)
    a.id AS assistant_id, a.structured_data AS assistant_data,
    q.id AS request_id, q.kind AS request_kind, q.content AS request_content,
    q.structured_data AS request_data, q.source_message_id AS request_source_id,
    root.id AS root_id, root.created_at AS root_created_at
  FROM public.chat_message a
  JOIN public.chat_message q ON q.id=a.request_message_id AND q.session_id=a.session_id
  JOIN public.chat_message root
    ON root.id::text=COALESCE(a.structured_data->>'original_request_id',a.request_message_id::text)
    AND root.session_id=a.session_id
  WHERE a.session_id=%s AND a.role='assistant' AND q.role='user' AND root.role='user'
    AND a.structured_data->>'schema_version'='1'
    AND a.structured_data->>'type' IN ('text','posts','campaign','clarification')
    AND q.structured_data->'operation'->>'state'='succeeded'
    AND COALESCE(root.structured_data->'input'->>'action','send')='send'
    {cutoff}
  ORDER BY root.id,a.created_at DESC,a.id DESC
)
SELECT * FROM latest ORDER BY root_created_at DESC,root_id DESC LIMIT %s
"""


def clip_projection(value, limit=MAX_ARTIFACT_BYTES):
    encoded = value.encode("utf-8")
    if len(encoded) <= limit:
        return value, False
    prefix = encoded[:limit - len(TRUNCATION_MARKER.encode("utf-8"))].decode("utf-8", errors="ignore")
    return prefix + TRUNCATION_MARKER, True


def _lines(value, allowed):
    if not isinstance(value, dict):
        return []
    return [f"{key}: {canonical(value[key]) if isinstance(value[key], (dict, list)) else value[key]}"
            for key in allowed if value.get(key) is not None]


def project_artifact(envelope):
    """Explicit content fields only. Never serialize an operational envelope."""
    kind, payload = envelope.get("type"), envelope.get("payload") or {}
    if kind == "text":
        return str(payload.get("response", ""))
    data = payload.get(kind) or {}
    lines = [f"Saved {kind}:"]
    if kind == "posts":
        lines += _lines(data, ("intro",))
        for post in data.get("posts", []):
            lines += _lines(post, ("title", "platform", "format"))
            lines += _lines(post.get("script"), ("hook", "body", "cta"))
            lines += _lines(post, ("hashtags",))
    elif kind == "campaign":
        lines += _lines(data.get("content_strategy"), ("title", "goal", "pillars"))
        for platform in data.get("platform_breakdown", []):
            lines += _lines(platform, ("platform", "frequency", "total_posts", "times", "audience", "tone"))
        for entry in data.get("content_calendar", []):
            lines += _lines(entry, ("day", "date", "time", "category", "platform", "format", "caption", "slides", "hashtags"))
    elif kind == "clarification":
        for question in data.get("questions", []):
            lines += _lines(question, ("question", "options", "allow_custom"))
    return "\n".join(lines)


def project_exchanges(candidates, task_loader):
    """Candidates arrive newest task first; return whole pairs in chronological order."""
    truncated = len(candidates) > MAX_EXCHANGES
    selected = []
    for row in reversed(candidates[:MAX_EXCHANGES]):
        request = {"id": row["request_id"], "role": "user", "kind": row["request_kind"],
                   "content": row["request_content"], "structured_data": row["request_data"],
                   "source_message_id": row["request_source_id"]}
        user, user_cut = clip_projection(task_loader(request))
        assistant, assistant_cut = clip_projection(project_artifact(row["assistant_data"]))
        selected.append({"messages": [{"role": "user", "content": user}, {"role": "assistant", "content": assistant}],
                         "ids": {"user_message_id": str(row["root_id"]), "request_message_id": str(row["request_id"]),
                                 "assistant_message_id": str(row["assistant_id"])},
                         "truncated": user_cut or assistant_cut})
    def messages():
        return [message for exchange in selected for message in exchange["messages"]]
    while len(canonical(messages()).encode("utf-8")) > MAX_HISTORY_BYTES:
        selected.pop(0)
        truncated = True
    projected = messages()
    exchanges = [exchange["ids"] for exchange in selected]
    return {"projection_version": PROJECTION_VERSION, "messages": projected, "exchanges": exchanges,
            "message_ids": list(dict.fromkeys(mid for exchange in exchanges for mid in exchange.values())),
            "truncated": truncated or any(exchange["truncated"] for exchange in selected),
            "utf8_bytes": len(canonical(projected).encode("utf-8"))}


def capture_context(cur, session_id, fields, source, task_loader):
    """Called by claim_operation after ownership/source checks, before request insert."""
    params, cutoff = [session_id], ""
    if source is not None:
        root_id = source["structured_data"].get("original_request_id") or str(source["request_message_id"])
        cur.execute("SELECT created_at,id FROM public.chat_message WHERE session_id=%s AND id=%s AND role='user'",
                    (session_id, root_id))
        root = cur.fetchone()
        if not root:
            raise ValidationError("Original context boundary is unavailable.")
        # Regeneration/clarification uses the original task explicitly. Do not repeat
        # it in history or expose later exchanges as though they preceded that task.
        cutoff = "AND (root.created_at,root.id)<(%s,%s)"
        params.extend([root["created_at"], root["id"]])
    cur.execute(CONTEXT_SQL.format(cutoff=cutoff), (*params, MAX_EXCHANGES + 1))
    return project_exchanges([dict(row) for row in cur.fetchall()], lambda request: task_loader(cur, session_id, request))
