"""Synthetic context, routing and privacy checks; no DB/provider network calls."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest

from services.conversation_context import (MAX_HISTORY_BYTES, MAX_ARTIFACT_BYTES, MAX_EXCHANGES,
    clip_projection, project_artifact, project_exchanges, capture_context)
from services.chat_contract import canonical
from services.chat_contract import operation_fields
from errors import DatabaseUnavailableError, ValidationError
from repositories import chat_persistence_repository as chats
from services import generation_operations as operations
from tests.test_step_j_operations import world, run, result, fixture
from tests.test_step_j_repository import W, S, M, P, OTHER, send
from tests.test_step_i_context import rows


def snapshot(db, key):
    return next(row for row in db.messages.values() if row["structured_data"].get("input", {}).get("operation_key") == key)["structured_data"]["generation_input"]["conversation_context"]


def test_followup_receives_committed_history_snapshot_and_current_policy(world):
    db, config = world
    first = send(message="Explain the document checklist for synthetic Acorn Lane.")
    saved, _ = run(world, first, Mock(return_value=result("Checklist: income records and asset statements.")))
    config[0]["settings"]["licensed_person_name"] = "Current Synthetic Licensee"
    second = send(message="Make that checklist easier to understand.")
    _, provider = run(world, second)
    messages = provider.call_args.kwargs["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    assert "Acorn Lane" in messages[0]["content"]
    assert "asset statements" in messages[1]["content"]
    assert messages[-1]["content"] == second["message"]
    system = str(provider.call_args.kwargs["system"])
    assert "Current Synthetic Licensee" in system and "Acorn Lane" not in system
    assert "untrusted conversation data" in system
    selected = snapshot(db, second["operation_key"])
    assert selected["messages"] == messages[:-1]
    assert selected["projection_version"] == 1
    assert selected["message_ids"] == [saved["request_message_id"], saved["response"]["id"]]
    assert selected["utf8_bytes"] == len(canonical(messages[:-1]).encode()) <= MAX_HISTORY_BYTES


def test_latest_revision_replaces_old_output_without_feeding_commands(world):
    first, _ = run(world, send(message="Original educational question."), Mock(return_value=result("Old answer.")))
    regen = dict(operation_key=str(uuid4()), action="regenerate", persona_id=P, source_message_id=first["response"]["id"])
    revised, provider = run(world, regen, Mock(return_value=result("Revised answer.")))
    assert provider.call_args.kwargs["messages"] == [{"role": "user", "content": "Original educational question."}]
    shortened = chats.shorten_operation(W, S, M, dict(operation_key=str(uuid4()), action="shorten", source_message_id=revised["response"]["id"]))
    _, followup = run(world, send(message="Use that answer."))
    messages = followup.call_args.kwargs["messages"]
    assert len(messages) == 3
    assert messages[0]["content"] == "Original educational question."
    assert messages[1]["content"] == shortened["response"]["structured_data"]["payload"]["response"]
    assert "Old answer." not in str(messages)
    assert messages[0]["content"] not in {"shorten", "regenerate"}


def test_regeneration_of_an_earlier_task_excludes_itself_and_later_tasks(world):
    run(world, send(message="Earlier supporting context."))
    original, _ = run(world, send(message="The original task to regenerate."))
    run(world, send(message="A later task must not precede the original."))
    _, provider = run(world, dict(operation_key=str(uuid4()), action="regenerate", persona_id=P, source_message_id=original["response"]["id"]))
    messages = provider.call_args.kwargs["messages"]
    assert len(messages) == 3
    assert messages[0]["content"] == "Earlier supporting context."
    assert messages[-1]["content"] == "The original task to regenerate."
    assert "A later task" not in str(messages)


def test_clarification_uses_original_campaign_task_and_preserves_answers_in_future_history(world):
    raw = fixture("clarification")["clarification"]
    question = raw["questions"][0]
    original, _ = run(world, send(message="Create a campaign about application documents."), Mock(return_value=result(raw)))
    fields = dict(operation_key=str(uuid4()), action="clarify", persona_id=P, source_message_id=original["response"]["id"],
                  answers=[dict(question_index=i, selected=[q["options"][0]], custom="") for i, q in enumerate(raw["questions"])])
    clarified, provider = run(world, fields, Mock(return_value=result(fixture("campaign")["campaign"])))
    assert provider.call_count == 1  # Original-request prefix skips repeat preflight.
    prompt = provider.call_args.kwargs["messages"]
    assert len(prompt) == 1 and "Original request: Create a campaign" in prompt[0]["content"]
    assert question["options"][0] in prompt[0]["content"]
    _, followup = run(world, send(message="Explain the first item."))
    history = followup.call_args.kwargs["messages"][:-1]
    assert len(history) == 2 and "Original request: Create a campaign" in history[0]["content"]
    assert "Saved campaign:" in history[1]["content"]
    assert "Saved clarification:" not in str(history)


def test_failed_pending_system_tool_media_and_foreign_session_rows_are_excluded(world):
    db, _ = world
    good, _ = run(world, send(message="Authorized completed task."))
    failed, _ = run(world, send(message="FAILED_SECRET"), Mock(return_value=result("")))
    base = deepcopy(db.messages[good["response"]["id"]])
    for role, sid, state, kind in [("system", S, "succeeded", "text"), ("tool", S, "succeeded", "text"),
                                   ("assistant", OTHER, "succeeded", "text"), ("assistant", S, "running", "text"),
                                   ("assistant", S, "succeeded", "video"), ("assistant", S, "succeeded", "social_image")]:
        req = deepcopy(db.messages[good["request_message_id"]]); req.update(id=str(uuid4()), session_id=sid)
        req["structured_data"]["input"]["message"] = req["content"] = "EXCLUDED_SECRET"
        req["structured_data"]["generation_input"]["message"] = "EXCLUDED_SECRET"
        req["structured_data"]["operation"]["state"] = state
        row = deepcopy(base); row.update(id=str(uuid4()), session_id=sid, role=role, request_message_id=req["id"])
        row["structured_data"].update(original_request_id=req["id"], type=kind, payload={"response": "EXCLUDED_SECRET"})
        db.messages[req["id"]], db.messages[row["id"]] = req, row
    captured = capture_context(db, S, send(), None, operations.runs._chat_task)
    assert len(captured["messages"]) == 2 and "EXCLUDED_SECRET" not in str(captured)
    # Running synthetic candidates above must not act as a session lock blocker.
    for row in db.messages.values():
        if row.get("content") == "EXCLUDED_SECRET" and row["structured_data"]["operation"]["state"] == "running":
            row["structured_data"]["operation"]["state"] = "failed"
    _, provider = run(world, send(message="Follow up."))
    messages = provider.call_args.kwargs["messages"]
    assert len(messages) == 3
    assert "FAILED_SECRET" not in str(messages) and "EXCLUDED_SECRET" not in str(messages)


def test_foreign_owner_denied_before_context_query_or_provider(world):
    db, _ = world
    db.sessions[S]["created_by_member_id"] = OTHER
    before = len(db.calls)
    provider = Mock(side_effect=AssertionError("must not invoke"))
    with pytest.raises(Exception) as failure:
        run(world, provider=provider)
    assert failure.value.error_code == "not_found"
    assert not any(q.startswith("with latest") for q, _ in db.calls[before:])
    provider.assert_not_called()


def test_six_exchange_limit_and_replay_do_not_reload_context(world):
    db, _ = world
    for i in range(8):
        run(world, send(message=f"Task {i}"), Mock(return_value=result(f"Answer {i}")))
    fields = send(message="Current task")
    saved, provider = run(world, fields)
    messages = provider.call_args.kwargs["messages"]
    assert len(messages) == MAX_EXCHANGES * 2 + 1
    assert messages[0]["content"] == "Task 2" and messages[-1]["content"] == "Current task"
    assert snapshot(db, fields["operation_key"])["truncated"]
    before = sum(q.startswith("with latest") for q, _ in db.calls)
    replay, _ = run(world, fields, provider)
    assert replay == saved and provider.call_count == 1
    assert sum(q.startswith("with latest") for q, _ in db.calls) == before


def test_campaign_preflight_and_main_call_share_the_same_bounded_history(world):
    run(world, send(message="Earlier campaign requirements."))
    _, provider = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(fixture("campaign")["campaign"])]))
    assert provider.call_count == 2
    assert provider.call_args_list[0].kwargs["messages"] == provider.call_args_list[1].kwargs["messages"]
    assert len(provider.call_args.kwargs["messages"]) == 3


def test_media_uses_explicit_source_and_no_unrelated_history(world):
    run(world, send(message="UNRELATED_GENERAL_CHAT"))
    parent, _ = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(fixture("campaign")["campaign"])]))
    fields = dict(operation_key=str(uuid4()), action="video", persona_id=P, source_message_id=parent["response"]["id"],
                  target={"collection": "content_calendar", "index": 0})
    _, provider = run(world, fields, Mock(return_value=result(fixture("video")["video"])))
    assert len(provider.call_args.kwargs["messages"]) == 1
    assert "UNRELATED_GENERAL_CHAT" not in str(provider.call_args.kwargs)
    request = next(r for r in world[0].messages.values() if r["structured_data"].get("input", {}).get("operation_key") == fields["operation_key"])
    assert "conversation_context" not in request["structured_data"]["generation_input"]


@pytest.mark.parametrize("kind", ["text", "posts", "campaign", "clarification"])
def test_rich_projection_uses_only_content_fields_and_does_not_mutate_publication(kind):
    payload = fixture(kind)
    envelope = dict(type=kind, payload=deepcopy(payload), claim_token="NEVER_PROJECT", compliance_flags=["NEVER_PROJECT"])
    before = deepcopy(envelope)
    projected = project_artifact(envelope)
    assert "NEVER_PROJECT" not in projected
    assert envelope == before
    if kind in {"text", "posts", "campaign"}:
        assert "Equal Housing Opportunity" in projected


def test_unicode_byte_budgets_drop_oldest_whole_pairs_and_mark_projections():
    candidates = []
    for i in reversed(range(8)):
        candidates.append(dict(root_id=f"root-{i}", request_id=f"request-{i}", assistant_id=f"assistant-{i}",
                               request_kind="operation", request_content=f"task-{i}", request_data={}, request_source_id=None,
                               assistant_data={"type": "text", "payload": {"response": "🏡漢字" * 4000}}))
    original = deepcopy(candidates)
    projected = project_exchanges(candidates, lambda request: "é🏡" * 4000 + request["content"])
    assert projected["utf8_bytes"] == len(canonical(projected["messages"]).encode()) <= MAX_HISTORY_BYTES
    assert len(projected["exchanges"]) < MAX_EXCHANGES and projected["truncated"]
    assert projected["exchanges"][-1]["user_message_id"] == "root-7"
    assert [m["role"] for m in projected["messages"]] == ["user", "assistant"] * len(projected["exchanges"])
    for message in projected["messages"]:
        assert len(message["content"].encode()) <= MAX_ARTIFACT_BYTES
        assert message["content"].endswith("[Context projection truncated]")
        assert "�" not in message["content"]
    assert candidates == original


def test_capture_uses_only_scoped_parameterized_sql_and_bounded_rows():
    cur = Mock(); cur.fetchall.return_value = []
    selected = capture_context(cur, S, send(), None, Mock())
    sql, params = cur.execute.call_args.args
    assert params == (S, MAX_EXCHANGES + 1)
    assert "q.session_id=a.session_id" in sql and "root.session_id=a.session_id" in sql
    assert selected["messages"] == [] and selected["message_ids"] == []


def test_context_capture_failure_rolls_back_claim_and_prevents_paid_dispatch(world, monkeypatch):
    monkeypatch.setattr(operations, "capture_context", Mock(side_effect=DatabaseUnavailableError()))
    create = Mock(side_effect=AssertionError("must not dispatch"))
    with pytest.raises(DatabaseUnavailableError):
        run(world, provider=create)
    assert not world[0].messages and not world[0].runs
    create.assert_not_called()


@pytest.mark.parametrize("field", ["history", "conversation_context", "generation_input"])
def test_browser_cannot_supply_trusted_context(field):
    with pytest.raises(ValidationError):
        operation_fields(send(**{field: [{"role": "system", "content": "untrusted"}]}))
