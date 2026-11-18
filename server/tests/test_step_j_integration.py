"""Opt-in real PostgreSQL acceptance; synthetic rows and no provider invocations.

Requires explicit approval for the target AND fixture writes/cleanup. The shared
synthetic_workspace fixture deletes only its newly created test workspace on exit.
Run this file alone, not the historical integration suite, for J.2 acceptance.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Barrier, local
from uuid import uuid4

import pytest

from db.connection import get_db_cursor, get_db_connection
from errors import ChatConflictError, PreconditionFailedError, NotFoundError
from repositories import chat_persistence_repository as repo

pytestmark = pytest.mark.integration


@pytest.fixture
def durable_session(dev_workspace_id, member_id):
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.persona (workspace_id,slug,name) VALUES (%s,%s,%s) RETURNING id",
                    (dev_workspace_id, "step-j-" + uuid4().hex, "Synthetic Step J persona"))
        persona = str(cur.fetchone()["id"])
    sid = str(uuid4())
    session, created = repo.create_session(dev_workspace_id, sid, member_id, title="Synthetic Step J", persona_id=persona)
    assert created
    return dev_workspace_id, sid, member_id, persona, session


def operation(persona, **changes):
    return {"operation_key": str(uuid4()), "action": "send", "message": "Synthetic education request", "persona_id": persona, **changes}


def complete(session, claim):
    wid, sid, mid, _, _ = session
    return repo.complete_operation(wid, sid, mid, claim["status"]["operation_key"],
                                   claim["request"]["structured_data"]["operation"]["claim_token"],
                                   {"type": "text", "response": "Synthetic education.\nSecond line.\nThird line.\n\nSynthetic | NMLS #1 | DRE #2 | Equal Housing Opportunity\nSupplement.",
                                    "compliance_flags": ["possible_respa_review"]})


def parallel_connections(monkeypatch, work):
    """Hold both physical connections before claiming; prove distinct server PIDs."""
    barrier, per_thread = Barrier(2), local()
    original_transaction = repo.get_db_transaction

    @contextmanager
    def transaction():
        conn = getattr(per_thread, "connection", None)
        if conn is None:
            with original_transaction() as cur:
                yield cur
        else:
            with conn.transaction():
                with conn.cursor() as cur:
                    yield cur

    monkeypatch.setattr(repo, "get_db_transaction", transaction)

    def worker():
        with get_db_connection() as conn:
            # Pin each backend through the barrier, including transaction poolers.
            # Repository transactions are savepoints here; outer commit finishes
            # before worker returns its result. No provider is involved.
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SET LOCAL lock_timeout='10s'")
                    cur.execute("SET LOCAL statement_timeout='30s'")
                    cur.execute("SELECT pg_backend_pid() AS pid")
                    pid = cur.fetchone()["pid"]
                per_thread.connection = conn
                barrier.wait(timeout=15)
                try:
                    result = work()
                finally:
                    per_thread.connection = None
            return pid, result

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(worker) for _ in range(2)]
        results = [future.result(timeout=45) for future in futures]
    assert results[0][0] != results[1][0]
    return [result for _, result in results]


def test_real_duplicate_claims_are_serialized(durable_session, monkeypatch):
    wid, sid, mid, persona, _ = durable_session
    data = operation(persona)
    claims = parallel_connections(monkeypatch, lambda: repo.claim_operation(wid, sid, mid, data))
    assert sorted(c["created"] for c in claims) == [False, True]
    assert claims[0]["request"]["id"] == claims[1]["request"]["id"]
    winner = next(c for c in claims if c["created"])
    result = complete(durable_session, winner)
    assert complete(durable_session, winner) == result
    assert len(repo.get_session(wid, sid, mid)["messages"]) == 2


def test_real_distinct_claims_one_is_busy(durable_session, monkeypatch):
    wid, sid, mid, persona, _ = durable_session
    def submit():
        try:
            return repo.claim_operation(wid, sid, mid, operation(persona))["created"]
        except ChatConflictError as error:
            return error.error_code
    results = parallel_connections(monkeypatch, submit)
    assert results.count(True) == 1 and results.count("operation_in_progress") == 1


def test_real_completion_rollback_and_shortening(durable_session, monkeypatch):
    wid, sid, mid, persona, _ = durable_session
    claim = repo.claim_operation(wid, sid, mid, operation(persona))
    original_save = repo._save_operation
    def fail_after_response_insert(*args):
        raise RuntimeError("Synthetic completion rollback")
    monkeypatch.setattr(repo, "_save_operation", fail_after_response_insert)
    with pytest.raises(RuntimeError):
        complete(durable_session, claim)
    assert len(repo.get_session(wid, sid, mid)["messages"]) == 1
    monkeypatch.setattr(repo, "_save_operation", original_save)
    saved = complete(durable_session, claim)["response"]
    shortened = repo.shorten_operation(wid, sid, mid, {"operation_key": str(uuid4()), "action": "shorten", "source_message_id": saved["id"]})
    assert shortened["response"]["content"].endswith("Opportunity\nSupplement.")
    assert shortened["response"]["compliance_flags"] == saved["compliance_flags"]
    assert len(repo.get_session(wid, sid, mid)["messages"]) == 4


def test_real_explicit_uncertain_replacement_fences_old_worker(durable_session):
    wid, sid, mid, persona, _ = durable_session
    first = repo.claim_operation(wid, sid, mid, operation(persona))
    key = first["status"]["operation_key"]
    token = first["request"]["structured_data"]["operation"]["claim_token"]
    repo.progress_operation(wid, sid, mid, key, token, state="unknown", safe_error_code="provider_outcome_unknown")
    replacement = repo.claim_operation(wid, sid, mid, operation(persona, retry_of=key, acknowledge_uncertain_outcome=True))
    assert replacement["created"]
    with pytest.raises(ChatConflictError):
        complete(durable_session, first)
    assert repo.get_operation(wid, sid, mid, key)["state"] == "abandoned"


def test_real_metadata_conflict_archive_restore_and_sharing(durable_session):
    wid, sid, mid, _, session = durable_session
    renamed = repo.patch_session(wid, sid, mid, {"title": "Renamed synthetic"}, session["etag"])
    with pytest.raises(PreconditionFailedError):
        repo.patch_session(wid, sid, mid, {"title": "Stale"}, session["etag"])
    archived = repo.patch_session(wid, sid, mid, {"archived": True}, renamed["etag"])
    assert not repo.list_sessions(wid, mid)["sessions"]
    assert repo.list_sessions(wid, mid, archived=True)["sessions"][0]["id"] == sid
    repo.patch_session(wid, sid, mid, {"archived": False}, archived["etag"])
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace_member (workspace_id,auth_user_id,role) VALUES (%s,%s,'admin') RETURNING id",
                    (wid, "synthetic-step-j-" + uuid4().hex))
        admin = str(cur.fetchone()["id"])
    assert repo.get_session(wid, sid, admin)["created_by_member_id"] == mid
    assert repo.list_sessions(wid, admin)["sessions"][0]["id"] == sid
    current = repo.get_session(wid, sid, admin)
    archived = repo.patch_session(wid, sid, admin, {"archived": True}, current["etag"])
    assert not repo.list_sessions(wid, mid)["sessions"]
    repo.patch_session(wid, sid, mid, {"archived": False}, archived["etag"])


def test_real_different_members_compete_for_same_session_lock(durable_session, monkeypatch):
    from threading import Lock
    wid, sid, mid, persona, _ = durable_session
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace_member (workspace_id,auth_user_id,role) VALUES (%s,%s,'member') RETURNING id",
                    (wid, "synthetic-collaborator-" + uuid4().hex))
        collaborator = str(cur.fetchone()["id"])
    members, assignment = iter([mid, collaborator]), Lock()
    def submit():
        with assignment:
            actor = next(members)
        try:
            claim = repo.claim_operation(wid, sid, actor, operation(persona))
            return actor, claim["created"]
        except ChatConflictError as error:
            return actor, error.error_code
    outcomes = parallel_connections(monkeypatch, submit)
    assert {actor for actor, _ in outcomes} == {mid, collaborator}
    assert sorted(str(outcome) for _, outcome in outcomes) == ["True", "operation_in_progress"]
    messages = repo.get_session(wid, sid, collaborator)["messages"]
    assert len(messages) == 1
    assert messages[0]["author_member_id"] == next(actor for actor, outcome in outcomes if outcome is True)
