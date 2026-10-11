"""
server/repositories/chat_repository.py
Workspace-scoped persistence for chat sessions and messages.
Enforces multi-step atomic transactions for session creation and message logging.
"""

from typing import List, Optional, Dict, Any
from db.connection import get_db_cursor, get_db_transaction
from errors import NotFoundError, WorkspaceAccessDeniedError
from validation import uuid_string
from logging_utils import log_db_operation, log_db_error


def list_chat_sessions(workspace_id: str, member_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """List recent chat sessions scoped strictly to workspace_id."""
    query = """
        SELECT id, workspace_id, created_by_member_id, default_persona_id,
               title, summary_status, started_at, updated_at
        FROM public.chat_session
        WHERE workspace_id = %s
          AND created_by_member_id = %s
          AND archived_at IS NULL
        ORDER BY updated_at DESC
        LIMIT %s;
    """
    try:
        with get_db_cursor() as cur:
            cur.execute(query, (workspace_id, uuid_string(member_id, "member_id"), limit))
            rows = cur.fetchall()
            log_db_operation(
                "list_chat_sessions",
                workspace_id=workspace_id,
                status="success",
                extra={"count": len(rows)}
            )
            results = []
            for r in rows:
                item = dict(r)
                item["id"] = str(item["id"])
                item["workspace_id"] = str(item["workspace_id"])
                results.append(item)
            return results
    except Exception as e:
        log_db_error("list_chat_sessions", e, workspace_id=workspace_id)
        raise


def get_chat_session_messages(workspace_id: str, session_id: str, member_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a chat session and all linked chat_messages.
    Guarantees session belongs strictly to the requested workspace_id.
    """
    session_query = """
        SELECT id, workspace_id, created_by_member_id, default_persona_id,
               title, summary_status, started_at, updated_at
        FROM public.chat_session
        WHERE id = %s AND workspace_id = %s
          AND created_by_member_id = %s AND archived_at IS NULL;
    """
    message_query = """
        SELECT id, session_id, author_member_id, persona_id, role, kind,
               content, content_format, client_message_key, created_at
        FROM public.chat_message
        WHERE session_id = %s
        ORDER BY created_at ASC;
    """
    try:
        with get_db_cursor() as cur:
            cur.execute(session_query, (uuid_string(session_id, "session_id"), workspace_id, uuid_string(member_id, "member_id")))
            session_row = cur.fetchone()
            if not session_row:
                return None

            cur.execute(message_query, (session_id,))
            message_rows = cur.fetchall()

            result = dict(session_row)
            result["id"] = str(result["id"])
            result["workspace_id"] = str(result["workspace_id"])
            
            serialized_messages = []
            for m in message_rows:
                msg = dict(m)
                msg["id"] = str(msg["id"])
                msg["session_id"] = str(msg["session_id"])
                serialized_messages.append(msg)

            result["messages"] = serialized_messages
            log_db_operation(
                "get_chat_session_messages",
                workspace_id=workspace_id,
                resource_id=session_id,
                status="success"
            )
            return result
    except Exception as e:
        log_db_error("get_chat_session_messages", e, workspace_id=workspace_id, resource_id=session_id)
        raise


def create_chat_session_with_message(
    workspace_id: str,
    title: str,
    initial_content: str,
    *,
    author_member_id: str,
    persona_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Atomic transaction:
    Inserts a chat_session and its first chat_message in a single transaction block.
    """
    try:
        with get_db_transaction() as cur:
            author_member_id = uuid_string(author_member_id, "author_member_id")
            cur.execute(
                "SELECT id FROM public.workspace_member wm WHERE id = %s AND workspace_id = %s AND (to_jsonb(wm)->>'revoked_at') IS NULL FOR SHARE",
                (author_member_id, workspace_id),
            )
            if not cur.fetchone():
                raise WorkspaceAccessDeniedError()
            if persona_id is not None:
                persona_id = uuid_string(persona_id, "persona_id")
                cur.execute(
                    "SELECT id FROM public.persona WHERE id = %s AND workspace_id = %s AND deleted_at IS NULL FOR SHARE",
                    (persona_id, workspace_id),
                )
                if not cur.fetchone():
                    raise NotFoundError("Persona not found in this workspace.")
            # 1. Insert parent chat_session
            cur.execute(
                """
                INSERT INTO public.chat_session (
                    workspace_id, title, default_persona_id, created_by_member_id
                )
                VALUES (%s, %s, %s, %s)
                RETURNING id, workspace_id, title, default_persona_id, started_at, updated_at;
                """,
                (workspace_id, title, persona_id, author_member_id)
            )
            session = dict(cur.fetchone())
            session["id"] = str(session["id"])
            session["workspace_id"] = str(session["workspace_id"])
            session_id = session["id"]

            # 2. Insert initial chat_message
            cur.execute(
                """
                INSERT INTO public.chat_message (
                    session_id, author_member_id, persona_id, role, kind, content
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, session_id, author_member_id, persona_id, role, kind, content, created_at;
                """,
                (session_id, author_member_id, persona_id, "user", "message", initial_content)
            )
            msg = dict(cur.fetchone())
            msg["id"] = str(msg["id"])
            msg["session_id"] = str(msg["session_id"])

            session["messages"] = [msg]
            log_db_operation(
                "create_chat_session_with_message",
                workspace_id=workspace_id,
                resource_id=session_id,
                status="success"
            )
            return session
    except Exception as e:
        log_db_error("create_chat_session_with_message", e, workspace_id=workspace_id)
        raise