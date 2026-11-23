"""Automatic conversation titles: cleaning, uniqueness, storage rules and the route."""
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from errors import ValidationError
from repositories import chat_persistence_repository as chats
from repositories import chat_title_repository as titles
from services import chat_titles
from services.chat_titles import clean_title, fallback_title, is_placeholder, suggest_title, unique_title
from tests.test_step_g_routes import client, W, M, S


@pytest.mark.parametrize("raw,expected", [
    ('"First-Time Buyer Down Payment Tips"', "First-Time Buyer Down Payment Tips"),
    ("Title: Refinance Rate Drop Email.", "Refinance Rate Drop Email"),
    ("**Spring Open House Campaign**\nA second line", "Spring Open House Campaign"),
    ("  \n  ", ""), ("ok", ""), (None, ""), (5, ""),
    ("word " * 30, "word word word word word word word word word word word word"),
])
def test_clean_title(raw, expected):
    assert clean_title(raw) == expected
    assert len(clean_title(raw)) <= chat_titles.MAX_TITLE


def test_fallback_title_is_short_and_readable():
    assert fallback_title("Can you write an Instagram caption about FHA loan limits for first time buyers in 2026?") == "Write an Instagram caption about FHA loan…"
    assert fallback_title("hi") == ""
    assert fallback_title("Explain documents.") == "Explain documents"


def test_unique_title_numbers_collisions_case_insensitively():
    assert unique_title("Down Payment Tips", ["Other"]) == "Down Payment Tips"
    assert unique_title("Down Payment Tips", ["down payment tips"]) == "Down Payment Tips (2)"
    assert unique_title("Down Payment Tips", ["Down Payment Tips", "Down Payment Tips (2)"]) == "Down Payment Tips (3)"
    assert len(unique_title("x" * 60, ["x" * 60])) <= 60


def test_placeholder_detection_never_matches_a_person_written_title():
    assert is_placeholder("Investors", "Investors", "Hello") and is_placeholder("New conversation", None, "Hello")
    assert is_placeholder("Explain documents.", "Investors", "Explain documents.")
    assert not is_placeholder("My renamed chat", "Investors", "Explain documents.")


def reply(text):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])


def test_model_title_is_used_and_prompt_lists_existing_titles():
    runtime = SimpleNamespace(model="m", create=Mock(return_value=reply('"Refinance Rate Drop Email"')))
    assert suggest_title(runtime, "Write an email about refinancing", "Here is a draft...", ["Taken title"]) == "Refinance Rate Drop Email"
    kwargs = runtime.create.call_args.kwargs
    assert "Taken title" in kwargs["messages"][0]["content"] and kwargs["max_tokens"] == 40
    assert runtime.create.call_count == 1


@pytest.mark.parametrize("outcome", [RuntimeError("down"), reply("  ")])
def test_failure_or_empty_output_falls_back_without_retrying(outcome):
    create = Mock(side_effect=outcome) if isinstance(outcome, Exception) else Mock(return_value=outcome)
    runtime = SimpleNamespace(model="m", create=create)
    assert suggest_title(runtime, "Explain documents.", "reply", []) == "Explain documents"
    assert create.call_count == 1


class TitleSQL:
    def __init__(self, title="Investors"):
        self.session = {"id": S, "workspace_id": W, "default_persona_id": "p1", "title": title, "created_by_member_id": M,
                        "summary_status": "pending", "started_at": None, "updated_at": None, "archived_at": None}
        self.first_request, self.first_reply, self.others, self.rows, self.calls = "Explain documents.", "Here you go.", ["Taken"], [], []

    def execute(self, sql, params=()):
        q = " ".join(sql.lower().split())
        self.calls.append(q)
        self.rows = []
        if q.startswith("select name from public.persona"):
            self.rows = [{"name": "Investors"}]
        elif "role='user'" in q:
            self.rows = [{"content": self.first_request}] if self.first_request else []
        elif "role='assistant'" in q:
            self.rows = [{"content": self.first_reply}] if self.first_reply else []
        elif q.startswith("select title from public.chat_session"):
            self.rows = [{"title": t} for t in self.others]
        elif q.startswith("select pg_advisory_xact_lock"):
            pass
        elif q.startswith("update public.chat_session set title"):
            self.session["title"] = params[0]
            self.rows = [self.session]
        else:
            raise AssertionError(q)

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def fetchall(self):
        rows, self.rows = self.rows, []
        return rows

    @contextmanager
    def transaction(self):
        yield self


@pytest.fixture
def db(monkeypatch):
    sql = TitleSQL()
    monkeypatch.setattr(titles, "get_db_transaction", sql.transaction)
    monkeypatch.setattr(chats, "lock_member", Mock())
    monkeypatch.setattr(chats, "workspace_session", lambda cur, w, s, **k: sql.session)
    monkeypatch.setattr(chats, "session_dto", lambda row: {"id": str(row["id"]), "title": row["title"]})
    return sql


def test_context_only_for_placeholder_titles_with_a_reply(db):
    assert titles.title_context(W, S, M)["eligible"] is True
    db.session["title"] = "A title a person wrote"
    assert titles.title_context(W, S, M)["eligible"] is False
    assert titles.title_context(W, S, M, force=True)["eligible"] is True
    db.first_reply = ""
    assert titles.title_context(W, S, M, force=True)["eligible"] is False
    chats.lock_member.assert_called_with(db, W, M, "chat:write", "ai:generate")


def test_apply_is_compare_and_set_and_unique(db):
    assert titles.apply_title(W, S, M, "someone renamed it", "New Title") == ({"id": S, "title": "Investors"}, False)
    db.others = ["new title"]
    saved, changed = titles.apply_title(W, S, M, "Investors", "New Title")
    assert changed and saved["title"] == "New Title (2)"
    assert titles.apply_title(W, S, M, "New Title (2)", "New Title (2)")[1] is False


def test_title_route_generates_once_and_skips_ineligible(client, monkeypatch):
    runtime = SimpleNamespace(model="m", create=Mock(return_value=reply("Refinance Rate Drop Email")))
    import app
    monkeypatch.setitem(app.app.extensions, "generation_runtime", runtime)
    context = Mock(return_value={"session": {"id": S, "title": "Investors"}, "eligible": True, "title": "Investors",
                                 "first_request": "Write an email", "first_reply": "Draft", "taken": []})
    monkeypatch.setattr(titles, "title_context", context)
    apply = Mock(return_value=({"id": S, "title": "Refinance Rate Drop Email"}, True))
    monkeypatch.setattr(titles, "apply_title", apply)
    response = client.post(f"/api/chat/sessions/{S}/title", json={}, headers=client.headers())
    assert response.status_code == 200 and response.json == {"changed": True, "session": {"id": S, "title": "Refinance Rate Drop Email"}}
    context.assert_called_once_with(W, S, M, force=False)
    apply.assert_called_once_with(W, S, M, "Investors", "Refinance Rate Drop Email")
    context.return_value = {"session": {"id": S, "title": "Mine"}, "eligible": False}
    assert client.post(f"/api/chat/sessions/{S}/title", json={}, headers=client.headers()).json["changed"] is False
    assert runtime.create.call_count == 1 and apply.call_count == 1
    assert client.post(f"/api/chat/sessions/{S}/title", json={"force": "yes"}, headers=client.headers()).status_code == 400
    assert client.post(f"/api/chat/sessions/{S}/title", json={"x": 1}, headers=client.headers()).status_code == 400


def test_title_route_needs_write_and_ai_generate(client, monkeypatch):
    context = Mock()
    monkeypatch.setattr(titles, "title_context", context)
    client.context["role"] = "viewer"
    assert client.post(f"/api/chat/sessions/{S}/title", json={}, headers=client.headers()).status_code == 403
    context.assert_not_called()
