"""
server/tests/test_persona_repository.py
Automated tests for persona_repository operations,
cross-workspace access defense, and parameter safety.
"""

import uuid
import pytest

pytestmark = pytest.mark.integration
from repositories.persona_repository import (
    list_personas,
    get_persona,
    update_persona,
)
from db.connection import get_db_cursor


@pytest.fixture
def temp_persona(dev_workspace_id):
    """Creates a temporary persona in dev_workspace and removes it after test completes."""
    unique_slug = f"test-{uuid.uuid4().hex[:8]}"
    with get_db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO public.persona (workspace_id, name, slug, description, prompt_guidance)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, workspace_id, name, slug;
            """,
            (dev_workspace_id, "Automated Test Persona", unique_slug, "Temporary test", "Guidance")
        )
        row = cur.fetchone()

    yield row

    # Cleanup: Hard-delete test row
    with get_db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM public.persona WHERE id = %s;", (row["id"],))


def test_list_personas_in_workspace(dev_workspace_id, temp_persona):
    """Verify list_personas returns active personas for the workspace."""
    personas = list_personas(dev_workspace_id)
    assert isinstance(personas, list)
    assert any(str(p["id"]) == str(temp_persona["id"]) for p in personas)


def test_get_existing_persona(dev_workspace_id, temp_persona):
    """Verify get_persona returns the correct record when scoped to the right workspace."""
    persona = get_persona(dev_workspace_id, str(temp_persona["id"]))
    assert persona is not None
    assert str(persona["id"]) == str(temp_persona["id"])
    assert persona["slug"] == temp_persona["slug"]


def test_query_unknown_persona(dev_workspace_id):
    """Verify querying an unassigned persona UUID returns None."""
    random_id = str(uuid.uuid4())
    result = get_persona(dev_workspace_id, random_id)
    assert result is None


def test_cross_workspace_persona_leak_prevention(temp_persona, alternate_workspace_id):
    """
    CRITICAL SECURITY INVARIANT:
    Persona exists in Workspace A (dev_workspace_id), but is queried with Workspace B (alternate_workspace_id).
    Must return None, proving tenant boundary cannot be bypassed even with known persona_id.
    """
    persona_id = str(temp_persona["id"])
    leaked_result = get_persona(alternate_workspace_id, persona_id)
    assert leaked_result is None, "SECURITY FAILURE: Cross-workspace leak detected!"


def test_update_persona(dev_workspace_id, temp_persona):
    """Verify updating a persona returns the modified record and persists."""
    p_id = str(temp_persona["id"])
    new_name = "Updated Test Persona Name"
    new_desc = "Updated description with apostrophe: Buyer's Guide"

    updated = update_persona(dev_workspace_id, p_id, name=new_name, description=new_desc)
    assert updated is not None
    assert updated["name"] == new_name
    assert updated["description"] == new_desc

    # Read back
    refetched = get_persona(dev_workspace_id, p_id)
    assert refetched["name"] == new_name
    assert refetched["description"] == new_desc