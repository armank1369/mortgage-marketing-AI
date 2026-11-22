"""Per-conversation voice overrides: validation, merging into generation context, storage and routes."""
from contextlib import contextmanager
import json
import re
from unittest.mock import Mock

from psycopg import errors as pg_errors
import pytest

from errors import ChatConflictError, ValidationError
from repositories import chat_persistence_repository as chats
from repositories import chat_voice_repository as voices
from services import generation_operations as operations
from services.voice_settings import apply_voice_overrides, normalize_voice
from tests.test_step_g_routes import client, W, M, S
from tests.test_step_j_operations import world, run, rows, result  # noqa: F401  (fixtures)

load_real = voices.load  # captured before conftest stubs it out


@pytest.mark.parametrize("data,expected", [
    (None, {}), ({}, {}), ({"tone": {}}, {}),
    ({"tone": {"serious": 5, "professional": 1}}, {"tone": {"professional": 1, "serious": 5}}),
])
def test_normalize_accepts_valid_settings(data, expected):
    assert normalize_voice(data) == expected


@pytest.mark.parametrize("data", [
    "loud", [], {"voice": "casual"}, {"tone": {"serious": 6}}, {"tone": {"serious": 0}}, {"tone": {"serious": True}},
    {"tone": {"serious": "3"}}, {"tone": {"loud": 3}}, {"tone": []}, {"ageRange": [20, 30]},
])
def test_normalize_rejects_invalid_settings(data):
    with pytest.raises(ValidationError):
        normalize_voice(data)


def test_overrides_merge_over_the_brand_tone(world, monkeypatch):
    from services import generation_context as gc
    context = gc.resolve_generation_context(W, persona_id=world[1][1]["id"].__str__())
    brand_tone = json.loads(context.brand.tone or "{}")
    merged = apply_voice_overrides(context, {"tone": {"serious": 5}})
    tone = json.loads(merged.brand.tone)
    assert tone["serious"] == 5 and {k: v for k, v in tone.items() if k != "serious"} == {k: v for k, v in brand_tone.items() if k != "serious"}
    assert merged.persona == context.persona
    assert apply_voice_overrides(context, {}) is context
    assert context.brand.tone == json.dumps(brand_tone, ensure_ascii=False, sort_keys=True) or not brand_tone  # original untouched


def test_generation_uses_this_conversations_overrides(world, monkeypatch):
    monkeypatch.setattr(voices, "load", lambda workspace_id, session_id: {"tone": {"serious": 5, "professional": 1}})
    _, create = run(world)
    system = json.dumps(create.call_args.kwargs["system"])
    assert re.search(r'serious\\+": 5', system) and re.search(r'professional\\+": 1', system)


def test_generation_without_overrides_is_unchanged(world):
    _, create = run(world)
    assert not re.search(r'serious\\+": 5', json.dumps(create.call_args.kwargs["system"]))


class VoiceSQL:
    def __init__(self, missing=False):
        self.missing, self.rows, self.store, self.calls = missing, [], {}, []

    def execute(self, sql, params=()):
        q = " ".join(sql.lower().split())
        self.calls.append(q)
        self.rows = []
        if "chat_session_voice" in q and self.missing:
            raise pg_errors.UndefinedTable("relation does not exist")
        if q.startswith("select 1 from public.chat_session"):
            self.rows = [{"?column?": 1}]
        elif q.startswith("select settings"):
            self.rows = [{"settings": self.store[params[0]]}] if params[0] in self.store else []
        elif q.startswith("insert into public.chat_session_voice"):
            self.store[params[0]] = params[2].obj
        elif q.startswith("delete from public.chat_session_voice"):
            self.store.pop(params[0], None)
        elif not q.startswith(("savepoint", "rollback", "release")):
            raise AssertionError(q)

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    @contextmanager
    def transaction(self):
        yield self


@pytest.fixture
def voice_db(monkeypatch):
    db = VoiceSQL()
    monkeypatch.setattr(voices, "get_db_transaction", db.transaction)
    monkeypatch.setattr(chats, "lock_member", Mock())
    monkeypatch.setattr(chats, "workspace_session", Mock(return_value={}))
    return db


def test_save_load_and_clear_round_trip(voice_db):
    saved = voices.save(W, S, M, {"tone": {"serious": 4, "professional": 2}})
    assert saved == {"tone": {"serious": 4, "professional": 2}}
    assert load_real(W, S) == saved
    chats.lock_member.assert_called_with(voice_db, W, M, "chat:write")
    assert voices.save(W, S, M, None) == {} and load_real(W, S) == {}


def test_save_rejects_invalid_before_touching_the_database(voice_db):
    with pytest.raises(ValidationError):
        voices.save(W, S, M, {"tone": {"serious": 9}})
    assert voice_db.calls == []


def test_missing_table_reads_as_defaults_and_reports_on_write(voice_db):
    voice_db.missing = True
    assert load_real(W, S) == {}
    with pytest.raises(ChatConflictError) as caught:
        voices.save(W, S, M, {"tone": {"serious": 4}})
    assert caught.value.error_code == "voice_storage_missing"
    assert voices.save(W, S, M, {}) == {}  # clearing never needs the table


def test_unvalidatable_stored_value_is_ignored(voice_db):
    voice_db.store[S] = {"tone": {"serious": 99}}
    assert load_real(W, S) == {}


def test_voice_routes(client, monkeypatch):
    save = Mock(return_value={"tone": {"serious": 4}})
    monkeypatch.setattr(voices, "save", save)
    response = client.put(f"/api/chat/sessions/{S}/voice", json={"voice_settings": {"tone": {"serious": 4}}}, headers=client.headers())
    assert response.status_code == 200 and response.json == {"voice_settings": {"tone": {"serious": 4}}}
    save.assert_called_once_with(W, S, M, {"tone": {"serious": 4}})
    assert client.put(f"/api/chat/sessions/{S}/voice", json={"voice_settings": {}, "extra": 1}, headers=client.headers()).status_code == 400
    client.context["role"] = "viewer"
    assert client.put(f"/api/chat/sessions/{S}/voice", json={"voice_settings": {}}, headers=client.headers()).status_code == 403
    assert save.call_count == 1


def test_create_with_voice_and_detail_expose_settings(client, monkeypatch):
    create = Mock(return_value=({"id": S, "etag": '"tag"'}, True))
    monkeypatch.setattr(chats, "create_session", create)
    save = Mock()
    monkeypatch.setattr(voices, "save", save)
    voice = {"tone": {"serious": 5}}
    body = {"title": "Synthetic", "persona_id": "44444444-4444-4444-8444-444444444444", "voice_settings": voice}
    response = client.put(f"/api/chat/sessions/{S}", json=body, headers=client.headers())
    assert response.status_code == 201 and response.json["voice_settings"] == voice
    save.assert_called_once_with(W, S, M, voice)
    create.assert_called_once()
    assert "voice_settings" not in create.call_args.kwargs
    body.pop("voice_settings")
    save.reset_mock()
    assert client.put(f"/api/chat/sessions/{S}", json=body, headers=client.headers()).status_code == 201
    save.assert_not_called()
    body["voice_settings"] = {"tone": {"serious": 12}}
    assert client.put(f"/api/chat/sessions/{S}", json=body, headers=client.headers()).status_code == 400
    monkeypatch.setattr(chats, "get_session", Mock(return_value={"id": S, "etag": '"tag"', "messages": [], "operations": [], "before_cursor": None}))
    monkeypatch.setattr(voices, "load", lambda workspace_id, session_id: voice)
    assert client.get(f"/api/chat/sessions/{S}?version=2", headers=client.headers()).json["voice_settings"] == voice
