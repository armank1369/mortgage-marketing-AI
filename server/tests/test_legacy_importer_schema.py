import sys
from pathlib import Path

# Ensure repo root is in python path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json
import pytest
from unittest.mock import MagicMock, patch
from server.scripts.import_legacy_chats import (
    run_import,
    compute_content_hash,
    generate_deterministic_session_id,
    generate_deterministic_message_id,
)


def test_importer_sql_matches_schema_columns(tmp_path):
    sample_data = [
        {
            "title": "Integration Test Chat",
            "created_at": "2026-09-15T14:30:00Z",
            "messages": [
                {
                    "role": "user",
                    "text": "Hello world",
                    "created_at": "2026-09-15T14:30:01Z",
                },
                {
                    "role": "assistant",
                    "content": "Hi there!",
                    "created_at": "2026-09-15T14:30:15Z",
                    "payload": {"type": "text", "response": "Hi there!"},
                },
            ],
        }
    ]
    json_file = tmp_path / "test_export.json"
    json_file.write_text(json.dumps(sample_data), encoding="utf-8")

    mock_cur = MagicMock()
    # 1st call: workspace check; subsequent calls: deduplication lookups returning None
    mock_cur.fetchone.side_effect = [("workspace-123",), None, None, None]

    mock_tx = MagicMock()
    mock_tx.__enter__.return_value = mock_cur

    with patch("server.db.get_db_transaction", return_value=mock_tx):
        run_import(str(json_file), "8bab9643-a7a2-4b5c-989c-d7358393ac6e", execute=True)

    executed_statements = [call[0][0] for call in mock_cur.execute.call_args_list]

    # Verify chat_session columns: started_at (NOT created_at)
    session_insert = next(stmt for stmt in executed_statements if "INSERT INTO public.chat_session" in stmt)
    assert "started_at" in session_insert
    assert "created_at" not in session_insert

    # Verify chat_message columns: content, structured_data, content_format (NOT text, payload, content_hash)
    message_insert = next(stmt for stmt in executed_statements if "INSERT INTO public.chat_message" in stmt)
    assert "content" in message_insert
    assert "structured_data" in message_insert
    assert "content_format" in message_insert
    assert "text" not in message_insert
    assert "payload" not in message_insert
    assert "content_hash" not in message_insert


def test_deterministic_id_generation_is_stable():
    ws_id = "8bab9643-a7a2-4b5c-989c-d7358393ac6e"
    title = "First-Time Homebuyer Chat"
    started = "2026-09-15T14:30:00Z"

    id1 = generate_deterministic_session_id(ws_id, title, started)
    id2 = generate_deterministic_session_id(ws_id, title, started)
    assert id1 == id2, "Session IDs must be identical across runs"

    msg_id1 = generate_deterministic_message_id(id1, 0, "user", "2026-09-15T14:30:01Z")
    msg_id2 = generate_deterministic_message_id(id1, 0, "user", "2026-09-15T14:30:01Z")
    assert msg_id1 == msg_id2, "Message IDs must be identical across runs"

    # Verify hash is stable without runtime session IDs
    hash1 = compute_content_hash("user", "Hello world", "2026-09-15T14:30:01Z")
    hash2 = compute_content_hash("user", "Hello world", "2026-09-15T14:30:01Z")
    assert hash1 == hash2


def test_importer_skips_existing_records_on_second_run(tmp_path):
    sample_data = [
        {
            "title": "Idempotent Chat",
            "created_at": "2026-09-15T14:30:00Z",
            "messages": [
                {
                    "role": "user",
                    "text": "Hello again",
                    "created_at": "2026-09-15T14:30:01Z",
                }
            ],
        }
    ]
    json_file = tmp_path / "test_idempotent.json"
    json_file.write_text(json.dumps(sample_data), encoding="utf-8")

    mock_cur = MagicMock()
    # Simulate existing records found on lookup: workspace exists, session exists, message exists
    mock_cur.fetchone.side_effect = [("workspace-123",), ("existing-session-id",), ("existing-msg-id",)]

    mock_tx = MagicMock()
    mock_tx.__enter__.return_value = mock_cur

    with patch("server.db.get_db_transaction", return_value=mock_tx):
        run_import(str(json_file), "8bab9643-a7a2-4b5c-989c-d7358393ac6e", execute=True)

    executed_statements = [call[0][0] for call in mock_cur.execute.call_args_list]

    # Because records already existed, NO INSERT statements should have run
    assert not any("INSERT INTO public.chat_session" in stmt for stmt in executed_statements)
    assert not any("INSERT INTO public.chat_message" in stmt for stmt in executed_statements)

def test_importer_preserves_historical_persona_snapshot(tmp_path):
    sample_data = [
        {
            "title": "Persona Snapshot Test Chat",
            "created_at": "2026-09-15T14:30:00Z",
            "persona_snapshot": {
                "name": "First-Time Homebuyer Guide",
                "pacing": "encouraging and educational",
            },
            "messages": [
                {
                    "role": "user",
                    "text": "Explain down payments",
                    "created_at": "2026-09-15T14:30:01Z",
                }
            ],
        }
    ]
    json_file = tmp_path / "test_persona_snapshot.json"
    json_file.write_text(json.dumps(sample_data), encoding="utf-8")

    mock_cur = MagicMock()
    mock_cur.fetchone.side_effect = [("workspace-123",), None, None]

    mock_tx = MagicMock()
    mock_tx.__enter__.return_value = mock_cur

    with patch("server.db.get_db_transaction", return_value=mock_tx):
        run_import(str(json_file), "8bab9643-a7a2-4b5c-989c-d7358393ac6e", execute=True)

    # Find the chat_message INSERT call and verify the JSON payload contains persona_snapshot
    message_insert_call = next(
        call for call in mock_cur.execute.call_args_list if "INSERT INTO public.chat_message" in call[0][0]
    )
    # Params tuple passed to execute
    params = message_insert_call[0][1]
    # structured_data JSON string is index 5
    stored_structured_data = json.loads(params[5])
    assert "_import_metadata" in stored_structured_data
    assert "persona_snapshot" in stored_structured_data["_import_metadata"]
    assert stored_structured_data["_import_metadata"]["persona_snapshot"]["name"] == "First-Time Homebuyer Guide"