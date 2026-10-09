"""
server/tests/test_workspace_context.py
Step F.10: Automated tests verifying identity-to-workspace resolution
and defense against client-controlled workspace spoofing.
"""

import uuid
import pytest
from auth.workspace_context import resolve_user_workspace
from errors import WorkspaceAccessDeniedError
from repositories.brand_profile_repository import get_brand_profile
from repositories.persona_repository import list_personas


def test_resolve_default_workspace_for_verified_user(dev_workspace_id):
    """Verify that a verified Step E user identity resolves to the authorized development workspace."""
    fake_auth_user_id = f"auth0|{uuid.uuid4().hex[:12]}"

    context = resolve_user_workspace(auth_user_id=fake_auth_user_id)
    assert context is not None
    assert context["workspace_id"] == dev_workspace_id
    assert context["auth_user_id"] == fake_auth_user_id

    # Confirm repository accepts resolved workspace_id
    profile = get_brand_profile(context["workspace_id"])
    assert profile is not None


def test_reject_unauthorized_foreign_workspace_request(dev_workspace_id, alternate_workspace_id):
    """
    CRITICAL INVARIANT:
    Client passes their genuine auth token, but supplies a foreign workspace ID in header/param.
    Server MUST reject the request with WorkspaceAccessDeniedError, refusing to execute query.
    """
    fake_auth_user_id = f"auth0|{uuid.uuid4().hex[:12]}"

    # User attempts to request alternate_workspace_id which they do not belong to
    with pytest.raises(WorkspaceAccessDeniedError):
        resolve_user_workspace(
            auth_user_id=fake_auth_user_id,
            requested_workspace_id=alternate_workspace_id
        )


def test_repository_execution_strictly_uses_resolved_context(dev_workspace_id):
    """Proves the full pipeline: verified identity -> resolved workspace -> repository read."""
    verified_auth_id = "user_verified_step_e"
    context = resolve_user_workspace(auth_user_id=verified_auth_id, requested_workspace_id=dev_workspace_id)
    
    # Repositories are executed with the server-authorized workspace_id
    personas = list_personas(workspace_id=context["workspace_id"])
    assert isinstance(personas, list)