"""
Legacy Lucie Chat Importer Tool (Step K3)
Usage:
    python -m server.scripts.import_legacy_chats --file path/to/chats.json --workspace-id <UUID> [--execute]
"""

import argparse
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone

# Ensure both repo root and server directory are in sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
SERVER_DIR = os.path.join(REPO_ROOT, "server")

for p in (REPO_ROOT, SERVER_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)


def compute_content_hash(session_id: str, role: str, text: str, created_at: str) -> str:
    payload = f"{session_id}:{role}:{text.strip()}:{created_at}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_export_data(data: dict | list) -> list[dict]:
    """Validates and normalizes legacy chat JSON format."""
    sessions = []
    raw_sessions = data if isinstance(data, list) else data.get("sessions", [data])

    for idx, s in enumerate(raw_sessions):
        title = s.get("title", f"Imported Chat {idx + 1}")
        created_at = s.get("created_at") or datetime.now(timezone.utc).isoformat()
        messages = s.get("messages", [])

        if not messages:
            continue

        normalized_msgs = []
        for m in messages:
            role = m.get("role", "user")
            text = m.get("text") or m.get("content") or ""
            msg_time = m.get("created_at") or created_at
            if text.strip():
                normalized_msgs.append({
                    "role": role,
                    "text": text,
                    "created_at": msg_time,
                    "type": m.get("type", "text"),
                    "payload": m.get("payload") or {"type": "text", "response": text}
                })

        if normalized_msgs:
            sessions.append({
                "title": title,
                "created_at": created_at,
                "messages": normalized_msgs
            })

    return sessions


def run_import(file_path: str, workspace_id: str, execute: bool = False):
    if not os.path.exists(file_path):
        print(f"[ERROR] Source file not found: {file_path}")
        sys.exit(1)

    with open(file_path, "r", encoding="utf-8") as f:
        try:
            raw_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"[ERROR] Invalid JSON file: {e}")
            sys.exit(1)

    sessions = validate_export_data(raw_data)
    total_messages = sum(len(s["messages"]) for s in sessions)

    print("\n=== Lucie Legacy Chat Importer (Step K3) ===")
    print(f"Target Workspace ID: {workspace_id}")
    print(f"Mode: {'LIVE EXECUTE' if execute else 'DRY RUN (No database writes)'}")
    print(f"Parsed Sessions: {len(sessions)}")
    print(f"Parsed Messages: {total_messages}\n")

    if not execute:
        print("[DRY RUN COMPLETE] JSON structure is valid. Pass --execute to write to NeonDB.")
        return

    # Database Execution Path (Lazy import so dry-run never fails on DB modules)
    try:
        from server.db import get_db_transaction
    except ImportError:
        from db import get_db_transaction

    # Database Execution Path
    with get_db_transaction() as cur:
        # 1. Verify workspace exists
        cur.execute("SELECT id FROM public.workspace WHERE id = %s", (workspace_id,))
        if not cur.fetchone():
            print(f"[ERROR] Workspace {workspace_id} does not exist in target database.")
            sys.exit(1)

        inserted_sessions = 0
        inserted_messages = 0
        skipped_messages = 0

        for s in sessions:
            session_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO public.chat_session (id, workspace_id, title, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, workspace_id, s["title"], s["created_at"], s["created_at"])
            )
            inserted_sessions += 1

            for m in s["messages"]:
                c_hash = compute_content_hash(session_id, m["role"], m["text"], m["created_at"])
                msg_id = str(uuid.uuid4())

                # Check for duplicate
                cur.execute(
                    "SELECT id FROM public.chat_message WHERE session_id = %s AND content_hash = %s",
                    (session_id, c_hash)
                )
                if cur.fetchone():
                    skipped_messages += 1
                    continue

                cur.execute(
                    """
                    INSERT INTO public.chat_message (id, session_id, role, text, payload, content_hash, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (msg_id, session_id, m["role"], m["text"], json.dumps(m["payload"]), c_hash, m["created_at"])
                )
                inserted_messages += 1

    print("=== Import Summary ===")
    print(f"Sessions Inserted: {inserted_sessions}")
    print(f"Messages Inserted: {inserted_messages}")
    print(f"Duplicates Skipped: {skipped_messages}")
    print("Database transaction committed successfully.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lucie Legacy Chat Importer")
    parser.add_argument("--file", required=True, help="Path to export JSON file")
    parser.add_argument("--workspace-id", required=True, help="Target Workspace UUID")
    parser.add_argument("--execute", action="store_true", help="Perform real writes")
    args = parser.parse_args()

    run_import(args.file, args.workspace_id, args.execute)