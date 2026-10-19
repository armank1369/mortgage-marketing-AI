"""Stateful synthetic repository tests. No real SQL execution/locking is claimed.

The adapter models stored rows/rollback so lifecycle and race-fencing invariants
can be exercised. Opt-in PostgreSQL tests separately establish actual SQL behavior.
"""
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import uuid4

import pytest

from errors import (ChatConflictError, NotFoundError, PermissionDeniedError, WorkspaceAccessDeniedError,
                    PreconditionFailedError, PreconditionRequiredError, ValidationError)
from repositories import chat_persistence_repository as repo
from services.chat_contract import metadata_etag, decode_cursor

W = "11111111-1111-4111-8111-111111111111"
M = "22222222-2222-4222-8222-222222222222"
S = "33333333-3333-4333-8333-333333333333"
P = "44444444-4444-4444-8444-444444444444"
OTHER = "55555555-5555-4555-8555-555555555555"


class MemorySQL:
    def __init__(self):
        self.members = {M: {"id": M, "role": "member", "environment": "test", "workspace_id": W}}
        self.personas = {P: {"id": P, "name": "Synthetic", "slug": "synthetic", "workspace_id": W}}
        self.sessions, self.messages, self.calls = {}, {}, []
        self.rows, self.fail_response, self.fail_commit = [], False, False

    def fetchone(self):
        return deepcopy(self.rows.pop(0)) if self.rows else None

    def fetchall(self):
        rows, self.rows = deepcopy(self.rows), []
        return rows

    def execute(self, sql, params=()):
        q = " ".join(sql.lower().split())
        self.calls.append((q, params))
        self.rows = []
        now = datetime.now(timezone.utc)
        if q.startswith("select") and "from public.workspace_member" in q:
            row = self.members.get(params[0])
            self.rows = [row] if row and row["workspace_id"] == params[1] and not row.get("revoked_at") else []
        elif q.startswith("select") and "from public.persona" in q:
            row = self.personas.get(params[0])
            self.rows = [row] if row and row["workspace_id"] == params[1] and not row.get("deleted_at") else []
        elif q.startswith("select") and "from public.chat_session" in q:
            if "where id=%s" in q:
                row = self.sessions.get(params[0])
                if row and len(params) > 1 and (row["workspace_id"], row["created_by_member_id"]) != tuple(params[1:3]):
                    row = None
                if row and "archived_at is null" in q and row["archived_at"]:
                    row = None
                self.rows = [row] if row else []
            else:
                rows = [r for r in self.sessions.values() if (r["workspace_id"], r["created_by_member_id"]) == tuple(params[:2])]
                rows = [r for r in rows if bool(r["archived_at"]) == ("archived_at is not null" in q)]
                if "(updated_at,id)<" in q:
                    rows = [r for r in rows if (r["updated_at"], r["id"]) < tuple(params[2:4])]
                self.rows = sorted(rows, key=lambda r: (r["updated_at"], r["id"]), reverse=True)[:params[-1]]
        elif q.startswith("insert into public.chat_session"):
            sid, wid, mid, title, persona = params
            if sid not in self.sessions:
                row = dict(id=sid, workspace_id=wid, created_by_member_id=mid, title=title, default_persona_id=persona,
                           summary_status="pending", archived_at=None, started_at=now, updated_at=now)
                self.sessions[sid] = row
                self.rows = [row]
        elif q.startswith("update public.chat_session"):
            row = self.sessions[params[-1]]
            pos = 0
            for field in ("title", "default_persona_id"):
                if field + "=%s" in q:
                    row[field] = params[pos]
                    pos += 1
            if "archived_at=coalesce" in q:
                row["archived_at"] = row["archived_at"] or now
            elif "archived_at=null" in q:
                row["archived_at"] = None
            row["updated_at"] = now
            self.rows = [row] if "returning" in q else []
        elif q.startswith("select") and "from public.chat_message" in q:
            rows = [r for r in self.messages.values() if r["session_id"] == params[0]]
            if "client_message_key=%s" in q:
                rows = [r for r in rows if r["client_message_key"] == params[1]]
            elif "source_message_id=%s" in q:
                rows = [r for r in rows if r["source_message_id"] == params[1]]
            elif "and id=%s" in q:
                rows = [r for r in rows if r["id"] == params[1]]
            if "role='assistant'" in q:
                rows = [r for r in rows if r["role"] == "assistant"]
            if "role='user'" in q:
                rows = [r for r in rows if r["role"] == "user"]
            if "structured_data->>'type'=%s" in q:
                rows = [r for r in rows if r["structured_data"].get("type") == params[2]
                        and r["structured_data"].get("target") == params[3].obj]
            if "structured_data->'operation'->>'state' in ('running','unknown')" in q:
                rows = [r for r in rows if r["structured_data"].get("operation", {}).get("state") in {"running", "unknown"}]
            for kind in ("revision", "operation"):
                if "kind='" + kind + "'" in q:
                    rows = [r for r in rows if r["kind"] == kind]
            if "->>'action'='clarify'" in q:
                rows = [r for r in rows if r["structured_data"]["input"]["action"] == "clarify"
                        and r["structured_data"]["operation"]["state"] in {"running", "unknown", "succeeded"}]
            if "(created_at,id)<" in q:
                rows = [r for r in rows if (r["created_at"], r["id"]) < tuple(params[1:3])]
            rows.sort(key=lambda r: (r["created_at"], r["id"]), reverse="desc" in q)
            if "limit %s" in q:
                rows = rows[:params[-1]]
            self.rows = rows
        elif q.startswith("insert into public.chat_message"):
            mid = str(uuid4())
            if "'user','operation'" in q:
                sid, author, persona, action, content, envelope, key, source = params
                row = dict(id=mid, session_id=sid, author_member_id=author, persona_id=persona, role="user", kind="operation",
                           mode=action, content=content, content_format="plain_text", structured_data=deepcopy(envelope.obj),
                           compliance_flags=[], client_message_key=key, source_message_id=source, request_message_id=None, created_at=now)
            else:
                if self.fail_response:
                    raise RuntimeError("synthetic insert failure")
                sid, persona, kind, mode, content, fmt, envelope, flags, key, request, source = params
                row = dict(id=mid, session_id=sid, author_member_id=None, persona_id=persona, role="assistant", kind=kind,
                           mode=mode, content=content, content_format=fmt, structured_data=deepcopy(envelope.obj),
                           compliance_flags=deepcopy(flags.obj), client_message_key=key, request_message_id=request,
                           source_message_id=source, created_at=now)
            assert not any(r["session_id"] == row["session_id"] and r["client_message_key"] == row["client_message_key"]
                           for r in self.messages.values())
            self.messages[mid] = row
            self.rows = [row]
        elif q.startswith("update public.chat_message set structured_data"):
            envelope, mid, sid = params
            assert self.messages[mid]["session_id"] == sid
            self.messages[mid]["structured_data"] = deepcopy(envelope.obj)
        elif q.startswith("update public.chat_message set persona_id"):
            persona, mid, sid = params
            assert self.messages[mid]["session_id"] == sid
            self.messages[mid]["persona_id"] = persona
        else:
            raise AssertionError("Unexpected SQL shape: " + q)

    @contextmanager
    def transaction(self):
        saved = deepcopy((self.members, self.personas, self.sessions, self.messages))
        try:
            yield self
            if self.fail_commit:
                raise RuntimeError("synthetic commit failure")
        except Exception:
            self.members, self.personas, self.sessions, self.messages = saved
            raise


@pytest.fixture
def store(monkeypatch):
    db = MemorySQL()
    monkeypatch.setattr(repo, "get_db_transaction", db.transaction)
    repo.create_session(W, S, M, title="Synthetic", persona_id=P)
    return db


def send(**changes):
    return {"operation_key": str(uuid4()), "action": "send", "persona_id": P, "message": "Explain documents.", **changes}


def finish(claim, response=None):
    row = claim["request"]
    return repo.complete_operation(W, S, M, row["structured_data"]["input"]["operation_key"],
                                   row["structured_data"]["operation"]["claim_token"],
                                   response or {"type": "text", "response": "First.\nSecond.\nThird.\n\nSynthetic | NMLS #1 | DRE #2 | Equal Housing Opportunity\n\nExtra disclosure.",
                                                "compliance_flags": ["possible_respa_review"]})


def test_create_replay_does_not_overwrite_or_require_deleted_persona(store):
    store.personas.clear()
    row, created = repo.create_session(W, S, M, title="Changed", persona_id=OTHER)
    assert not created and row["title"] == "Synthetic"
    assert len(store.sessions) == 1


@pytest.mark.parametrize("role", ["admin", "owner", "member"])
def test_foreign_creator_denied_for_all_reads_and_writes(store, role):
    store.members[OTHER] = dict(store.members[M], id=OTHER, role=role)
    for operation in [lambda: repo.get_session(W, S, OTHER), lambda: repo.patch_session(W, S, OTHER, {"title": "Leak"}, metadata_etag(store.sessions[S])),
                      lambda: repo.claim_operation(W, S, OTHER, send()), lambda: repo.create_session(W, S, OTHER, title="Leak", persona_id=P)]:
        with pytest.raises(NotFoundError):
            operation()
    assert repo.list_sessions(W, OTHER)["sessions"] == []
    assert not store.messages


def test_member_role_is_refreshed_and_null_creator_is_not_adopted(store):
    store.members[M]["role"] = "viewer"
    assert repo.get_session(W, S, M)["messages"] == []
    with pytest.raises(PermissionDeniedError):
        repo.claim_operation(W, S, M, send())
    store.members[M]["role"] = "member"
    store.sessions[S]["created_by_member_id"] = None
    with pytest.raises(NotFoundError):
        repo.get_session(W, S, M)
    assert repo.list_sessions(W, M)["sessions"] == []


def test_claim_replay_body_conflict_and_busy_session(store):
    data = send()
    first = repo.claim_operation(W, S, M, data)
    replay = repo.claim_operation(W, S, M, data)
    assert first["created"] and not replay["created"]
    assert first["request"]["id"] == replay["request"]["id"]
    with pytest.raises(ChatConflictError, match="different input"):
        repo.claim_operation(W, S, M, dict(data, message="Changed"))
    with pytest.raises(ChatConflictError, match="active operation"):
        repo.claim_operation(W, S, M, send())
    assert len(store.messages) == 1
    assert "for share of wm" in store.calls[0][0]


def test_completion_replay_hidden_token_and_parent_recency(store):
    claim = repo.claim_operation(W, S, M, send())
    before = store.sessions[S]["updated_at"]
    first = finish(claim)
    replay = finish(claim)
    assert first == replay and len(store.messages) == 2
    assert store.sessions[S]["updated_at"] > before
    assert "claim_token" not in json.dumps(repo.get_session(W, S, M))
    assert "claim_token" not in json.dumps(repo.get_operation(W, S, M, first["operation_key"]))
    assert first["response"]["author_member_id"] is None


def test_completed_claim_replays_without_active_persona(store):
    data = send()
    finish(repo.claim_operation(W, S, M, data))
    store.personas.clear()
    replay = repo.claim_operation(W, S, M, data)
    assert not replay["created"] and replay["status"]["state"] == "succeeded"


def test_unresolved_query_does_not_load_completed_context_envelopes(store):
    finish(repo.claim_operation(W, S, M, send()))
    active = repo.claim_operation(W, S, M, send())
    unresolved = repo._unresolved_requests(store, S)
    assert [str(row["id"]) for row in unresolved] == [active["request"]["id"]]
    assert "structured_data->'operation'->>'state' in ('running','unknown')" in store.calls[-1][0]


def test_response_insert_and_commit_failure_never_report_saved(store):
    claim = repo.claim_operation(W, S, M, send())
    store.fail_response = True
    with pytest.raises(RuntimeError):
        finish(claim)
    assert len(store.messages) == 1
    assert next(iter(store.messages.values()))["structured_data"]["operation"]["state"] == "running"
    store.fail_response, store.fail_commit = False, True
    with pytest.raises(RuntimeError):
        finish(claim)
    assert len(store.messages) == 1


@pytest.mark.parametrize("change", ["viewer", "removed", "revoked"])
def test_completion_rechecks_membership(store, change):
    claim = repo.claim_operation(W, S, M, send())
    if change == "removed":
        store.members.clear()
    elif change == "viewer":
        store.members[M]["role"] = "viewer"
    else:
        store.members[M]["revoked_at"] = datetime.now(timezone.utc)
    with pytest.raises((PermissionDeniedError, WorkspaceAccessDeniedError)):
        finish(claim)
    assert len(store.messages) == 1


def test_unknown_requires_acknowledgement_and_fences_late_completion(store):
    data = send()
    claim = repo.claim_operation(W, S, M, data)
    row = store.messages[claim["request"]["id"]]
    row["structured_data"]["operation"]["last_progress_at"] = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()
    assert repo.get_operation(W, S, M, data["operation_key"])["state"] == "unknown"
    assert row["structured_data"]["operation"]["state"] == "running"  # GET never mutates/takes over.
    retry = send(retry_of=data["operation_key"])
    with pytest.raises(ChatConflictError):
        repo.claim_operation(W, S, M, retry)
    replacement = repo.claim_operation(W, S, M, dict(retry, acknowledge_uncertain_outcome=True))
    assert replacement["created"]
    with pytest.raises(ChatConflictError, match="no longer owns"):
        finish(claim)
    assert len(store.messages) == 2


def test_archive_preconditions_busy_guard_restore_and_unchanged_messages(store):
    tag = metadata_etag(store.sessions[S])
    with pytest.raises(PreconditionRequiredError):
        repo.patch_session(W, S, M, {"title": "Rename"}, None)
    with pytest.raises(PreconditionFailedError):
        repo.patch_session(W, S, M, {"title": "Rename"}, '"stale"')
    claim = repo.claim_operation(W, S, M, send())
    with pytest.raises(ChatConflictError):
        repo.patch_session(W, S, M, {"archived": True}, tag)
    finish(claim)
    archived = repo.patch_session(W, S, M, {"archived": True}, tag)
    assert repo.list_sessions(W, M)["sessions"] == []
    assert len(repo.list_sessions(W, M, archived=True)["sessions"]) == 1
    assert len(repo.get_session(W, S, M)["messages"]) == 2
    with pytest.raises(NotFoundError):
        repo.claim_operation(W, S, M, send())
    restored = repo.patch_session(W, S, M, {"archived": False}, archived["etag"])
    assert restored["archived_at"] is None


def test_shorten_preserves_original_footer_flags_and_history(store):
    response = finish(repo.claim_operation(W, S, M, send()))["response"]
    original = deepcopy(store.messages[response["id"]])
    data = {"operation_key": str(uuid4()), "action": "shorten", "source_message_id": response["id"]}
    shortened = repo.shorten_operation(W, S, M, data)
    assert shortened == repo.shorten_operation(W, S, M, data)
    saved = shortened["response"]
    assert saved["content"].startswith("First.\nSecond.\n\nSynthetic")
    assert saved["content"].endswith("Opportunity\n\nExtra disclosure.")
    assert saved["compliance_flags"] == original["compliance_flags"]
    assert store.messages[response["id"]] == original
    assert len(store.messages) == 4
    with pytest.raises(ChatConflictError, match="current response"):
        repo.shorten_operation(W, S, M, dict(data, operation_key=str(uuid4())))


def test_foreign_source_and_cross_session_request_link_denied(store):
    claim = repo.claim_operation(W, S, M, send())
    response = finish(claim)["response"]
    store.messages[response["id"]]["request_message_id"] = OTHER
    with pytest.raises(NotFoundError):
        repo.shorten_operation(W, S, M, {"operation_key": str(uuid4()), "action": "shorten", "source_message_id": response["id"]})
    assert len(store.messages) == 2


def test_pagination_boundaries_and_deterministic_ties(store):
    for _ in range(3):
        finish(repo.claim_operation(W, S, M, send()))
    latest = repo.get_session(W, S, M, limit=2)
    older = repo.get_session(W, S, M, limit=2, before=decode_cursor(latest["before_cursor"]))
    assert len(latest["messages"]) == len(older["messages"]) == 2
    assert not {m["id"] for m in latest["messages"]} & {m["id"] for m in older["messages"]}
    repo.create_session(W, OTHER, M, title="Other", persona_id=P)
    store.sessions[OTHER]["updated_at"] = store.sessions[S]["updated_at"]
    page = repo.list_sessions(W, M, limit=1)
    tail = repo.list_sessions(W, M, limit=1, cursor=decode_cursor(page["next_cursor"]))
    assert page["sessions"][0]["id"] != tail["sessions"][0]["id"]


@pytest.mark.parametrize("kind", ["text", "posts", "clarification", "campaign", "video", "social_image"])
def test_rich_fixture_roundtrip(store, kind):
    fixtures = json.loads((Path(__file__).resolve().parents[2] / "docs/fixtures/step_j_v1.json").read_text())
    fixture = next(c for c in fixtures["cases"] if c["type"] == kind)
    fields = send()
    if kind in {"video", "social_image"}:
        parent_fixture = next(c for c in fixtures["cases"] if c["type"] == "campaign")
        parent = finish(repo.claim_operation(W, S, M, send()), {"type": "campaign", **parent_fixture["payload"]})["response"]
        fields = {"operation_key": str(uuid4()), "action": kind, "persona_id": P, "source_message_id": parent["id"],
                  "target": {"collection": "content_calendar", "index": 0}}
    result = finish(repo.claim_operation(W, S, M, fields), {"type": kind, **fixture["payload"], "compliance_flags": fixture["compliance_flags"]})
    message = result["response"]
    assert message["structured_data"]["payload"] == fixture["payload"]
    assert message["compliance_flags"] == fixture["compliance_flags"]
    assert message in repo.get_session(W, S, M)["messages"]
    assert message["request_message_id"] == result["request_message_id"]


def test_claim_commit_failure_rolls_back_and_never_grants_dispatch(store):
    store.fail_commit = True
    with pytest.raises(RuntimeError):
        repo.claim_operation(W, S, M, send())
    assert not store.messages


def test_failed_operation_frees_session_and_safe_error_is_stored(store):
    first = repo.claim_operation(W, S, M, send())
    row = first["request"]
    result = repo.progress_operation(W, S, M, first["status"]["operation_key"],
                                     row["structured_data"]["operation"]["claim_token"],
                                     state="failed", safe_error_code="provider_unavailable")
    assert result["state"] == "failed" and result["response"] is None
    assert repo.claim_operation(W, S, M, send())["created"]
    assert all(r["role"] == "user" for r in store.messages.values())


def test_abandon_running_denied_unknown_allowed_and_idempotent(store):
    claim = repo.claim_operation(W, S, M, send())
    key = claim["status"]["operation_key"]
    with pytest.raises(ChatConflictError):
        repo.abandon_operation(W, S, M, key, acknowledged=True)
    row = store.messages[claim["request"]["id"]]
    row["structured_data"]["operation"]["last_progress_at"] = "invalid"
    with pytest.raises(ChatConflictError):
        repo.abandon_operation(W, S, M, key, acknowledged=False)
    assert repo.abandon_operation(W, S, M, key, acknowledged=True)["state"] == "abandoned"
    assert repo.abandon_operation(W, S, M, key, acknowledged=True)["state"] == "abandoned"
    with pytest.raises(ChatConflictError):
        finish(claim)


def test_deleted_or_foreign_persona_rejected_before_claim_insert(store):
    store.personas[P]["deleted_at"] = datetime.now(timezone.utc)
    with pytest.raises(NotFoundError):
        repo.claim_operation(W, S, M, send())
    assert not store.messages
    store.personas[P].pop("deleted_at")
    store.personas[P]["workspace_id"] = OTHER
    with pytest.raises(NotFoundError):
        repo.patch_session(W, S, M, {"default_persona_id": P}, metadata_etag(store.sessions[S]))


@pytest.mark.parametrize("response", [
    {"type": "text", "response": ""}, {"type": []},
    {"type": "posts", "posts": {"posts": []}},
    {"type": "campaign", "campaign": {}},
    {"type": "text", "response": "Text", "compliance_flags": "untrusted"},
    {"type": "text", "response": "Text", "nested": float("nan")},
    {"type": "text", "response": "Text\x00"},
    {"type": "video", "video": {}},
])
def test_malformed_completion_never_changes_request_or_inserts_output(store, response):
    claim = repo.claim_operation(W, S, M, send())
    with pytest.raises(ValidationError):
        finish(claim, response)
    assert len(store.messages) == 1
    assert repo.get_operation(W, S, M, claim["status"]["operation_key"])["state"] == "running"


def test_wrong_claim_token_is_fenced(store):
    claim = repo.claim_operation(W, S, M, send())
    with pytest.raises(ChatConflictError):
        repo.complete_operation(W, S, M, claim["status"]["operation_key"], "wrong", {"type": "text", "response": "No"})
    assert len(store.messages) == 1


def test_clarification_answers_are_durable_and_invalid_options_roll_back(store):
    clarification = finish(repo.claim_operation(W, S, M, send()), {
        "type": "clarification", "clarification": {"questions": [
            {"question": "Platform?", "type": "single", "options": ["Instagram", "LinkedIn"]}]}})["response"]
    fields = {"operation_key": str(uuid4()), "action": "clarify", "persona_id": P,
              "source_message_id": clarification["id"],
              "answers": [{"question_index": 0, "selected": ["Foreign option"], "custom": ""}]}
    with pytest.raises(ValidationError):
        repo.claim_operation(W, S, M, fields)
    assert len(store.messages) == 2
    fields["answers"][0]["selected"] = ["Instagram"]
    claim = repo.claim_operation(W, S, M, fields)
    saved = repo.get_session(W, S, M)["messages"][-1]
    assert saved["source_message_id"] == clarification["id"]
    assert saved["structured_data"]["input"]["answers"] == fields["answers"]
    finish(claim)
    with pytest.raises(ChatConflictError):
        repo.claim_operation(W, S, M, dict(fields, operation_key=str(uuid4())))


def test_cross_session_source_does_not_leak_or_write(store):
    response = finish(repo.claim_operation(W, S, M, send()))["response"]
    repo.create_session(W, OTHER, M, title="Other", persona_id=P)
    with pytest.raises(NotFoundError):
        repo.claim_operation(W, OTHER, M, {"operation_key": str(uuid4()), "action": "regenerate", "persona_id": P,
                                         "source_message_id": response["id"]})
    assert len(store.messages) == 2


def test_mutation_locks_membership_before_owned_session(store):
    store.calls.clear()
    repo.claim_operation(W, S, M, send())
    assert "from public.workspace_member" in store.calls[0][0] and "for share of wm" in store.calls[0][0]
    assert "from public.chat_session" in store.calls[1][0] and "for update" in store.calls[1][0]
    assert "created_by_member_id=%s" in store.calls[1][0]
    assert store.calls[1][1] == (S, W, M)
