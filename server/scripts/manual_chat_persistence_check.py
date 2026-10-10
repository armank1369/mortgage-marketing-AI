
import sys
from pathlib import Path
from dotenv import load_dotenv

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))
load_dotenv(SERVER / ".env")

from db.connection import get_db_cursor, get_db_transaction
from repositories.chat_repository import (
    create_chat_session_with_message,
    get_chat_session_messages,
)

TEST_TITLE = "STEP F MANUAL SYNTHETIC TEST"


def get_workspace_id():
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id FROM public.workspace WHERE slug = %s AND environment = %s",
            ("lucie-development", "development")
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError("Development workspace not found")
    return str(row["id"])


action = sys.argv[1] if len(sys.argv) > 1 else ""
workspace_id = get_workspace_id()

if action == "create":
    session = create_chat_session_with_message(
        workspace_id=workspace_id,
        title=TEST_TITLE,
        initial_content="Synthetic Step F persistence test message."
    )
    print("Created session ID:", session["id"])

elif action in ("read", "delete"):
    if len(sys.argv) < 3:
        raise SystemExit("Provide the session ID")

    session_id = sys.argv[2]
    session = get_chat_session_messages(workspace_id, session_id)

    if not session or session["title"] != TEST_TITLE:
        raise SystemExit("Synthetic test session not found; no changes made")

    if action == "read":
        print("Session:", session["title"])
        print("Messages:", len(session["messages"]))
        for message in session["messages"]:
            print(message["role"], ":", message["content"])

    elif action == "delete":
        with get_db_transaction() as cur:
            cur.execute(
                "DELETE FROM public.chat_message WHERE session_id = %s",
                (session_id,)
            )
            cur.execute(
                """
                DELETE FROM public.chat_session
                WHERE id = %s AND workspace_id = %s AND title = %s
                """,
                (session_id, workspace_id, TEST_TITLE)
            )
        print("Synthetic test session deleted")

else:
    print("Usage: create | read SESSION_ID | delete SESSION_ID")


# Explicitly close the PostgreSQL connection pool
# before the Python interpreter shuts down.
from db.connection import _connection_pool
_connection_pool.close()