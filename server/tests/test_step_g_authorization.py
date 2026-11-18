from contextlib import contextmanager

import pytest
from flask import Flask

from auth import workspace_context as workspace
from auth.permissions import check_capability
from errors import (PermissionDeniedError, WorkspaceAccessDeniedError,
                    WorkspaceSelectionRequiredError, ValidationError, DatabaseUnavailableError)

W1 = "11111111-1111-4111-8111-111111111111"
W2 = "22222222-2222-4222-8222-222222222222"
M1 = "33333333-3333-4333-8333-333333333333"


@pytest.fixture
def memberships(monkeypatch):
    rows = [{"workspace_id": W1, "workspace_member_id": M1, "workspace_name": "Test",
             "environment": "test", "role": "member"}]

    class Cursor:
        def execute(self, query, params):
            assert params == ("user",)

        def fetchall(self):
            return list(rows)

    @contextmanager
    def cursor():
        yield Cursor()

    monkeypatch.setattr(workspace, "get_db_cursor", cursor)
    return rows


def test_zero_memberships_discover_empty_and_resolver_denies(memberships):
    memberships.clear()
    assert workspace.list_user_workspaces("user") == []
    with pytest.raises(WorkspaceAccessDeniedError):
        workspace.resolve_user_workspace("user")


def test_multiple_requires_selection(memberships):
    memberships.append(dict(memberships[0], workspace_id=W2))
    with pytest.raises(WorkspaceSelectionRequiredError):
        workspace.resolve_user_workspace("user")
    assert workspace.resolve_user_workspace("user", W2)["workspace_id"] == W2


def test_removed_membership_cannot_use_stored_selection(memberships):
    assert workspace.resolve_user_workspace("user", W1)["workspace_member_id"] == M1
    memberships.clear()
    with pytest.raises(WorkspaceAccessDeniedError):
        workspace.resolve_user_workspace("user", W1)


def test_unknown_role_denied(memberships):
    memberships[0]["role"] = "superuser"
    assert workspace.list_user_workspaces("user") == []
    with pytest.raises(WorkspaceAccessDeniedError):
        workspace.resolve_user_workspace("user")


@pytest.mark.parametrize("query,headers", [
    ("?workspace_id=" + W2, {"X-Workspace-Id": W1}),
    ("?workspace_id=" + W1 + "&workspace_id=" + W1, {}),
    ("", {"X-Workspace-Id": "not-a-uuid"}),
    ("?workspace_id=", {}),
])
def test_bad_workspace_selectors(query, headers):
    with Flask(__name__).test_request_context("/" + query, headers=headers):
        with pytest.raises(ValidationError):
            workspace.requested_workspace()


@pytest.mark.parametrize("role", ["owner", "admin", "developer", "member"])
def test_generation_capability(role):
    check_capability({"role": role, "environment": "production"}, "ai:generate")


@pytest.mark.parametrize("role", ["viewer", "unknown"])
def test_generation_denied(role):
    with pytest.raises(PermissionDeniedError):
        check_capability({"role": role, "environment": "test"}, "ai:generate")


def test_developer_configuration_is_environment_limited():
    check_capability({"role": "developer", "environment": "test"}, "config:write")
    with pytest.raises(PermissionDeniedError):
        check_capability({"role": "developer", "environment": "production"}, "config:write")


def test_database_failure_is_not_membership_or_default_workspace(monkeypatch):
    @contextmanager
    def broken():
        raise RuntimeError("secret database error")
        yield
    monkeypatch.setattr(workspace, "get_db_cursor", broken)
    with pytest.raises(DatabaseUnavailableError) as caught:
        workspace.resolve_user_workspace("user")
    assert "secret" not in str(caught.value)


def test_soft_revoked_membership_hidden_and_denied(memberships):
    memberships[0]["revoked_at"] = "2026-10-10T12:00:00Z"
    assert workspace.list_user_workspaces("user") == []
    with pytest.raises(WorkspaceAccessDeniedError):
        workspace.resolve_user_workspace("user", W1)


def test_role_changes_apply_on_next_request(memberships):
    check_capability(workspace.resolve_user_workspace("user"), "ai:generate")
    memberships[0]["role"] = "viewer"
    with pytest.raises(PermissionDeniedError):
        check_capability(workspace.resolve_user_workspace("user"), "ai:generate")
