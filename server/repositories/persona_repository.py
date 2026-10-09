"""
server/repositories/persona_repository.py
Data access operations for public.persona.
All operations mandate explicit workspace scoping.
"""

from typing import List, Optional, Dict, Any
from db import get_db_cursor


def get_personas_by_workspace(workspace_id: str) -> List[Dict[str, Any]]:
    """
    Fetch all active marketing personas belonging to the designated workspace.
    Filters out soft-deleted personas.
    """
    query = """
        SELECT id, workspace_id, slug, name, description,
               audience_profile, prompt_guidance, is_starter,
               created_at, updated_at
        FROM public.persona
        WHERE workspace_id = %s
          AND deleted_at IS NULL
        ORDER BY created_at ASC;
    """
    with get_db_cursor() as cursor:
        cursor.execute(query, (workspace_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_persona_by_id(workspace_id: str, persona_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a single persona verifying that it belongs to the given workspace.
    """
    query = """
        SELECT id, workspace_id, slug, name, description,
               audience_profile, prompt_guidance, is_starter,
               created_at, updated_at
        FROM public.persona
        WHERE id = %s
          AND workspace_id = %s
          AND deleted_at IS NULL;
    """
    with get_db_cursor() as cursor:
        cursor.execute(query, (persona_id, workspace_id))
        row = cursor.fetchone()
        return dict(row) if row else None