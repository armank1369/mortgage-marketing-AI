"""Opt-in J.5/J.7 SQL acceptance. Approved isolated fixtures; fake providers only."""
import multiprocessing
from unittest.mock import Mock
from uuid import uuid4

import pytest

from db.connection import get_db_cursor
from errors import ChatConflictError, NotFoundError
from repositories import chat_persistence_repository as chats
from services.chat_contract import canonical
from services.generation_operations import execute_operation, GenerationRuntime
from tests.test_step_j_integration import durable_session, operation
from tests.test_step_j_generation_integration import generation_session, provider_result, execute, attempts

pytestmark = pytest.mark.integration


def test_real_context_snapshot_latest_revision_boundary_and_session_isolation(generation_session):
    session = generation_session
    wid, sid, mid, persona, _ = session
    first = execute(session, operation(persona, message="Synthetic original checklist task."), lambda **_: provider_result("Original checklist."))
    second = execute(session, operation(persona, message="Explain that checklist."), Mock(return_value=provider_result("Checklist followup.")))
    detail = chats.get_session(wid, sid, mid)
    snapshot = next(m for m in detail["messages"] if m["id"] == second["request_message_id"])["structured_data"]["generation_input"]["conversation_context"]
    assert len(snapshot["messages"]) == 2
    assert snapshot["message_ids"] == [first["request_message_id"], first["response"]["id"]]
    assert snapshot["utf8_bytes"] == len(canonical(snapshot["messages"]).encode())
    short = chats.shorten_operation(wid, sid, mid, dict(action="shorten", operation_key=str(uuid4()), source_message_id=first["response"]["id"]))
    provider = Mock(return_value=provider_result("Revised original checklist."))
    revised = execute(session, dict(action="regenerate", operation_key=str(uuid4()), persona_id=persona, source_message_id=short["response"]["id"]), provider)
    assert provider.call_args.kwargs["messages"] == [{"role": "user", "content": "Synthetic original checklist task."}]
    other_sid = str(uuid4())
    chats.create_session(wid, other_sid, mid, title="Separate synthetic context", persona_id=persona)
    other = (wid, other_sid, mid, persona, {})
    execute(other, operation(persona, message="FOREIGN_CONVERSATION_SECRET"), lambda **_: provider_result("FOREIGN_CONVERSATION_SECRET"))
    last_provider = Mock(return_value=provider_result("Current response."))
    last = execute(session, operation(persona, message="Use our earlier checklist."), last_provider)
    messages = last_provider.call_args.kwargs["messages"]
    assert len(messages) == 5 and "Revised original checklist." in messages[1]["content"]
    assert "Original checklist." not in str(messages) and "FOREIGN_CONVERSATION_SECRET" not in str(messages)
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace_member (workspace_id,auth_user_id,role) VALUES (%s,%s,'admin') RETURNING id",
                    (wid, "synthetic-context-admin-" + uuid4().hex))
        admin = str(cur.fetchone()["id"])
    collaborator_provider = Mock(return_value=provider_result("Shared workspace followup."))
    shared = execute((wid, sid, admin, persona, {}), operation(persona), collaborator_provider)
    assert shared["state"] == "succeeded"
    detail = chats.get_session(wid, sid, admin)
    assert detail["created_by_member_id"] == mid
    assert next(m for m in detail["messages"] if m["id"] == shared["request_message_id"])["author_member_id"] == admin


def _interrupted_worker(session, fields, entered, release):
    # Windows spawn gets a fresh pool. The parent opt-in fixture supplies DATABASE_URL
    # only through the subprocess environment; no URL or credentials enter test output.
    def provider(**_):
        entered.set()  # start_run has committed and released its connection already.
        release.wait(timeout=45)
        return provider_result("This interrupted worker must never publish.")
    execute(session, fields, provider)


def test_real_process_interruption_requires_explicit_retry_without_redispatch(generation_session):
    session = generation_session
    wid, sid, mid, persona, _ = session
    fields = operation(persona)
    context = multiprocessing.get_context("spawn")
    entered, release = context.Event(), context.Event()
    child = context.Process(target=_interrupted_worker, args=(session, fields, entered, release))
    child.start()
    no_call = Mock(side_effect=AssertionError("must never auto-dispatch"))
    try:
        assert entered.wait(timeout=30), "Synthetic worker did not reach dispatch"
        assert attempts(session)[0]["status"] == "started"
        assert execute(session, fields, no_call)["state"] == "running"
        child.terminate(); child.join(timeout=10)
        assert not child.is_alive()
        assert len(chats.get_session(wid, sid, mid)["messages"]) == 1
        # Age only the captured fixture request to simulate the five-minute stale
        # presentation boundary. This does not mark it failed or authorize takeover.
        with get_db_cursor(commit=True) as cur:
            cur.execute("""UPDATE public.chat_message SET structured_data=jsonb_set(structured_data,
                '{operation,last_progress_at}',to_jsonb((now()-interval '6 minutes')::text))
                WHERE session_id=%s AND client_message_key=%s AND role='user'
                RETURNING id""", (sid, "request:" + fields["operation_key"]))
            assert cur.fetchone()
        assert execute(session, fields, no_call)["state"] == "unknown"
        no_call.assert_not_called()
        replacement_provider = Mock(return_value=provider_result("Explicit replacement output."))
        replacement = execute(session, operation(persona, retry_of=fields["operation_key"], acknowledge_uncertain_outcome=True), replacement_provider)
        assert replacement["state"] == "succeeded" and replacement_provider.call_count == 1
        assert chats.get_operation(wid, sid, mid, fields["operation_key"])["state"] == "abandoned"
        rows = attempts(session)
        assert [row["status"] for row in rows] == ["started", "succeeded"]
        assert len(chats.get_session(wid, sid, mid)["messages"]) == 3
    finally:
        if child.is_alive():
            child.terminate(); child.join(timeout=10)


def test_real_abandoned_campaign_cannot_dispatch_second_stage(generation_session):
    session = generation_session
    wid, sid, mid, persona, _ = session
    fields = operation(persona, message="Create a campaign")
    def provider(**_):
        with get_db_cursor() as cur:
            cur.execute("SELECT structured_data FROM public.chat_message WHERE session_id=%s AND client_message_key=%s",
                        (sid, "request:" + fields["operation_key"]))
            token = cur.fetchone()["structured_data"]["operation"]["claim_token"]
        chats.progress_operation(wid, sid, mid, fields["operation_key"], token, state="unknown", safe_error_code="provider_outcome_unknown")
        chats.abandon_operation(wid, sid, mid, fields["operation_key"], acknowledged=True)
        return provider_result({"proceed": True})
    create = Mock(side_effect=provider)
    with pytest.raises(ChatConflictError):
        execute(session, fields, create)
    assert create.call_count == 1 and len(attempts(session)) == 1
    assert len(chats.get_session(wid, sid, mid)["messages"]) == 1


def test_real_stale_media_parent_conflicts_and_current_artifact_creates_revision(generation_session):
    from tests.test_step_j_operations import fixture
    session = generation_session
    persona = session[3]
    campaign = fixture("campaign")["campaign"]
    values = iter([{"proceed": True}, campaign])
    parent = execute(session, operation(persona, message="Create a campaign"), lambda **_: provider_result(next(values)))
    image = fixture("social_image")
    raw = {"template": image["template"], "slots": image["slots"]}
    fields = dict(action="social_image", operation_key=str(uuid4()), persona_id=persona,
                  source_message_id=parent["response"]["id"], target={"collection": "content_calendar", "index": 0})
    first = execute(session, fields, lambda **_: provider_result(raw))
    before = len(attempts(session))
    denied = Mock(side_effect=AssertionError("Stale parent must not call provider"))
    with pytest.raises(ChatConflictError) as conflict:
        execute(session, dict(fields, operation_key=str(uuid4())), denied)
    assert conflict.value.error_code == "stale_source" and len(attempts(session)) == before
    denied.assert_not_called()
    revised = execute(session, dict(fields, operation_key=str(uuid4()), source_message_id=first["response"]["id"]), lambda **_: provider_result(raw))
    assert revised["state"] == "succeeded" and revised["response"]["kind"] == "revision"
    assert revised["response"]["source_message_id"] == first["response"]["id"]
