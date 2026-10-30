"""Actual orchestration/policy with synthetic SQL and provider. No network calls."""
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import json
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import anthropic
import httpx
import pytest

from errors import (ChatConflictError, DatabaseUnavailableError, NotFoundError,
                    PermissionDeniedError, WorkspaceAccessDeniedError)
from repositories import chat_persistence_repository as chats
from repositories import generation_operation_repository as runs
from services import generation_operations as operations
from services.chat_contract import canonical
from tests.test_step_g_routes import client
from tests.test_step_i_context import rows
from tests.test_step_j_repository import MemorySQL, W, S, M, P, OTHER, send


class GenerationSQL(MemorySQL):
    def __init__(self):
        super().__init__()
        self.runs, self.depth = {}, 0

    @contextmanager
    def transaction(self):
        saved = deepcopy(self.runs)
        self.depth += 1
        try:
            with super().transaction() as cur:
                yield cur
        except Exception:
            self.runs = saved
            raise
        finally:
            self.depth -= 1

    def execute(self, sql, params=()):
        q = " ".join(sql.lower().split())
        if q.startswith("with workspace_ideas as"):
            self.calls.append((q, params))
            latest = {}
            for row in self.messages.values():
                session = self.sessions.get(row['session_id'], {})
                envelope = row.get('structured_data') or {}
                request = self.messages.get(row.get('request_message_id'), {})
                if (session.get('workspace_id') != params[0]
                        or row['role'] != 'assistant' or envelope.get('schema_version') != 1
                        or envelope.get('type') not in {'text', 'posts', 'campaign'}
                        or request.get('structured_data', {}).get('operation', {}).get('state') != 'succeeded'):
                    continue
                root = envelope.get('original_request_id') or row.get('request_message_id')
                prior = latest.get(root)
                if not prior or (row['created_at'], row['id']) > (prior['created_at'], prior['id']):
                    latest[root] = row
            self.rows = sorted((r for r in latest.values() if r['id'] != params[1]), key=lambda r: (r['created_at'], r['id']), reverse=True)[:12]
            return
        if q.startswith("with latest as"):
            self.calls.append((q, params))
            sid, *rest = params
            latest = {}
            for row in self.messages.values():
                envelope = row.get("structured_data") or {}
                request = self.messages.get(row.get("request_message_id"))
                root = self.messages.get(envelope.get("original_request_id") or row.get("request_message_id"))
                if (row["session_id"] != sid or row["role"] != "assistant" or envelope.get("schema_version") != 1
                        or envelope.get("type") not in {"text", "posts", "campaign", "clarification"}
                        or not request or request["session_id"] != sid or request["role"] != "user"
                        or request["structured_data"].get("operation", {}).get("state") != "succeeded"
                        or not root or root["session_id"] != sid or root["role"] != "user"
                        or root["structured_data"].get("input", {}).get("action", "send") != "send"):
                    continue
                if len(rest) == 3 and (root["created_at"], root["id"]) >= tuple(rest[:2]):
                    continue
                previous = latest.get(root["id"])
                if previous and (previous["created_at"], previous["id"]) >= (row["created_at"], row["id"]):
                    continue
                latest[root["id"]] = row
            candidates = []
            for root_id, row in latest.items():
                request, root = self.messages[row["request_message_id"]], self.messages[root_id]
                candidates.append(dict(assistant_id=row["id"], assistant_data=row["structured_data"],
                                       request_id=request["id"], request_kind=request["kind"], request_content=request["content"],
                                       request_data=request["structured_data"], request_source_id=request.get("source_message_id"),
                                       root_id=root_id, root_created_at=root["created_at"]))
            self.rows = sorted(candidates, key=lambda r: (r["root_created_at"], r["root_id"]), reverse=True)[:params[-1]]
            return
        if "public.ai_run" not in q:
            super().execute(sql, params)
            if "and id<>%s" in q:
                self.rows = [r for r in self.rows if r["id"] != params[-1]]
            return
        self.calls.append((q, params))
        self.rows = []
        if q.startswith("insert"):
            sid, request, model, version, digest = params
            rid = str(uuid4())
            row = dict(id=rid, session_id=sid, request_message_id=request, model=model,
                       system_prompt_version=version, system_prompt_hash=digest, prompt_cache_mode="explicit",
                       status="started", response_message_id=None, created_at=datetime.now(timezone.utc))
            self.runs[rid] = row
            self.rows = [row]
        elif q.startswith("select"):
            if "where id=%s" in q:
                rid, sid, request = params
                row = self.runs.get(rid)
                self.rows = [row] if row and (row["session_id"], row["request_message_id"]) == (sid, request) else []
            else:
                self.rows = sorted([r for r in self.runs.values() if (r["session_id"], r["request_message_id"]) == tuple(params)],
                                   key=lambda r: (r["created_at"], r["id"]))
        elif q.startswith("update"):
            status, response, inp, creation, read, out, latency, error, model, rid, sid, request = params
            row = self.runs[rid]
            assert (row["session_id"], row["request_message_id"]) == (sid, request)
            assert response is None or not any(r["response_message_id"] == response and r["id"] != rid for r in self.runs.values())
            row.update(status=status, response_message_id=response, input_tokens=inp, cache_creation_input_tokens=creation,
                       cache_read_input_tokens=read, output_tokens=out, latency_ms=latency, error_text=error,
                       model=model or row["model"])
        else:
            raise AssertionError(q)


@pytest.fixture
def world(monkeypatch, rows):
    rows[1]["id"] = UUID(P)
    db = GenerationSQL()
    monkeypatch.setattr(chats, "get_db_transaction", db.transaction)
    monkeypatch.setattr(runs, "get_db_transaction", db.transaction)
    chats.create_session(W, S, M, title="Synthetic generation", persona_id=P)
    return db, rows


def result(value="Educational documentation guidance.", *, stop_reason="end_turn"):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=value if isinstance(value, str) else json.dumps(value))],
                           usage=SimpleNamespace(input_tokens=100, cache_creation_input_tokens=20, cache_read_input_tokens=50, output_tokens=40),
                           model="synthetic-model-returned", stop_reason=stop_reason)


def run(world, fields=None, provider=None, *, member_id=M):
    db, _ = world
    fields = fields or send()
    create = provider or Mock(return_value=result())
    response = operations.execute_operation(W, S, member_id, fields, operations.GenerationRuntime(create=create, model="synthetic-model"))
    return response, create


def fixture(kind):
    from pathlib import Path
    catalog = json.loads((Path(__file__).resolve().parents[2] / "docs/fixtures/step_j_v1.json").read_text())
    return next(c for c in catalog["cases"] if c["type"] == kind)["payload"]


def test_committed_run_before_call_and_atomic_response_provenance(world):
    db, _ = world
    def create(**kwargs):
        assert db.depth == 0
        assert len(db.runs) == 1 and next(iter(db.runs.values()))["status"] == "started"
        assert len(db.messages) == 1
        assert kwargs["thinking"] == {"type": "disabled"}
        return result()
    saved, _ = run(world, provider=create)
    assert saved["state"] == "succeeded"
    row = next(iter(db.runs.values()))
    assert row["status"] == "succeeded" and row["response_message_id"] == saved["response"]["id"]
    assert row["request_message_id"] == saved["request_message_id"]
    assert row["model"] == "synthetic-model-returned"
    assert row["cache_creation_input_tokens"] == 20 and row["cache_read_input_tokens"] == 50
    assert row["prompt_cache_mode"] == "explicit" and len(row["system_prompt_hash"]) == 64
    assert "claim_token" not in json.dumps(saved)
    assert "NMLS #123456" in saved["response"]["content"]
    assert saved["response"]["structured_data"]["persona_snapshot"]["name"] == "Business Owner"


def test_completed_replay_and_running_replay_skip_context_and_provider(world):
    db, config = world
    fields = send()
    first, create = run(world, fields)
    config[2].reset_mock(); config[3].reset_mock()
    db.personas.clear()
    replay, _ = run(world, fields, create)
    assert replay == first and create.call_count == 1
    config[2].assert_not_called(); config[3].assert_not_called()


def test_running_replay_and_key_mismatch_do_not_dispatch(world):
    fields = send()
    chats.claim_operation(W, S, M, fields)
    create = Mock(side_effect=AssertionError("must not dispatch"))
    replay, _ = run(world, fields, create)
    assert replay["state"] == "running"
    with pytest.raises(ChatConflictError):
        run(world, dict(fields, message="Changed"), create)
    create.assert_not_called()


def test_invalid_config_and_foreign_source_fail_before_claim(world):
    db, config = world
    config[0]["nmls_id"] = ""
    with pytest.raises(Exception) as failure:
        run(world)
    assert failure.value.error_code == "generation_configuration_required"
    assert not db.messages and not db.runs
    with pytest.raises(NotFoundError):
        run(world, {"action": "regenerate", "operation_key": str(uuid4()), "persona_id": P, "source_message_id": OTHER})


def test_campaign_records_two_calls_only_final_links_response(world):
    db, config = world
    create = Mock(side_effect=[result({"proceed": True}), result(fixture("campaign")["campaign"])])
    saved, _ = run(world, send(message="Create a campaign"), create)
    assert saved["state"] == "succeeded" and create.call_count == 2
    attempts = list(db.runs.values())
    assert [r["status"] for r in attempts] == ["succeeded", "succeeded"]
    assert attempts[0]["response_message_id"] is None and attempts[1]["response_message_id"] == saved["response"]["id"]
    assert attempts[0]["system_prompt_hash"] != attempts[1]["system_prompt_hash"]
    config[2].assert_called_once(); config[3].assert_called_once()


def test_clarification_and_regeneration_use_stored_answers(world):
    db, _ = world
    clarification, _ = run(world, send(message="Create a campaign"), Mock(return_value=result(fixture("clarification")["clarification"])))
    questions = clarification["response"]
    create = Mock(return_value=result(fixture("campaign")["campaign"]))
    answer = {"operation_key": str(uuid4()), "action": "clarify", "persona_id": P, "source_message_id": questions["id"],
              "answers": [{"question_index": 0, "selected": ["Instagram"], "custom": "Calm tone"}]}
    saved, _ = run(world, answer, create)
    message = create.call_args.kwargs["messages"][0]["content"]
    assert message.startswith("Original request: Create a campaign") and "Instagram, Calm tone" in message
    assert create.call_count == 1
    again = Mock(return_value=result(fixture("campaign")["campaign"]))
    regenerated, _ = run(world, {"operation_key": str(uuid4()), "action": "regenerate", "persona_id": P,
                               "source_message_id": saved["response"]["id"]}, again)
    assert again.call_args.kwargs["messages"][0]["content"] == message
    assert regenerated["response"]["source_message_id"] == saved["response"]["id"]


@pytest.mark.parametrize("action", ["video", "social_image"])
def test_media_loads_stored_source_and_preserves_artifact(world, action):
    db, _ = world
    parent, _ = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(fixture("campaign")["campaign"])]))
    original = deepcopy(db.messages[parent["response"]["id"]])
    payload = fixture(action)
    raw = payload["video"] if action == "video" else {"template": payload["template"], "slots": payload["slots"]}
    create = Mock(return_value=result(raw))
    saved, _ = run(world, {"operation_key": str(uuid4()), "action": action, "persona_id": P,
                          "source_message_id": parent["response"]["id"], "target": {"collection": "content_calendar", "index": 0}}, create)
    assert saved["state"] == "succeeded" and saved["response"]["structured_data"]["type"] == action
    assert db.messages[parent["response"]["id"]] == original
    assert "Synthetic withheld publication packet" in create.call_args.kwargs["messages"][0]["content"]
    stale = Mock(side_effect=AssertionError("A stale browser must not dispatch a second initial artifact"))
    with pytest.raises(ChatConflictError) as conflict:
        run(world, {"operation_key": str(uuid4()), "action": action, "persona_id": P,
                    "source_message_id": parent["response"]["id"], "target": {"collection": "content_calendar", "index": 0}}, stale)
    assert conflict.value.error_code == "stale_source"
    stale.assert_not_called()
    if action == "social_image":
        again = Mock(return_value=result(raw))
        run(world, {"operation_key": str(uuid4()), "action": action, "persona_id": P,
                    "source_message_id": saved["response"]["id"], "target": {"collection": "content_calendar", "index": 0}}, again)
        assert "PREVIOUS ATTEMPT" in again.call_args.kwargs["messages"][0]["content"]


def test_distinct_media_types_and_item_targets_do_not_conflict(world):
    campaign = deepcopy(fixture("campaign")["campaign"])
    campaign["content_calendar"].append(deepcopy(campaign["content_calendar"][0]))
    parent, _ = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(campaign)]))
    graphic = fixture("social_image")
    for kind, index in [("video", 0), ("social_image", 0), ("social_image", 1)]:
        raw = fixture("video")["video"] if kind == "video" else {"template": graphic["template"], "slots": graphic["slots"]}
        saved, create = run(world, {"operation_key": str(uuid4()), "action": kind, "persona_id": P,
                                   "source_message_id": parent["response"]["id"], "target": {"collection": "content_calendar", "index": index}}, Mock(return_value=result(raw)))
        assert saved["state"] == "succeeded" and create.call_count == 1


def test_campaign_carousel_image_receives_its_stored_slides(world):
    campaign = deepcopy(fixture("campaign")["campaign"])
    campaign["content_calendar"][0].update(format="carousel", caption="Caption only.", slides=["Unique first slide.", "Unique second slide."])
    parent, _ = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(campaign)]))
    raw = fixture("social_image")
    saved, provider = run(world, {"operation_key": str(uuid4()), "action": "social_image", "persona_id": P,
                                 "source_message_id": parent["response"]["id"], "target": {"collection": "content_calendar", "index": 0}},
                          Mock(return_value=result({"template": raw["template"], "slots": raw["slots"]})))
    assert saved["state"] == "succeeded"
    assert "Unique first slide." in provider.call_args.kwargs["messages"][0]["content"]
    assert "Unique second slide." in provider.call_args.kwargs["messages"][0]["content"]


def test_many_shortened_versions_keep_original_task_available(world):
    saved, _ = run(world, send(message="Original task for a long revision chain."))
    for _ in range(25):
        saved = chats.shorten_operation(W, S, M, dict(operation_key=str(uuid4()), action="shorten", source_message_id=saved["response"]["id"]))
    _, provider = run(world, dict(operation_key=str(uuid4()), action="regenerate", persona_id=P, source_message_id=saved["response"]["id"]))
    assert provider.call_args.kwargs["messages"][-1]["content"] == "Original task for a long revision chain."


def test_many_image_versions_remain_regeneratable_and_cycles_are_rejected(world):
    parent, _ = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(fixture("campaign")["campaign"])]))
    image = fixture("social_image")
    saved = parent
    for _ in range(23):
        saved, _ = run(world, dict(operation_key=str(uuid4()), action="social_image", persona_id=P, source_message_id=saved["response"]["id"],
                                  target={"collection": "content_calendar", "index": 0}), Mock(return_value=result({"template": image["template"], "slots": image["slots"]})))
        assert saved["state"] == "succeeded"
    db = world[0]
    db.messages[saved["response"]["id"]]["source_message_id"] = saved["response"]["id"]
    denied = Mock(side_effect=AssertionError("Corrupt provenance must not dispatch"))
    with pytest.raises(Exception) as failure:
        run(world, dict(operation_key=str(uuid4()), action="social_image", persona_id=P, source_message_id=saved["response"]["id"],
                        target={"collection": "content_calendar", "index": 0}), denied)
    assert failure.value.error_code in {"validation_error", "stale_source"}
    denied.assert_not_called()


def test_timeout_is_unknown_never_auto_retried_and_can_be_explicitly_replaced(world):
    db, _ = world
    fields = send()
    create = Mock(side_effect=anthropic.APITimeoutError(request=httpx.Request("POST", "https://synthetic.invalid")))
    failed, _ = run(world, fields, create)
    assert failed["state"] == "unknown" and create.call_count == 1
    assert next(iter(db.runs.values()))["status"] == "started"
    replay, _ = run(world, fields, create)
    assert replay == failed and create.call_count == 1
    replacement, next_create = run(world, send(retry_of=fields["operation_key"], acknowledge_uncertain_outcome=True))
    assert replacement["state"] == "succeeded" and next_create.call_count == 1


@pytest.mark.parametrize("value,stop", [("", "end_turn"), ("Partial response", "max_tokens"), ({"posts": []}, "end_turn")])
def test_invalid_or_truncated_output_never_saves_false_success(world, value, stop):
    # Empty posts envelope is stripped; no meaningful publication content remains.
    saved, create = run(world, provider=Mock(return_value=result(value, stop_reason=stop)))
    db, _ = world
    assert saved["state"] == "failed" and saved["safe_error_code"] == "invalid_provider_output"
    assert len(db.messages) == 1 and next(iter(db.runs.values()))["status"] == "failed"
    assert create.call_count == 1


def test_database_completion_retry_reuses_output_without_model_call(world, monkeypatch):
    original = runs.complete_generation
    calls = []
    def lost_ack(*args):
        saved = original(*args)
        calls.append(saved)
        if len(calls) == 1:
            raise DatabaseUnavailableError()
        return saved
    monkeypatch.setattr(runs, "complete_generation", lost_ack)
    saved, create = run(world)
    assert saved["state"] == "succeeded" and create.call_count == 1 and len(calls) == 2
    assert len(world[0].messages) == 2 and len(world[0].runs) == 1


def test_database_unavailable_after_provider_retains_uncertainty(world, monkeypatch):
    monkeypatch.setattr(runs, "complete_generation", Mock(side_effect=DatabaseUnavailableError()))
    saved, create = run(world)
    assert saved["state"] == "unknown" and saved["safe_error_code"] == "persistence_outcome_unknown"
    assert create.call_count == 1 and len(world[0].messages) == 1


@pytest.mark.parametrize("change", ["viewer", "removed", "abandoned"])
def test_authorization_and_fence_rechecked_between_campaign_calls(world, change):
    db, _ = world
    def create(**kwargs):
        if change == "viewer":
            db.members[M]["role"] = "viewer"
        elif change == "removed":
            db.members.clear()
        else:
            request = next(iter(db.messages.values()))
            request["structured_data"]["operation"]["state"] = "abandoned"
            request["structured_data"]["operation"]["claim_token"] = None
        return result({"proceed": True})
    provider = Mock(side_effect=create)
    with pytest.raises((PermissionDeniedError, WorkspaceAccessDeniedError, ChatConflictError)):
        run(world, send(message="Create a campaign"), provider)
    assert provider.call_count == 1 and len(db.runs) == 1 and len(db.messages) == 1


def test_safe_error_logging_excludes_provider_text(world, caplog):
    saved, _ = run(world, provider=Mock(side_effect=RuntimeError("PRIVATE_CONTENT_DO_NOT_LOG")))
    assert saved["state"] == "unknown" and "PRIVATE_CONTENT_DO_NOT_LOG" not in caplog.text
    assert all("PRIVATE_CONTENT_DO_NOT_LOG" not in r.get("error_text", "") for r in world[0].runs.values())


def test_sdk_constructor_has_no_retries_and_explicit_timeout(monkeypatch):
    import app
    constructor = Mock()
    monkeypatch.setattr(app.anthropic, "Anthropic", constructor)
    monkeypatch.setattr(app, "anthropic_client", None)
    app.get_anthropic_client()
    constructor.assert_called_once_with(max_retries=0, timeout=120.0)


@pytest.mark.parametrize("status,expected_state,code", [(401, "failed", "provider_unavailable"),
    (429, "failed", "provider_rate_limited"), (503, "unknown", "provider_outcome_unknown"),
    (400, "failed", "provider_unavailable")])
def test_provider_errors_are_sanitized_without_retries(world, status, expected_state, code, caplog):
    response = httpx.Response(status, request=httpx.Request("POST", "https://synthetic.invalid"))
    cls = anthropic.AuthenticationError if status == 401 else anthropic.RateLimitError if status == 429 else anthropic.APIStatusError
    error = cls("PRIVATE_PROVIDER_MESSAGE", response=response, body={"private": "PRIVATE_PROVIDER_BODY"})
    saved, create = run(world, provider=Mock(side_effect=error))
    assert saved["state"] == expected_state and saved["safe_error_code"] == code
    assert create.call_count == 1
    assert "PRIVATE_PROVIDER" not in str(saved) + caplog.text + str(list(world[0].runs.values()))
    assert next(iter(world[0].runs.values()))["status"] == ("started" if expected_state == "unknown" else "failed")


def test_run_insert_failure_prevents_dispatch(world, monkeypatch):
    monkeypatch.setattr(runs, "start_run", Mock(side_effect=DatabaseUnavailableError()))
    create = Mock(side_effect=AssertionError("must not dispatch"))
    saved, _ = run(world, provider=create)
    assert saved["state"] == "unknown" and not world[0].runs
    create.assert_not_called()


def test_final_run_link_failure_rolls_back_assistant_and_does_not_regenerate(world, monkeypatch):
    original = runs._save_run
    def broken_link(*args, **kwargs):
        if kwargs.get("response_id"):
            raise RuntimeError("synthetic final link failure")
        return original(*args, **kwargs)
    monkeypatch.setattr(runs, "_save_run", broken_link)
    saved, create = run(world)
    assert saved["state"] == "unknown" and len(world[0].messages) == 1
    assert next(iter(world[0].runs.values()))["response_message_id"] is None
    assert create.call_count == 1


def test_second_campaign_call_failure_keeps_successful_preflight_unlinked(world):
    error = anthropic.APITimeoutError(request=httpx.Request("POST", "https://synthetic.invalid"))
    saved, create = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), error]))
    attempts = list(world[0].runs.values())
    assert saved["state"] == "unknown" and create.call_count == 2
    assert attempts[0]["status"] == "succeeded" and attempts[0]["response_message_id"] is None
    assert attempts[1]["status"] == "started" and attempts[1]["response_message_id"] is None


def test_real_guarded_post_and_get_replay_use_same_durable_result(world, client):
    # Actual route/JWT handling; synthetic Auth, SQL and provider dependencies.
    fields = send()
    response = client.post('/api/chat/sessions/' + S + '/operations', json=fields, headers=client.headers())
    assert response.status_code == 200 and response.json["state"] == "succeeded"
    assert client.post('/api/chat/sessions/' + S + '/operations', json=fields, headers=client.headers()).json == response.json
    assert client.get(response.headers["Location"], headers=client.headers()).json == response.json
    assert client.ai.messages.create.call_count == 1


def test_provider_stage_cannot_be_claimed_twice_or_advanced_without_result(world):
    fields = send()
    claim = chats.claim_operation(W, S, M, fields)
    token = claim["request"]["structured_data"]["operation"]["claim_token"]
    args = (W, S, M, fields["operation_key"], token)
    system = [{"type": "text", "text": "Synthetic policy"}]
    run_id = runs.start_run(*args, model="synthetic", system=system, stage=0)
    with pytest.raises(ChatConflictError):
        runs.start_run(*args, model="synthetic", system=system, stage=0)
    with pytest.raises(ChatConflictError):
        runs.start_run(*args, model="synthetic", system=system, stage=1)
    assert len(world[0].runs) == 1 and world[0].runs[run_id]["status"] == "started"


@pytest.mark.parametrize("action", ["send", "regenerate", "clarify", "video", "social_image", "shorten"])
def test_collaborator_can_continue_and_revise_another_members_output(world, action):
    db, _ = world
    db.members[OTHER] = dict(db.members[M], id=OTHER)
    if action == "clarify":
        original, _ = run(world, provider=Mock(return_value=result(fixture("clarification")["clarification"])))
    elif action in {"video", "social_image"}:
        original, _ = run(world, send(message="Create a campaign"), Mock(side_effect=[result({"proceed": True}), result(fixture("campaign")["campaign"])]))
    else:
        original, _ = run(world)
    before = deepcopy(db.messages[original["response"]["id"]])
    fields = send(action=action)
    if action != "send":
        fields.pop("message")
        fields["source_message_id"] = original["response"]["id"]
    if action == "shorten":
        fields.pop("persona_id")
    if action == "clarify":
        fields["answers"] = [{"question_index": 0, "selected": ["Instagram"], "custom": ""}]
    if action in {"video", "social_image"}:
        fields["target"] = {"collection": "content_calendar", "index": 0}
        payload = fixture(action)
        raw = payload["video"] if action == "video" else {"template": payload["template"], "slots": payload["slots"]}
    else:
        raw = "A collaborator followup."
    saved, provider = run(world, fields, Mock(return_value=result(raw)), member_id=OTHER)
    assert saved["state"] == "succeeded"
    assert db.messages[saved["request_message_id"]]["author_member_id"] == OTHER
    assert db.sessions[S]["created_by_member_id"] == M
    assert db.messages[original["response"]["id"]] == before
    assert chats.get_operation(W, S, M, fields["operation_key"])["response"] == saved["response"]
    replay, _ = run(world, fields, provider, member_id=M)
    assert replay == saved
    assert provider.call_count == (0 if action == "shorten" else 1)


def test_shared_chat_claim_cannot_change_worker_identity(world):
    db, _ = world
    db.members[OTHER] = dict(db.members[M], id=OTHER)
    fields = send()
    claim = chats.claim_operation(W, S, M, fields)
    token = claim["request"]["structured_data"]["operation"]["claim_token"]
    with pytest.raises(ChatConflictError, match="original worker"):
        chats.complete_operation(W, S, OTHER, fields["operation_key"], token, {"type": "text", "response": "Invalid"})
    with pytest.raises(ChatConflictError, match="original worker"):
        chats.progress_operation(W, S, OTHER, fields["operation_key"], token)
    assert chats.get_operation(W, S, OTHER, fields["operation_key"])["state"] == "running"
    chats.progress_operation(W, S, M, fields["operation_key"], token, state="unknown")
    chats.abandon_operation(W, S, OTHER, fields["operation_key"], acknowledged=True)
    with pytest.raises(ChatConflictError):
        chats.complete_operation(W, S, M, fields["operation_key"], token, {"type": "text", "response": "Fenced"})
