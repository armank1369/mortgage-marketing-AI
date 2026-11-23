"""Per-conversation voice overrides (table public.chat_session_voice, docs/database/chat_voice_settings.sql).

Kept out of chat_session so chats keep working before the migration is applied: a missing
table reads as "no overrides" and only writing overrides reports voice_storage_missing.
"""
from psycopg import errors as pg_errors

from auth.permissions import check_capability  # noqa: F401  (capability checks happen in lock_member)
from db.connection import get_db_transaction
from errors import ChatConflictError
from psycopg.types.json import Jsonb
from repositories import chat_persistence_repository as chats
from services.voice_settings import normalize_voice
from validation import uuid_string

MISSING = ChatConflictError("voice_storage_missing", "Per-chat voice settings need a database update before they can be saved.")


def read(cur, session_id):
    """Overrides for one session, inside an open transaction. Tolerates a missing table."""
    cur.execute("SAVEPOINT chat_voice_read")
    try:
        cur.execute("SELECT settings FROM public.chat_session_voice WHERE session_id=%s", (session_id,))
        row = cur.fetchone()
    except pg_errors.UndefinedTable:
        cur.execute("ROLLBACK TO SAVEPOINT chat_voice_read")
        return {}
    cur.execute("RELEASE SAVEPOINT chat_voice_read")
    try:
        return normalize_voice(row["settings"]) if row else {}
    except Exception:  # A stored value that no longer validates is ignored, never applied.
        return {}


def load(workspace_id, session_id):
    """Overrides used at generation time (caller already authorized the workspace)."""
    with get_db_transaction() as cur:
        cur.execute("SELECT 1 FROM public.chat_session WHERE id=%s AND workspace_id=%s",
                    (uuid_string(session_id, "session_id"), uuid_string(workspace_id, "workspace_id")))
        if not cur.fetchone():
            return {}
        return read(cur, session_id)


def save(workspace_id, session_id, member_id, voice):
    """Replace a conversation's overrides. An empty dict restores the folder/brand defaults."""
    voice = normalize_voice(voice)
    session_id = uuid_string(session_id, "session_id")
    with get_db_transaction() as cur:
        chats.lock_member(cur, workspace_id, member_id, "chat:write")
        chats.workspace_session(cur, workspace_id, session_id, lock=True)
        cur.execute("SAVEPOINT chat_voice_write")
        try:
            if voice:
                cur.execute("""INSERT INTO public.chat_session_voice (session_id, workspace_id, settings, updated_by_member_id)
                    VALUES (%s,%s,%s,%s) ON CONFLICT (session_id) DO UPDATE
                    SET settings=EXCLUDED.settings, updated_by_member_id=EXCLUDED.updated_by_member_id, updated_at=clock_timestamp()""",
                            (session_id, workspace_id, Jsonb(voice), member_id))
            else:
                cur.execute("DELETE FROM public.chat_session_voice WHERE session_id=%s", (session_id,))
        except pg_errors.UndefinedTable:
            cur.execute("ROLLBACK TO SAVEPOINT chat_voice_write")
            if voice:
                raise MISSING from None
        else:
            cur.execute("RELEASE SAVEPOINT chat_voice_write")
    return voice
