"""
server/repositories/persona_repository.py
Data access operations for public.persona.
Implements minimal Step F.4 operations: list, get, and update.
"""

from typing import List, Optional, Dict, Any
from db.connection import get_db_cursor


def list_personas(workspace_id: str) -> List[Dict[str, Any]]:
    """
    List all active marketing personas belonging to the designated workspace.
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


def get_persona(workspace_id: str, persona_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a single persona by ID, strictly constrained to workspace_id.
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


def update_persona(
    workspace_id: str,
    persona_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    prompt_guidance: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Update core editable fields of a persona belonging strictly to workspace_id.
    """
    query = """
        UPDATE public.persona
        SET
            name = COALESCE(%s, name),
            description = COALESCE(%s, description),
            prompt_guidance = COALESCE(%s, prompt_guidance),
            updated_at = now()
        WHERE id = %s
          AND workspace_id = %s
          AND deleted_at IS NULL
        RETURNING id, workspace_id, slug, name, description,
                  prompt_guidance, is_starter, updated_at;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            query,
            (name, description, prompt_guidance, persona_id, workspace_id)
        )
        row = cursor.fetchone()
        return dict(row) if row else None