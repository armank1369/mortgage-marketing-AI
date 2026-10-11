"""Exercise actual Flask routes and JWT verification with local keys, no services."""
import json
import time
from types import SimpleNamespace
from unittest.mock import Mock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import app as api
import auth_utils
from auth import workspace_context

W = "11111111-1111-4111-8111-111111111111"
M = "22222222-2222-4222-8222-222222222222"
S = "33333333-3333-4333-8333-333333333333"
ORIGIN = "https://auth.example"
ROUTES = [
    ("GET", "/api/brand-profile"), ("GET", "/api/chat/sessions"),
    ("POST", "/api/chat/sessions"), ("GET", "/api/chat/sessions/" + S),
    ("GET", "/api/preferences"), ("POST", "/api/preferences"),
    ("GET", "/api/history"), ("POST", "/api/chat"),
    ("POST", "/api/social-image"), ("POST", "/api/video-brief"),
]


@pytest.fixture
def client(monkeypatch):
    api.app.config.update(TESTING=True)
    key = Ed25519PrivateKey.generate()
    monkeypatch.setattr(auth_utils, "_auth_config", lambda: (ORIGIN, ORIGIN + "/jwks"))
    monkeypatch.setattr(auth_utils, "_jwks_client", lambda url: SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))
    context = {"workspace_id": W, "workspace_member_id": M, "role": "member",
               "workspace_name": "Synthetic", "environment": "test", "auth_user_id": "user"}
    memberships = [context]
    monkeypatch.setattr(workspace_context, "list_user_workspaces", lambda user: list(memberships))
    monkeypatch.setattr(api, "list_user_workspaces", lambda user: list(memberships))
    ai = Mock()
    ai.messages.create.return_value = SimpleNamespace(
        content=[SimpleNamespace(type="text", text="A synthetic educational response.")], usage=None)
    monkeypatch.setattr(api, "anthropic_client", ai)
    monkeypatch.setattr(api, "log_usage", lambda *args: None)
    client = api.app.test_client()
    client.key, client.context, client.memberships, client.ai = key, context, memberships, ai
    client.token = lambda **changes: jwt.encode(dict(
        {"sub": "user", "exp": int(time.time()) + 60, "iss": ORIGIN, "aud": ORIGIN},
        **changes), key, algorithm="EdDSA")
    client.headers = lambda: {"Authorization": "Bearer " + client.token()}
    return client


def test_route_inventory():
    actual = {(method, rule.rule) for rule in api.app.url_map.iter_rules()
              for method in rule.methods - {"HEAD", "OPTIONS"} if rule.endpoint != "static"}
    expected = set(ROUTES) - {("GET", "/api/chat/sessions/" + S)}
    expected |= {("GET", "/api/chat/sessions/<session_id>"), ("GET", "/api/hello"),
                 ("GET", "/api/auth/me"), ("GET", "/api/workspaces")}
    assert actual == expected


@pytest.mark.parametrize("method,path", ROUTES + [("GET", "/api/workspaces"), ("GET", "/api/auth/me")])
def test_missing_token_never_calls_ai(client, method, path):
    response = client.open(path, method=method, json={}, headers={"X-Dev-Auth-User-Id": "user"})
    assert response.status_code == 401
    client.ai.messages.create.assert_not_called()


@pytest.mark.parametrize("claims", [{"exp": 1}, {"iss": "foreign"}, {"aud": "foreign"}, {"sub": ""}])
def test_real_jwt_validation_rejects_bad_claims(client, claims):
    response = client.get("/api/workspaces", headers={"Authorization": "Bearer " + client.token(**claims)})
    assert response.status_code == 401


def test_wrong_signature(client):
    token = jwt.encode({"sub": "user", "exp": int(time.time()) + 60, "iss": ORIGIN, "aud": ORIGIN},
                       Ed25519PrivateKey.generate(), algorithm="EdDSA")
    assert client.get("/api/workspaces", headers={"Authorization": "Bearer " + token}).status_code == 401


@pytest.mark.parametrize("method,path", ROUTES)
def test_no_membership_denies_protected_routes(client, method, path):
    client.memberships.clear()
    assert client.open(path, method=method, json={}, headers=client.headers()).status_code == 403
    client.ai.messages.create.assert_not_called()


def test_discovery_and_identity_work_without_membership(client):
    client.memberships.clear()
    response = client.get("/api/workspaces", headers=client.headers())
    assert response.status_code == 200
    assert response.json == {"workspaces": []}
    assert client.get("/api/auth/me", headers=client.headers()).status_code == 200


@pytest.mark.parametrize("path", ["/api/chat", "/api/social-image", "/api/video-brief", "/api/chat/sessions"])
def test_viewer_cannot_generate_or_create(client, path):
    client.context["role"] = "viewer"
    assert client.post(path, json={}, headers=client.headers()).status_code == 403
    client.ai.messages.create.assert_not_called()


@pytest.mark.parametrize("method,path", [("GET", "/api/history"), ("GET", "/api/preferences"), ("POST", "/api/preferences")])
def test_legacy_paths_retired(client, method, path):
    response = client.open(path, method=method, json={}, headers=client.headers())
    assert response.status_code == 410
    assert response.json["error"] == "legacy_endpoint_retired"


def test_creator_is_server_derived(client, monkeypatch):
    create = Mock(return_value={"id": S})
    monkeypatch.setattr(api, "create_chat_session_with_message", create)
    response = client.post("/api/chat/sessions", headers=client.headers(), json={
        "title": "Synthetic", "content": "Hello", "author_member_id": S,
        "created_by_member_id": S, "workspace_id": S, "role": "owner"})
    assert response.status_code == 201
    assert create.call_args.kwargs["author_member_id"] == M
    assert create.call_args.kwargs["workspace_id"] == W


@pytest.mark.parametrize("role", ["member", "owner", "admin"])
def test_read_passes_creator_even_for_admin(client, monkeypatch, role):
    client.context["role"] = role
    read = Mock(return_value=None)
    monkeypatch.setattr(api, "get_chat_session_messages", read)
    assert client.get("/api/chat/sessions/" + S, headers=client.headers()).status_code == 404
    read.assert_called_once_with(W, S, M)


def test_generation_still_returns_text(client):
    response = client.post("/api/chat", headers=client.headers(), json={"message": "Explain refinancing", "persona": "self-employed"})
    assert response.status_code == 200
    assert response.json["type"] == "text"
    client.ai.messages.create.assert_called_once()
    assert "RECENTLY USED CONTENT IDEAS" not in str(client.ai.messages.create.call_args)


@pytest.mark.parametrize("path,payload", [("/api/chat", []), ("/api/chat", {"message": []}),
    ("/api/chat/sessions", {"title": {}, "content": "x"}),
    ("/api/social-image", {"title": "x", "script": "bad"})])
def test_bad_input_never_calls_ai(client, path, payload):
    assert client.post(path, headers=client.headers(), json=payload).status_code == 400
    client.ai.messages.create.assert_not_called()


def test_head_and_options_do_not_bypass_access_or_generate(client):
    assert client.head("/api/chat/sessions").status_code == 401
    assert client.options("/api/chat").status_code == 200
    client.ai.messages.create.assert_not_called()


@pytest.mark.parametrize("missing", ["sub", "exp", "iss", "aud"])
def test_required_claims(client, missing):
    claims = {"sub": "user", "exp": int(time.time()) + 60, "iss": ORIGIN, "aud": ORIGIN}
    del claims[missing]
    token = jwt.encode(claims, client.key, algorithm='EdDSA')
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + token}).status_code == 401


def test_database_exception_is_sanitized(client, monkeypatch):
    monkeypatch.setattr(api, 'get_brand_profile', Mock(side_effect=RuntimeError('secret connection or record')))
    response = client.get('/api/brand-profile', headers=client.headers())
    assert response.status_code == 500
    assert 'secret' not in response.get_data(as_text=True)


def test_foreign_workspace_never_reaches_generation(client):
    headers = {**client.headers(), 'X-Workspace-Id': S}
    assert client.post('/api/chat', headers=headers, json={'message': 'Hello'}).status_code == 403
    client.ai.messages.create.assert_not_called()


def test_multiple_membership_choice_is_enforced_on_real_route(client):
    client.memberships.append(dict(client.context, workspace_id=S))
    assert client.post('/api/chat', headers=client.headers(), json={'message': 'Hello'}).status_code == 409
    client.ai.messages.create.assert_not_called()
    response = client.post('/api/chat', headers={**client.headers(), 'X-Workspace-Id': S}, json={'message': 'Hello'})
    assert response.status_code == 200


@pytest.mark.parametrize('kind', ['posts', 'campaign', 'video', 'image'])
def test_generation_response_shapes_preserved(client, kind):
    if kind == 'posts':
        output = {'posts': [{'script': {'hook': 'Education', 'body': 'Synthetic content', 'cta': 'Learn more'}}]}
        url, payload, key = '/api/chat', {'message': 'Explain refinancing'}, 'posts'
    elif kind == 'campaign':
        output = {'content_calendar': [], 'platform_breakdown': []}
        url, payload, key = '/api/chat', {'message': 'Original request: create a campaign'}, 'campaign'
    elif kind == 'video':
        output = {'script': {'intro': {'text': 'Education'}, 'body': {'text': 'Synthetic content'}, 'cta': {'text': 'Learn more'}}}
        url, payload, key = '/api/video-brief', {'caption': 'Synthetic caption'}, 'video'
    else:
        output = {'template': next(iter(api.SOCIAL_IMAGE_TEMPLATE_SLOTS)), 'slots': {}}
        url, payload, key = '/api/social-image', {'title': 'Synthetic title'}, 'template'
    client.ai.messages.create.return_value.content = [SimpleNamespace(type='text', text=json.dumps(output))]
    response = client.post(url, headers=client.headers(), json=payload)
    assert response.status_code == 200
    assert key in response.json
    client.ai.messages.create.assert_called_once()

