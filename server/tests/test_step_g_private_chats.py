"""Unit checks of repository boundaries; actual SQL is exercised by opt-in integration tests."""
from contextlib import contextmanager
from unittest.mock import Mock

import pytest

from repositories import chat_repository as chats
from errors import NotFoundError, WorkspaceAccessDeniedError

W = "11111111-1111-4111-8111-111111111111"
M = "22222222-2222-4222-8222-222222222222"
S = "33333333-3333-4333-8333-333333333333"
P = "44444444-4444-4444-8444-444444444444"


@pytest.fixture
def cursor(monkeypatch):
    cur = Mock()
    @contextmanager
    def open_cursor():
        yield cur
    monkeypatch.setattr(chats, 'get_db_cursor', open_cursor)
    monkeypatch.setattr(chats, 'get_db_transaction', open_cursor)
    return cur


def test_private_read_predicates_and_no_messages_after_denial(cursor):
    cursor.fetchone.return_value = None
    assert chats.get_chat_session_messages(W, S, M) is None
    cursor.execute.assert_called_once()
    sql, args = cursor.execute.call_args.args
    assert args == (S, W, M)
    assert 'created_by_member_id = %s' in sql
    assert 'archived_at IS NULL' in sql
    cursor.fetchall.assert_not_called()


def test_private_list_requires_creator(cursor):
    cursor.fetchall.return_value = []
    assert chats.list_chat_sessions(W, M) == []
    sql, args = cursor.execute.call_args.args
    assert args == (W, M, 50)
    assert 'created_by_member_id = %s' in sql


def test_foreign_member_cannot_create(cursor):
    cursor.fetchone.return_value = None
    with pytest.raises(WorkspaceAccessDeniedError):
        chats.create_chat_session_with_message(W, 'Synthetic', 'Hello', author_member_id=M)
    assert cursor.execute.call_count == 1
    assert 'INSERT' not in cursor.execute.call_args.args[0]


def test_foreign_or_deleted_persona_cannot_create(cursor):
    cursor.fetchone.side_effect = [{'id': M}, None]
    with pytest.raises(NotFoundError):
        chats.create_chat_session_with_message(W, 'Synthetic', 'Hello', author_member_id=M, persona_id=P)
    assert cursor.execute.call_count == 2
    sql, args = cursor.execute.call_args.args
    assert args == (P, W)
    assert 'workspace_id = %s' in sql and 'deleted_at IS NULL' in sql


def test_member_attribution_on_both_inserts(cursor):
    cursor.fetchone.side_effect = [{'id': M}, {'id': P}, {'id': S, 'workspace_id': W}, {'id': P, 'session_id': S}]
    chats.create_chat_session_with_message(W, 'Synthetic', 'Hello', author_member_id=M, persona_id=P)
    assert cursor.execute.call_args_list[2].args[1] == (W, 'Synthetic', P, M)
    assert cursor.execute.call_args_list[3].args[1] == (S, M, P, 'user', 'message', 'Hello')


def test_failed_message_insert_exits_transaction_with_error(monkeypatch):
    exited = []
    cur = Mock()
    cur.fetchone.side_effect = [{'id': M}, {'id': S, 'workspace_id': W}]
    cur.execute.side_effect = [None, None, RuntimeError('synthetic failure')]
    @contextmanager
    def transaction():
        try:
            yield cur
        except Exception:
            exited.append('rollback')
            raise
    monkeypatch.setattr(chats, 'get_db_transaction', transaction)
    with pytest.raises(RuntimeError):
        chats.create_chat_session_with_message(W, 'Synthetic', 'Hello', author_member_id=M)
    assert exited == ['rollback']
