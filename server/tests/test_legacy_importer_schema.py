import sys
from pathlib import Path

# Ensure repo root is in python path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json
import pytest
from unittest.mock import MagicMock, patch
from server.scripts.import_legacy_chats import run_import, compute_content_hash


def test_importer_sql_matches_schema_columns(tmp_path):
    sample_data = [
        {
            "title": "Integration Test Chat",
            "created_at": "2026-09-15T14:30:00Z",
            "messages": [
                {
                    "role": "user",
                    "text": "Hello world",
                    "created_at": "2026-09-15T14:30:01Z"
                },
                {
                    "role": "assistant",
                    "content": "Hi there!",
                    "created_at": "2026-09-15T14:30:15Z",
                    "payload": {"type": "text", "response": "Hi there!"}
                }
            ]
        }
    ]
    json_file = tmp_path / "test_export.json"
    json_file.write_text(json.dumps(sample_data), encoding="utf-8")

    # Mock database cursor and transaction
    mock_cur = MagicMock()
    # 1st call: workspace check; subsequent calls: deduplication lookups returning None
    mock_cur.fetchone.side_effect = [("workspace-123",), None, None]

    mock_tx = MagicMock()
    mock_tx.__enter__.return_value = mock_cur

    with patch("server.db.get_db_transaction", return_value=mock_tx):
        run_import(str(json_file), "8bab9643-a7a2-4b5c-989c-d7358393ac6e", execute=True)

    # Inspect executed SQL statements
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