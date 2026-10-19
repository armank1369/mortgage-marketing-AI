"""Exercise actual JWT/capability routes with mocked repositories, no network/DB."""
from unittest.mock import Mock

import pytest

from errors import NotFoundError, DatabaseUnavailableError
from repositories import chat_persistence_repository as chats
from tests.test_step_g_routes import client, W, M, S
from tests.test_step_j_repository import P

KEY = "66666666-6666-4666-8666-666666666666"
BASE = "/api/chat/sessions/" + S
ROUTES = [("PUT", BASE), ("PATCH", BASE), ("POST", BASE + "/operations"),
          ("GET", BASE + "/operations/" + KEY), ("POST", BASE + "/operations/" + KEY + "/abandon")]


@pytest.mark.parametrize("method,path", ROUTES)
def test_missing_auth_and_no_membership_stop_before_repository(client, monkeypatch, method, path):
    called = Mock(side_effect=AssertionError("Repository must not run"))
    for name in ("create_session", "patch_session", "shorten_operation", "get_operation", "abandon_operation"):
        monkeypatch.setattr(chats, name, called)
    assert client.open(path, method=method, json={}).status_code == 401
    client.memberships.clear()
    assert client.open(path, method=method, json={}, headers=client.headers()).status_code == 403
    called.assert_not_called()
    client.ai.messages.create.assert_not_called()


@pytest.mark.parametrize("method,path", [r for r in ROUTES if r[0] != "GET"])
def test_viewer_cannot_modify(client, method, path):
    client.context["role"] = "viewer"
    response = client.open(path, method=method, json={}, headers=client.headers())
    assert response.status_code == 403
    assert response.headers["Cache-Control"] == "no-store"


def test_idempotent_creation_server_owned_context_and_etag(client, monkeypatch):
    create = Mock(return_value=({"id": S, "etag": '"tag"'}, True))
    monkeypatch.setattr(chats, "create_session", create)
    response = client.put(BASE, json={"title": "Synthetic", "persona_id": P}, headers=client.headers())
    assert response.status_code == 201 and response.headers["ETag"] == '"tag"'
    create.assert_called_once_with(W, S, M, title="Synthetic", persona_id=P)
    create.return_value = ({"id": S, "etag": '"tag"'}, False)
    assert client.put(BASE, json={"title": "Synthetic", "persona_id": P}, headers=client.headers()).status_code == 200
    assert client.put(BASE, json={"title": "Synthetic", "persona_id": P, "created_by_member_id": S}, headers=client.headers()).status_code == 400


def test_v2_list_and_detail_preserve_legacy_shapes(client, monkeypatch):
    import app
    monkeypatch.setattr(app, "list_chat_sessions", Mock(return_value=[]))
    listing = Mock(return_value={"sessions": [], "next_cursor": None})
    monkeypatch.setattr(chats, "list_sessions", listing)
    assert client.get("/api/chat/sessions", headers=client.headers()).json == []
    response = client.get("/api/chat/sessions?version=2&archived=true&limit=7", headers=client.headers())
    assert response.json == {"sessions": [], "next_cursor": None}
    listing.assert_called_once_with(W, M, archived=True, limit=7, cursor=None)
    detail = Mock(return_value={"id": S, "etag": '"tag"', "messages": [], "operations": [], "before_cursor": None})
    monkeypatch.setattr(chats, "get_session", detail)
    client.context["role"] = "viewer"
    response = client.get(BASE + "?version=2&limit=8", headers=client.headers())
    assert response.status_code == 200 and response.headers["ETag"] == '"tag"'
    detail.assert_called_once_with(W, S, M, limit=8, before=None)


@pytest.mark.parametrize("query", ["version=3", "version=2&limit=0", "version=2&limit=101", "version=2&limit=1.5",
                                       "version=2&cursor=garbage", "version=2&archived=1", "version=2&limit=1&limit=2"])
def test_pagination_validation_before_repository(client, monkeypatch, query):
    listing = Mock()
    monkeypatch.setattr(chats, "list_sessions", listing)
    assert client.get("/api/chat/sessions?" + query, headers=client.headers()).status_code == 400
    listing.assert_not_called()


def test_patch_passes_precondition_and_only_allowed_fields(client, monkeypatch):
    patch = Mock(return_value={"id": S, "etag": '"new"'})
    monkeypatch.setattr(chats, "patch_session", patch)
    response = client.patch(BASE, json={"title": "Rename"}, headers={**client.headers(), "If-Match": '"old"'})
    assert response.status_code == 200 and response.headers["ETag"] == '"new"'
    patch.assert_called_once_with(W, S, M, {"title": "Rename"}, '"old"')
    assert client.patch(BASE, json={"archived": "true"}, headers=client.headers()).status_code == 400


def test_provider_operation_delegates_to_durable_service(client, monkeypatch):
    from services import chat_http
    execute = Mock(return_value={"operation_key": KEY, "state": "running", "response": None})
    monkeypatch.setattr(chat_http, "execute_operation", execute)
    fields = {"operation_key": KEY, "action": "send", "persona_id": P, "message": "Explain documents"}
    response = client.post(BASE + "/operations", json=fields, headers=client.headers())
    assert response.status_code == 202
    assert response.headers["Location"] == BASE + "/operations/" + KEY
    assert execute.call_args.args[:4] == (W, S, M, fields)
    client.ai.messages.create.assert_not_called()


def test_shorten_and_status_use_current_member(client, monkeypatch):
    result = {"state": "succeeded", "response": {"id": S}}
    shorten = Mock(return_value=result)
    monkeypatch.setattr(chats, "shorten_operation", shorten)
    fields = {"operation_key": KEY, "action": "shorten", "source_message_id": S}
    assert client.post(BASE + "/operations", json=fields, headers=client.headers()).json == result
    shorten.assert_called_once_with(W, S, M, fields)
    status = Mock(return_value=result)
    monkeypatch.setattr(chats, "get_operation", status)
    assert client.get(BASE + "/operations/" + KEY, headers=client.headers()).json == result
    status.assert_called_once_with(W, S, M, KEY)
    client.ai.messages.create.assert_not_called()


def test_abandon_requires_explicit_boolean_acknowledgement(client, monkeypatch):
    abandon = Mock(return_value={"state": "abandoned"})
    monkeypatch.setattr(chats, "abandon_operation", abandon)
    for ack in (False, 1, "true", None):
        assert client.post(BASE + "/operations/" + KEY + "/abandon", json={"acknowledge_uncertain_outcome": ack}, headers=client.headers()).status_code == 400
    assert client.post(BASE + "/operations/" + KEY + "/abandon", json={"acknowledge_uncertain_outcome": True}, headers=client.headers()).status_code == 200
    abandon.assert_called_once_with(W, S, M, KEY, acknowledged=True)


def test_foreign_records_and_outages_are_safe(client, monkeypatch):
    monkeypatch.setattr(chats, "get_session", Mock(side_effect=NotFoundError()))
    response = client.get(BASE + "?version=2", headers=client.headers())
    assert response.status_code == 404
    monkeypatch.setattr(chats, "get_session", Mock(side_effect=DatabaseUnavailableError()))
    assert client.get(BASE + "?version=2", headers=client.headers()).status_code == 503


def test_operation_body_limit_and_browser_assistant_injection(client):
    response = client.post(BASE + "/operations", json={"operation_key": KEY, "action": "send", "persona_id": P, "message": "x" * 140000}, headers=client.headers())
    assert response.status_code == 413
    for extra in ({"role": "assistant"}, {"structured_data": {}}, {"compliance_flags": []}, {"claim_token": KEY}):
        assert client.post(BASE + "/operations", json={"operation_key": KEY, "action": "send", "persona_id": P, "message": "Hello", **extra}, headers=client.headers()).status_code == 400


def test_head_options_never_modify_or_dispatch(client, monkeypatch):
    status = Mock(return_value={"state": "unknown"})
    monkeypatch.setattr(chats, "get_operation", status)
    assert client.head(BASE + "/operations/" + KEY, headers=client.headers()).status_code == 200
    assert client.options(BASE + "/operations", headers=client.headers()).status_code == 200
    assert client.get(BASE + "/operations", headers=client.headers()).status_code == 405
    client.ai.messages.create.assert_not_called()
