"""
Historical Lucie Chat Import Tool (Step K3)
Usage:
    python server/scripts/import_legacy_chats.py --file <path_to_json> --workspace-id <workspace_uuid> [--execute]
"""

import argparse
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone

# Allow execution from root repository path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))


def compute_content_hash(session_id: str, role: str, content: str, created_at: str) -> str:
    raw = f"{session_id}:{role}:{content}:{created_at}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def run_import(file_path: str, workspace_id: str, execute: bool = False):
    print("=== Lucie Legacy Chat Importer (Step K3) ===")
    print(f"Target Workspace ID: {workspace_id}")
    print(f"Mode: {'LIVE EXECUTION (NeonDB commit)' if execute else 'DRY RUN (No database writes)'}")

    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    with open(file_path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON: {e}")
            sys.exit(1)

    if not isinstance(data, list):
        print("Error: Root export structure must be a list of chat sessions.")
        sys.exit(1)

    parsed_sessions = 0
    parsed_messages = 0

    for s in data:
        if "title" not in s or "messages" not in s:
            print(f"Skipping malformed session record: {s}")
            continue
        parsed_sessions += 1
        for m in s.get("messages", []):
            if "role" not in m or ("text" not in m and "content" not in m):
                continue
            parsed_messages += 1

    print(f"Parsed Sessions: {parsed_sessions}")
    print(f"Parsed Messages: {parsed_messages}")

    if not execute:
        print("\n[DRY RUN COMPLETE] JSON structure is valid. Pass --execute to write to NeonDB.")
        return

    # Real database execution path
    try:
        from server.db import get_db_transaction
    except ImportError:
        print("Error: Could not import server database utilities.")
        sys.exit(1)

    print("\nConnecting to database and staging records...")
    with get_db_transaction() as cur:
        # Verify target workspace exists
        cur.execute("SELECT id FROM public.workspace WHERE id = %s", (workspace_id,))
        if not cur.fetchone():
            print(f"Error: Target workspace '{workspace_id}' does not exist.")
            sys.exit(1)

        inserted_sessions = 0
        inserted_messages = 0
        skipped_messages = 0

        for s in data:
            session_id = str(uuid.uuid4())
            title = s.get("title", "Imported Legacy Chat")
            started_at = s.get("created_at") or s.get("started_at") or datetime.now(timezone.utc).isoformat()

            # Insert into public.chat_session conforming to Step J SCHEMA.md
            cur.execute(
                """
                INSERT INTO public.chat_session (id, workspace_id, title, started_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, workspace_id, title, started_at, started_at),
            )
            inserted_sessions += 1

            for m in s.get("messages", []):
                msg_id = str(uuid.uuid4())
                role = m.get("role", "user")
                # Map source 'text' or 'content' to PostgreSQL column 'content'
                content = m.get("content") or m.get("text", "")
                created_at = m.get("created_at") or started_at

                # Map source 'payload' or 'structured_data' to PostgreSQL column 'structured_data'
                structured_data = m.get("structured_data") or m.get("payload") or {}

                # Compute content hash for idempotency and embed in structured_data metadata
                c_hash = compute_content_hash(session_id, role, content, created_at)
                if isinstance(structured_data, dict):
                    structured_data["_import_metadata"] = {
                        "content_hash": c_hash,
                        "imported_at": datetime.now(timezone.utc).isoformat(),
                        "source": "lucie_legacy_export",
                    }

                # Deduplication check: check if an identical message exists in this session
                cur.execute(
                    """
                    SELECT id FROM public.chat_message
                    WHERE session_id = %s
                      AND role = %s
                      AND content = %s
                    LIMIT 1
                    """,
                    (session_id, role, content),
                )
                if cur.fetchone():
                    skipped_messages += 1
                    continue

                # Insert into public.chat_message conforming to Step J SCHEMA.md
                cur.execute(
                    """
                    INSERT INTO public.chat_message (
                        id, session_id, role, content, content_format, structured_data, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        msg_id,
                        session_id,
                        role,
                        content,
                        "markdown",
                        json.dumps(structured_data),
                        created_at,
                    ),
                )
                inserted_messages += 1

        print(f"\n[LIVE IMPORT SUCCESS]")
        print(f"Sessions committed: {inserted_sessions}")
        print(f"Messages committed: {inserted_messages} (Skipped duplicates: {skipped_messages})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import historical Lucie chats into NeonDB.")
    parser.add_argument("--file", required=True, help="Path to JSON chat export file")
    parser.add_argument("--workspace-id", required=True, help="Target workspace UUID")
    parser.add_argument("--execute", action="store_true", help="Execute write to NeonDB (default: dry run)")

    args = parser.parse_args()
    run_import(args.file, args.workspace_id, args.execute)