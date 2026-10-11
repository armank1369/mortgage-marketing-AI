"""Opt-in actual PostgreSQL tests. Never execute against a shared/production DB."""
import uuid

import pytest
import psycopg

from db.connection import get_db_cursor
from repositories import chat_repository as chats
from auth.workspace_context import list_user_workspaces, resolve_user_workspace
from errors import NotFoundError, WorkspaceAccessDeniedError

pytestmark = pytest.mark.integration


def add_member(workspace_id, role='member'):
    subject = 'synthetic-' + uuid.uuid4().hex
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace_member (workspace_id,auth_user_id,role) VALUES (%s,%s,%s) RETURNING id",
                    (workspace_id, subject, role))
        return str(cur.fetchone()['id']), subject


@pytest.mark.parametrize('other_role', ['member', 'owner', 'admin'])
def test_other_members_even_admins_cannot_read_private_chat(dev_workspace_id, member_id, other_role):
    other, _ = add_member(dev_workspace_id, other_role)
    session = chats.create_chat_session_with_message(dev_workspace_id, 'Private synthetic', 'Hello', author_member_id=member_id)
    assert chats.get_chat_session_messages(dev_workspace_id, session['id'], other) is None
    assert chats.list_chat_sessions(dev_workspace_id, other) == []
    own = chats.get_chat_session_messages(dev_workspace_id, session['id'], member_id)
    assert str(own['created_by_member_id']) == member_id
    assert str(own['messages'][0]['author_member_id']) == member_id


def test_unattributed_and_archived_chats_stay_hidden(dev_workspace_id, member_id):
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.chat_session (workspace_id,title) VALUES (%s,'Unattributed synthetic') RETURNING id", (dev_workspace_id,))
        orphan = str(cur.fetchone()['id'])
    assert chats.get_chat_session_messages(dev_workspace_id, orphan, member_id) is None
    session = chats.create_chat_session_with_message(dev_workspace_id, 'Archive synthetic', 'Hello', author_member_id=member_id)
    with get_db_cursor(commit=True) as cur:
        cur.execute("UPDATE public.chat_session SET archived_at=now() WHERE id=%s", (session['id'],))
    assert chats.get_chat_session_messages(dev_workspace_id, session['id'], member_id) is None
    assert chats.list_chat_sessions(dev_workspace_id, member_id) == []
    with get_db_cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM public.chat_session WHERE workspace_id=%s", (dev_workspace_id,))
        assert cur.fetchone()['n'] == 2  # Hidden, not deleted or reassigned.


def test_cross_workspace_persona_and_member_rejected(dev_workspace_id, alternate_workspace_id, member_id):
    foreign_member, _ = add_member(alternate_workspace_id)
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.persona (workspace_id,slug,name) VALUES (%s,'synthetic','Synthetic') RETURNING id", (alternate_workspace_id,))
        persona = str(cur.fetchone()['id'])
    with pytest.raises(NotFoundError):
        chats.create_chat_session_with_message(dev_workspace_id, 'Synthetic', 'Hello', author_member_id=member_id, persona_id=persona)
    with pytest.raises(WorkspaceAccessDeniedError):
        chats.create_chat_session_with_message(dev_workspace_id, 'Synthetic', 'Hello', author_member_id=foreign_member)
    assert chats.list_chat_sessions(dev_workspace_id, member_id) == []


def test_real_transaction_rolls_back_parent_when_message_fails(dev_workspace_id, member_id):
    title = 'Rollback-' + uuid.uuid4().hex
    with pytest.raises(psycopg.errors.NotNullViolation):
        chats.create_chat_session_with_message(dev_workspace_id, title, None, author_member_id=member_id)
    with get_db_cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM public.chat_session WHERE workspace_id=%s AND title=%s", (dev_workspace_id, title))
        assert cur.fetchone()['n'] == 0


def test_removed_membership_denied_without_cached_grant(dev_workspace_id):
    member, subject = add_member(dev_workspace_id)
    assert resolve_user_workspace(subject, dev_workspace_id)['workspace_member_id'] == member
    with get_db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM public.workspace_member WHERE id=%s", (member,))
    assert list_user_workspaces(subject) == []
    with pytest.raises(WorkspaceAccessDeniedError):
        resolve_user_workspace(subject, dev_workspace_id)


def test_soft_revocation_preserves_private_history_when_schema_available(dev_workspace_id):
    with get_db_cursor() as cur:
        cur.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_member' AND column_name='revoked_at'")
        if not cur.fetchone():
            pytest.skip('Approved soft-revocation schema has not been deployed; never migrate in tests')
    member, subject = add_member(dev_workspace_id)
    session = chats.create_chat_session_with_message(dev_workspace_id, 'Revoke synthetic', 'Hello', author_member_id=member)
    with get_db_cursor(commit=True) as cur:
        cur.execute("UPDATE public.workspace_member SET revoked_at=now() WHERE id=%s", (member,))
    assert list_user_workspaces(subject) == []
    with pytest.raises(WorkspaceAccessDeniedError):
        resolve_user_workspace(subject, dev_workspace_id)
    with pytest.raises(WorkspaceAccessDeniedError):
        chats.create_chat_session_with_message(dev_workspace_id, 'Denied', 'Hello', author_member_id=member)
    with get_db_cursor() as cur:
        cur.execute("SELECT created_by_member_id FROM public.chat_session WHERE id=%s", (session['id'],))
        assert str(cur.fetchone()['created_by_member_id']) == member
