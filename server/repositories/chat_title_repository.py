"""Reads and compare-and-set writes for automatic conversation titles."""
from db.connection import get_db_transaction
from repositories import chat_persistence_repository as chats
from services.chat_titles import unique_title, is_placeholder
from validation import uuid_string

FIRST_REQUEST = """SELECT content FROM public.chat_message WHERE session_id=%s AND role='user'
  AND (kind<>'operation' OR structured_data->'input'->>'action'='send') ORDER BY created_at,id LIMIT 1"""
FIRST_REPLY = "SELECT content FROM public.chat_message WHERE session_id=%s AND role='assistant' ORDER BY created_at,id LIMIT 1"
FOLDER_TITLES = """SELECT title FROM public.chat_session WHERE workspace_id=%s
  AND default_persona_id IS NOT DISTINCT FROM %s AND id<>%s AND archived_at IS NULL AND title IS NOT NULL"""


def _text(row):
    return (row["content"] or "") if row else ""


def _taken(cur, workspace_id, session):
    cur.execute(FOLDER_TITLES, (workspace_id, session["default_persona_id"], str(session["id"])))
    return [row["title"] for row in cur.fetchall()]


def title_context(workspace_id, session_id, member_id, *, force=False):
    """What the title writer needs, or None when this chat should keep its title."""
    session_id = uuid_string(session_id, "session_id")
    with get_db_transaction() as cur:
        chats.lock_member(cur, workspace_id, member_id, "chat:write", "ai:generate")
        session = chats.workspace_session(cur, workspace_id, session_id)
        persona_name = None
        if session["default_persona_id"]:
            cur.execute("SELECT name FROM public.persona WHERE id=%s AND workspace_id=%s", (session["default_persona_id"], workspace_id))
            row = cur.fetchone()
            persona_name = row["name"] if row else None
        cur.execute(FIRST_REQUEST, (session_id,))
        request = _text(cur.fetchone())
        cur.execute(FIRST_REPLY, (session_id,))
        reply = _text(cur.fetchone())
        if not request or not reply:
            return {"session": chats.session_dto(session), "eligible": False}
        eligible = force or is_placeholder(session["title"], persona_name, request)
        return {"session": chats.session_dto(session), "eligible": eligible, "title": session["title"],
                "first_request": request, "first_reply": reply, "taken": _taken(cur, workspace_id, session)}


def apply_title(workspace_id, session_id, member_id, expected_title, candidate):
    """Write the title only if nobody renamed the chat meanwhile. Returns (session dto, changed)."""
    session_id = uuid_string(session_id, "session_id")
    with get_db_transaction() as cur:
        chats.lock_member(cur, workspace_id, member_id, "chat:write")
        session = chats.workspace_session(cur, workspace_id, session_id, lock=True)
        if session["title"] != expected_title:
            return chats.session_dto(session), False
        # Serialize title picks inside one folder so two new chats cannot choose the same name.
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"{workspace_id}:{session['default_persona_id']}",))
        final = unique_title(candidate, _taken(cur, workspace_id, session))
        if final == session["title"]:
            return chats.session_dto(session), False
        cur.execute(f"UPDATE public.chat_session SET title=%s WHERE id=%s RETURNING {chats.SESSION_COLUMNS}", (final, session_id))
        return chats.session_dto(cur.fetchone()), True
