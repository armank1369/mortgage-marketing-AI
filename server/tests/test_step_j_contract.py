"""Validation and serialization security boundaries, independent of SQL."""
from datetime import datetime, timezone
from uuid import UUID

import pytest

from errors import ValidationError
from services.chat_contract import (operation_fields, patch_fields, public_message, serialize,
                                    decode_cursor, encode_cursor, page_limit, metadata_etag)
from tests.test_step_j_repository import send, S, P


@pytest.mark.parametrize("changes", [
    {"message": ""}, {"message": "x" * 16001}, {"persona_id": "bad"}, {"action": []},
    {"role": "assistant"}, {"state": "succeeded"}, {"response": {}}, {"message": "nul\x00text"},
    {"target": {"collection": "posts", "index": 0}}, {"answers": []},
])
def test_invalid_send_rejected(changes):
    with pytest.raises(ValidationError):
        operation_fields(send(**changes))


@pytest.mark.parametrize("target", [{"collection": [], "index": 0}, {"collection": "posts", "index": True},
                                    {"collection": "posts", "index": -1}, {"collection": "posts", "index": 0, "payload": {}}])
def test_invalid_media_target_is_validation_error(target):
    with pytest.raises(ValidationError):
        operation_fields({"action": "video", "operation_key": S, "persona_id": P, "source_message_id": S, "target": target})


@pytest.mark.parametrize("patch", [{}, {"title": ""}, {"title": "x" * 201}, {"archived": 1}, {"created_by_member_id": S}])
def test_metadata_patch_rejects_invalid_fields(patch):
    with pytest.raises(ValidationError):
        patch_fields(patch)


def test_uuid_timestamps_and_claim_tokens_are_safely_projected():
    result = serialize({"id": UUID(S), "created_at": datetime(2026, 10, 18, tzinfo=timezone.utc),
                        "structured_data": {"operation": {"claim_token": "PRIVATE", "state": "unknown"}}})
    assert result["id"] == S and "PRIVATE" not in str(result)
    assert result["created_at"].endswith("+00:00")


def test_legacy_and_unknown_future_payloads_are_preserved_without_interpretation():
    assert public_message({"content": "Legacy", "structured_data": {}})["content"] == "Legacy"
    future = {"schema_version": 99, "type": "future", "payload": {"unknown": "preserve"}}
    assert public_message({"structured_data": future})["structured_data"] == future


def test_cursor_and_etag_roundtrip():
    timestamp = datetime(2026, 10, 18, tzinfo=timezone.utc)
    assert decode_cursor(encode_cursor(timestamp, S)) == (timestamp, S)
    assert metadata_etag({"title": "Hello", "archived_at": None}) != metadata_etag({"title": "Changed", "archived_at": None})
    assert page_limit(None, 30) == 30 and page_limit("100", 30) == 100


@pytest.mark.parametrize("cursor", ["x", "WzEsMl0", "WyIyMDI2LTEwLTE4Iiwibm9wZSJd", "x" * 513])
def test_malformed_cursors_rejected(cursor):
    with pytest.raises(ValidationError):
        decode_cursor(cursor)
