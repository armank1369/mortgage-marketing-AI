"""
server/tests/test_workspace_context.py
Step F.10: Integration & security regression tests for workspace authorization.
Verifies verified membership resolution, gated development fallbacks,
rejection of foreign/unauthorized workspaces, and bypass denial in production.
"""

import os
import uuid
import pytest
from flask import Flask, jsonify, g

from auth.workspace_context import resolve_user_workspace, require_workspace
from errors import WorkspaceAccessDeniedError, AppError


@pytest.fixture
def test_app():
    """Isolated Flask test application with AppError handling registered."""
    app = Flask("workspace_test_app")
    app.config["TESTING"] = True

    @app.errorhandler(AppError)
    def handle_app_error(err):
        return jsonify({"error": err.message}), err.status_code

    @app.route("/api/test-protected", methods=["GET"])
    @require_workspace
    def test_protected_route():
        return jsonify({
            "workspace_id": g.workspace_id,
            "auth_user_id": g.auth_user_id,
            "role": g.workspace_context.get("role")
        }), 200

    return app


# =====================================================================
# 1. POSITIVE MEMBERSHIP & RESOLUTION TESTS
# =====================================================================

def test_resolve_user_workspace_development_fallback(dev_workspace_id):
    """
    In development mode with fallback enabled, an unregistered identity
    resolves to the lucie-development workspace.
    """
    random_user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    context = resolve_user_workspace(random_user_id)

    assert context is not None
    assert context["workspace_id"] == dev_workspace_id
    assert context["role"] == "admin"
    assert context["auth_user_id"] == random_user_id


def test_require_workspace_decorator_injects_context(test_app, dev_workspace_id):
    """
    Verifies that @require_workspace populates g.workspace_id and g.auth_user_id
    when running with allowed development headers.
    """
    test_user_id = f"dev-user-{uuid.uuid4().hex[:8]}"

    with test_app.test_client() as client:
        response = client.get(
            "/api/test-protected",
            headers={"X-Dev-Auth-User-Id": test_user_id}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["workspace_id"] == dev_workspace_id
        assert data["auth_user_id"] == test_user_id


# =====================================================================
# 2. CROSS-WORKSPACE & FOREIGN WORKSPACE REJECTION TESTS
# =====================================================================

def test_resolve_user_workspace_rejects_unauthorized_foreign_workspace(alternate_workspace_id):
    """
    Attempts to access an explicit foreign workspace ID where the user
    holds no membership must raise WorkspaceAccessDeniedError.
    """
    random_user_id = f"foreign-user-{uuid.uuid4().hex[:8]}"

    with pytest.raises(WorkspaceAccessDeniedError):
        resolve_user_workspace(
            auth_user_id=random_user_id,
            requested_workspace_id=alternate_workspace_id
        )


def test_require_workspace_rejects_foreign_workspace_header(test_app, alternate_workspace_id):
    """
    HTTP route must return HTTP 403 Forbidden when client supplies an
    unauthorized foreign workspace in the X-Workspace-Id header.
    """
    test_user_id = f"test-user-{uuid.uuid4().hex[:8]}"

    with test_app.test_client() as client:
        response = client.get(
            "/api/test-protected",
            headers={
                "X-Dev-Auth-User-Id": test_user_id,
                "X-Workspace-Id": alternate_workspace_id
            }
        )

        assert response.status_code == 403
        data = response.get_json()
        assert "forbidden" in data["error"].lower() or "denied" in data["error"].lower()


# =====================================================================
# 3. SECURITY HARDENING & PRODUCTION ENVIRONMENT GATES
# =====================================================================

def test_production_environment_rejects_unregistered_user(monkeypatch):
    """
    SECURITY INVARIANT:
    When running in production, the development fallback to lucie-development
    must be completely disabled and reject unmapped identities.
    """
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("ALLOW_DEV_WORKSPACE_FALLBACK", raising=False)

    random_user_id = f"prod-unregistered-{uuid.uuid4().hex[:8]}"

    with pytest.raises(WorkspaceAccessDeniedError):
        resolve_user_workspace(random_user_id)


def test_require_workspace_rejects_unauthenticated_request_when_bypass_disabled(test_app, monkeypatch):
    """
    SECURITY INVARIANT:
    When ALLOW_DEV_AUTH_BYPASS is disabled or in production, request header
    X-Dev-Auth-User-Id must be rejected and return 403.
    """
    monkeypatch.delenv("ALLOW_DEV_AUTH_BYPASS", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("FLASK_ENV", "production")

    with test_app.test_client() as client:
        response = client.get(
            "/api/test-protected",
            headers={"X-Dev-Auth-User-Id": "attacker_identity_header"}
        )

        assert response.status_code == 403
        data = response.get_json()
        assert "unauthenticated" in data["error"].lower() or "denied" in data["error"].lower()