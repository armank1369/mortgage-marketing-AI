"""Step F.10 tests: bearer-JWT verification followed by membership authorization.

JWKS and the DB cursor are mocked here. The human test guide separately
requires a live Neon Auth / Flask / development database smoke test.
"""
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from flask import Flask, g, jsonify
from jwt.exceptions import InvalidTokenError

import auth_utils
import auth.workspace_context as workspace
from errors import AppError, WorkspaceAccessDeniedError

USER = "neon-auth-user-1"
WORKSPACE = "11111111-1111-4111-8111-111111111111"
FOREIGN_WORKSPACE = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
def membership_db(monkeypatch):
    """Mock membership results without granting automatic dev workspace access."""
    class Cursor:
        def execute(self, query, params=None):
            self.params = params
            self.query = query

        def fetchone(self):
            assert "public.workspace_member" in self.query
            if self.params[0] != USER:
                return None
            if len(self.params) > 1 and str(self.params[1]) != WORKSPACE:
                return None
            return {"workspace_id": WORKSPACE, "workspace_name": "Test", "role": "member"}

    @contextmanager
    def cursor():
        yield Cursor()

    monkeypatch.setattr(workspace, "get_db_cursor", cursor)


@pytest.fixture
def test_app():
    app = Flask(__name__)
    app.config.update(TESTING=True)

    @app.errorhandler(AppError)
    def handle_error(error):
        body, status = error.to_response()
        return jsonify(body), status

    @app.get("/api/test-protected")
    @workspace.require_workspace
    def protected():
        return jsonify({"user": g.auth_user_id, "workspace": g.workspace_id})
    return app


@pytest.fixture
def jwks_stub(monkeypatch):
    """Exercise *real* authenticate_request, with cryptographic IO stubbed."""
    monkeypatch.setattr(auth_utils, "_auth_config", lambda: ("https://auth.example", "https://auth.example/jwks"))
    key = SimpleNamespace(key="test-public-key")
    monkeypatch.setattr(auth_utils, "_jwks_client", lambda url: SimpleNamespace(
        get_signing_key_from_jwt=lambda token: key
    ))

    def verified_decode(token, key, **kwargs):
        assert kwargs["algorithms"] == ["EdDSA"]
        assert kwargs["issuer"] == kwargs["audience"] == "https://auth.example"
        if token != "valid-test-token":
            raise InvalidTokenError("invalid token")
        return {"sub": USER, "exp": 9999999999, "iss": "https://auth.example", "aud": "https://auth.example"}

    monkeypatch.setattr(auth_utils.jwt, "decode", verified_decode)


def test_workspace_membership_only(membership_db):
    assert workspace.resolve_user_workspace(USER)["workspace_id"] == WORKSPACE
    assert workspace.resolve_user_workspace(USER, WORKSPACE)["role"] == "member"


def test_foreign_workspace_denied(membership_db):
    with pytest.raises(WorkspaceAccessDeniedError):
        workspace.resolve_user_workspace(USER, FOREIGN_WORKSPACE)


def test_unknown_user_denied_even_when_dev_flags_set(membership_db, monkeypatch):
    monkeypatch.setenv("ALLOW_DEV_WORKSPACE_FALLBACK", "true")
    monkeypatch.setenv("ENVIRONMENT", "development")
    with pytest.raises(WorkspaceAccessDeniedError):
        workspace.resolve_user_workspace("unknown-neon-auth-user")


def test_no_token_returns_401(test_app, membership_db):
    response = test_app.test_client().get("/api/test-protected")
    assert response.status_code == 401
    assert response.get_json()["error"] == "unauthenticated"


def test_valid_token_resolves_workspace(test_app, membership_db, jwks_stub):
    response = test_app.test_client().get(
        "/api/test-protected", headers={"Authorization": "Bearer valid-test-token"}
    )
    assert response.status_code == 200
    assert response.get_json() == {"user": USER, "workspace": WORKSPACE}


def test_invalid_token_returns_401(test_app, membership_db, jwks_stub):
    response = test_app.test_client().get(
        "/api/test-protected", headers={"Authorization": "Bearer invalid-test-token"}
    )
    assert response.status_code == 401


def test_dev_header_cannot_bypass_jwt(test_app, membership_db, monkeypatch):
    monkeypatch.setenv("ALLOW_DEV_AUTH_BYPASS", "true")
    monkeypatch.setenv("ENVIRONMENT", "development")
    response = test_app.test_client().get(
        "/api/test-protected", headers={"X-Dev-Auth-User-Id": USER}
    )
    assert response.status_code == 401


def test_verified_user_foreign_workspace_rejected(test_app, membership_db, jwks_stub):
    response = test_app.test_client().get(
        "/api/test-protected", headers={
            "Authorization": "Bearer valid-test-token",
            "X-Workspace-Id": FOREIGN_WORKSPACE,
        }
    )
    assert response.status_code == 403
    assert response.get_json()["error"] == "workspace_access_denied"
