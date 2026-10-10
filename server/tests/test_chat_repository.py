"""
server/tests/test_chat_repository.py
Integration tests verifying atomic chat transactions and multi-tenant isolation.
"""

import uuid
import pytest
from repositories.chat_repository import (
    create_chat_session_with_message,
    get_chat_session_messages,
    list_chat_sessions,
)
from db.connection import get_db_cursor


@pytest.fixture
def temp_chat_session(dev_workspace_id):
    """Creates a temporary chat session and cleans it up after test execution."""
    session = create_chat_session_with_message(
        workspace_id=dev_workspace_id,
        title=f"Test Chat {uuid.uuid4().hex[:6]}",
        initial_content="Inquiry about conventional mortgage loan options."
    )
    yield session

    # Cleanup test data using transaction block
    with get_db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM public.chat_message WHERE session_id = %s;", (session["id"],))
        cur.execute("DELETE FROM public.chat_session WHERE id = %s;", (session["id"],))


def test_atomic_chat_session_creation(dev_workspace_id, temp_chat_session):
    """Verify session and initial message are committed atomically."""
    assert temp_chat_session["workspace_id"] == dev_workspace_id
    assert len(temp_chat_session["messages"]) == 1
    assert temp_chat_session["messages"][0]["role"] == "user"
    assert "conventional mortgage" in temp_chat_session["messages"][0]["content"]


def test_cross_workspace_chat_isolation(temp_chat_session, alternate_workspace_id):
    """
    CRITICAL SECURITY INVARIANT:
    Chat session exists in dev_workspace, but querying with alternate_workspace_id must return None.
    """
    session_id = str(temp_chat_session["id"])
    leaked_record = get_chat_session_messages(
        workspace_id=alternate_workspace_id,
        session_id=session_id
    )
    assert leaked_record is None, "SECURITY FAILURE: Cross-workspace chat session leak detected!"