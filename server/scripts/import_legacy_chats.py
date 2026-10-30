"""
Historical Lucie Chat Import Tool (Step K3)
Usage:
    python server/scripts/import_legacy_chats.py --file <path_to_json> --workspace-id <workspace_uuid> [--batch-id <id>] [--execute]
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

NAMESPACE_LUCIE = uuid.uuid5(uuid.NAMESPACE_URL, "urn:lucie:legacy:import")


def compute_content_hash(role: str, content: str, created_at: str) -> str:
    """Stable content fingerprint independent of runtime session IDs."""
    raw = f"{role}:{content.strip()}:{created_at}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_deterministic_session_id(workspace_id: str, title: str, started_at: str) -> str:
    """Deterministic UUIDv5 for a chat session derived from workspace, title, and timestamp."""
    seed = f"{workspace_id}:{title}:{started_at}"
    return str(uuid.uuid5(NAMESPACE_LUCIE, f"session:{seed}"))


def generate_deterministic_message_id(session_id: str, msg_idx: int, role: str, created_at: str) -> str:
    """Deterministic UUIDv5 for a message derived from session, sequence index, role, and timestamp."""
    seed = f"{session_id}:{msg_idx}:{role}:{created_at}"
    return str(uuid.uuid5(NAMESPACE_LUCIE, f"message:{seed}"))


def run_import(file_path: str, workspace_id: str, batch_id: str = None, execute: bool = False):
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

    if not batch_id:
        file_hash = hashlib.sha256(open(file_path, "rb").read()).hexdigest()[:12]
        batch_id = f"batch_{file_hash}"
    print(f"Import Batch ID: {batch_id}")

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
        skipped_sessions = 0
        inserted_messages = 0
        skipped_messages = 0

        for s in data:
            title = s.get("title", "Imported Legacy Chat")
            started_at = s.get("created_at") or s.get("started_at") or datetime.now(timezone.utc).isoformat()
            persona_snapshot = s.get("persona_snapshot")
            
            # Deterministic session UUID
            session_id = generate_deterministic_session_id(workspace_id, title, started_at)

            # Check if session already exists
            cur.execute("SELECT id FROM public.chat_session WHERE id = %s", (session_id,))
            if cur.fetchone():
                skipped_sessions += 1
            else:
                cur.execute(
                    """
                    INSERT INTO public.chat_session (id, workspace_id, title, started_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (session_id, workspace_id, title, started_at, started_at),
                )
                inserted_sessions += 1

            for msg_idx, m in enumerate(s.get("messages", [])):
                role = m.get("role", "user")
                content = m.get("content") or m.get("text", "")
                created_at = m.get("created_at") or started_at

                msg_id = generate_deterministic_message_id(session_id, msg_idx, role, created_at)
                structured_data = m.get("structured_data") or m.get("payload") or {}

                # Compute content hash
                c_hash = compute_content_hash(role, content, created_at)
                if isinstance(structured_data, dict):
                    import_meta = {
                        "batch_id": batch_id,
                        "content_hash": c_hash,
                        "imported_at": datetime.now(timezone.utc).isoformat(),
                        "source": "lucie_legacy_export",
                    }
                    if persona_snapshot:
                        import_meta["persona_snapshot"] = persona_snapshot
                    structured_data["_import_metadata"] = import_meta

                # Check if message already exists across the entire database
                cur.execute("SELECT id FROM public.chat_message WHERE id = %s", (msg_id,))
                if cur.fetchone():
                    skipped_messages += 1
                    continue

                cur.execute(
                    """
                    INSERT INTO public.chat_message (
                        id, session_id, role, content, content_format, structured_data, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
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
        print(f"Sessions committed: {inserted_sessions} (Skipped existing: {skipped_sessions})")
        print(f"Messages committed: {inserted_messages} (Skipped existing: {skipped_messages})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import historical Lucie chats into NeonDB.")
    parser.add_argument("--file", required=True, help="Path to JSON chat export file")
    parser.add_argument("--workspace-id", required=True, help="Target workspace UUID")
    parser.add_argument("--batch-id", required=False, help="Optional custom import batch identifier")
    parser.add_argument("--execute", action="store_true", help="Execute write to NeonDB (default: dry run)")

    args = parser.parse_args()
    run_import(args.file, args.workspace_id, args.batch_id, args.execute)