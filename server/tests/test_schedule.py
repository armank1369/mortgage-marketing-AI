from datetime import date
from unittest.mock import Mock
import pytest

from errors import ConflictError, ValidationError
from repositories import schedule
from services import schedule_context
from tests.test_step_g_routes import client, W, M


def test_revalidate_after_authorization(client, monkeypatch):
    read = Mock(return_value=("47", None))
    monkeypatch.setattr(schedule, "snapshot", read)
    headers = {**client.headers(), "If-None-Match": '"47"'}
    response = client.get("/api/calendar", headers=headers)
    assert response.status_code == 304 and not response.data
    assert response.headers["ETag"] == '"47"'
    read.assert_called_once_with(W, "47")
    client.memberships.clear()
    assert client.get("/api/calendar", headers=headers).status_code == 403
    assert read.call_count == 1


def test_write_requires_role_and_revision(client, monkeypatch):
    write = Mock(side_effect=ConflictError())
    monkeypatch.setattr(schedule, "mutate", write)
    headers = client.headers()
    payload = {"action": "remove", "ids": []}
    assert client.post("/api/calendar", headers=headers, json=payload).status_code == 400
    headers["If-Match"] = '"12"'
    assert client.post("/api/calendar", headers=headers, json=payload).status_code == 409
    write.assert_called_once_with(W, M, "12", payload)
    client.context["role"] = "viewer"
    assert client.post("/api/calendar", headers=headers, json=payload).status_code == 403
    assert write.call_count == 1


def test_schedule_lookup_in_chat(client, monkeypatch):
    read = Mock(return_value='{"entries":[{"title":"Synthetic Tuesday post"}]}')
    monkeypatch.setattr(schedule_context, "lookup", read)
    response = client.post("/api/chat", headers=client.headers(), json={
        "message":"What is on my calendar this week?", "persona_id":M})
    assert response.status_code == 200 and read.call_count == 1
    call = client.ai.messages.create.call_args.kwargs
    assert "Synthetic Tuesday post" in str(call["system"])
    assert "output_config" not in call
    assert schedule_context._window("this week", date(2026,11,3)) == (date(2026,11,2),date(2026,11,9))
    assert not schedule_context.wants_schedule("Write a first time homebuyer post")


def test_identity_and_scheduling_dates():
    assert schedule._key(W,"entry/a/0") == schedule._key(W,"entry/a/0")
    assert schedule._key(W,"entry/a/0") != schedule._key(M,"entry/a/0")
    assert schedule._when({"scheduled_for":"2026-11-04T01:00:00+00:00","timezone":"America/Los_Angeles"}).day == 3
    with pytest.raises(ValidationError):
        schedule._when({"scheduled_for":"2026-11-03T18:00","timezone":"America/Los_Angeles"})
    with pytest.raises(ValidationError):
        schedule._details({"script": "invalid"})


def test_cached_revision_skips_snapshot_queries(monkeypatch):
    from contextlib import contextmanager
    cur = Mock()
    cur.fetchone.return_value = {"revision":32}
    @contextmanager
    def transaction():
        yield cur
    monkeypatch.setattr(schedule, "get_db_transaction", transaction)
    assert schedule.snapshot(W, "32") == ("32", None)
    assert cur.execute.call_count == 2
    cur.fetchall.assert_not_called()

