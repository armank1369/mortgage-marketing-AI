"""Opt-in J.3 SQL orchestration tests. Actual Neon fixtures, synthetic AI only.

Uses the same approved development fixture creation/cleanup as J.2. Never creates
an Anthropic client and never changes existing workspace/customer configuration.
"""
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock
import json

import anthropic
import httpx
import pytest

from db.connection import get_db_cursor
from errors import DatabaseUnavailableError, PermissionDeniedError
from repositories import chat_persistence_repository as chats
from repositories import generation_operation_repository as runs
from services.generation_operations import execute_operation, GenerationRuntime
from tests.test_step_j_integration import durable_session, operation

pytestmark = pytest.mark.integration


@pytest.fixture
def generation_session(durable_session):
    wid, _, _, _, _ = durable_session
    with get_db_cursor(commit=True) as cur:
        cur.execute("""UPDATE public.brand_profile bp SET nmls_id='123456',dre_number='00123456',
            settings=COALESCE(settings,'{}'::jsonb) || '{"licensed_person_name":"Synthetic Licensee"}'::jsonb
            FROM public.workspace w WHERE bp.workspace_id=w.id AND w.id=%s AND w.environment='test'
            RETURNING bp.workspace_id""", (wid,))
        assert cur.fetchone()
    return durable_session


def provider_result(value="Synthetic educational response."):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=value if isinstance(value, str) else json.dumps(value))],
                           usage=SimpleNamespace(input_tokens=90, cache_creation_input_tokens=10, cache_read_input_tokens=60, output_tokens=30),
                           model="synthetic-test-model", stop_reason="end_turn")


def execute(session, fields, create):
    wid, sid, mid, _, _ = session
    return execute_operation(wid, sid, mid, fields, GenerationRuntime(create=create, model="synthetic-test-model"))


def attempts(session):
    with get_db_cursor() as cur:
        cur.execute("SELECT * FROM public.ai_run WHERE session_id=%s ORDER BY created_at,id", (session[1],))
        return [dict(row) for row in cur.fetchall()]


def test_real_generation_commits_run_before_call_and_replays(generation_session):
    session = generation_session
    fields = operation(session[3])
    def create(**kwargs):
        rows = attempts(session)  # Separate checkout sees a committed invocation.
        assert len(rows) == 1 and rows[0]["status"] == "started"
        return provider_result()
    provider = Mock(side_effect=create)
    result = execute(session, fields, provider)
    assert execute(session, fields, provider) == result
    assert provider.call_count == 1 and result["state"] == "succeeded"
    row = attempts(session)[0]
    assert str(row["response_message_id"]) == result["response"]["id"]
    assert str(row["request_message_id"]) == result["request_message_id"]
    assert row["input_tokens"] == 90 and row["cache_read_input_tokens"] == 60
    assert row["prompt_cache_mode"] == "explicit" and len(row["system_prompt_hash"]) == 64
    assert "NMLS #123456" in result["response"]["content"]


def test_real_campaign_has_two_runs_and_one_response_link(generation_session):
    from pathlib import Path
    fixture = json.loads((Path(__file__).resolve().parents[2] / "docs/fixtures/step_j_v1.json").read_text())
    campaign = next(c for c in fixture["cases"] if c["type"] == "campaign")["payload"]["campaign"]
    values = iter([{"proceed": True}, campaign])
    def create(**kwargs):
        rows = attempts(generation_session)
        if len(rows) == 2:
            assert rows[0]["status"] == "succeeded" and rows[0]["response_message_id"] is None
        return provider_result(next(values))
    result = execute(generation_session, operation(generation_session[3], message="Create a campaign"), create)
    rows = attempts(generation_session)
    assert result["state"] == "succeeded" and len(rows) == 2
    assert rows[0]["response_message_id"] is None
    assert str(rows[1]["response_message_id"]) == result["response"]["id"]


@pytest.mark.parametrize("timeout", [False, True])
def test_real_failure_and_unknown_outcome_do_not_insert_assistant(generation_session, timeout):
    session = generation_session
    provider = Mock(return_value=provider_result(""))
    if timeout:
        provider.side_effect = anthropic.APITimeoutError(request=httpx.Request("POST", "https://synthetic.invalid"))
    fields = operation(session[3])
    result = execute(session, fields, provider)
    assert result["state"] == ("unknown" if timeout else "failed")
    assert attempts(session)[0]["status"] == ("started" if timeout else "failed")
    assert len(chats.get_session(session[0], session[1], session[2])["messages"]) == 1
    assert execute(session, fields, provider) == result and provider.call_count == 1


def test_real_atomic_completion_retries_save_only(generation_session, monkeypatch):
    original = runs._save_run
    calls = []
    def interrupted(*args, **kwargs):
        if kwargs.get("response_id"):
            calls.append(1)
            if len(calls) == 1:
                raise DatabaseUnavailableError()  # Assistant insert must roll back too.
        return original(*args, **kwargs)
    monkeypatch.setattr(runs, "_save_run", interrupted)
    provider = Mock(return_value=provider_result())
    result = execute(generation_session, operation(generation_session[3]), provider)
    assert result["state"] == "succeeded" and provider.call_count == 1 and len(calls) == 2
    assert len(chats.get_session(*generation_session[:3])["messages"]) == 2
    assert len(attempts(generation_session)) == 1


def test_real_role_downgrade_after_dispatch_denies_completion(generation_session):
    wid, _, mid, persona, _ = generation_session
    def create(**kwargs):
        with get_db_cursor(commit=True) as cur:
            cur.execute("UPDATE public.workspace_member SET role='viewer' WHERE id=%s AND workspace_id=%s", (mid, wid))
        return provider_result()
    with pytest.raises(PermissionDeniedError):
        execute(generation_session, operation(persona), create)
    assert len(chats.get_session(*generation_session[:3])["messages"]) == 1
    assert attempts(generation_session)[0]["response_message_id"] is None


def test_real_inflight_duplicate_returns_without_waiting_for_provider(generation_session):
    fields = operation(generation_session[3])
    entered, release = Event(), Event()
    def create(**kwargs):
        entered.set()
        assert release.wait(timeout=15)
        return provider_result()
    provider = Mock(side_effect=create)
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(execute, generation_session, fields, provider)
        try:
            assert entered.wait(timeout=15)
            second = executor.submit(execute, generation_session, fields, provider)
            assert second.result(timeout=8)["state"] == "running"
            assert provider.call_count == 1
        finally:
            release.set()
        assert first.result(timeout=20)["state"] == "succeeded"
