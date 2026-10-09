"""
server/repositories/persona_repository.py
Data access operations for public.persona.
MANDATORY: Every function strictly enforces workspace isolation via workspace_id.
"""

from typing import List, Optional, Dict, Any
from db.connection import get_db_cursor


def list_personas(workspace_id: str) -> List[Dict[str, Any]]:
    """
    List all active personas belonging strictly to the provided workspace_id.
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
    Fetch a persona by ID, strictly constrained to workspace_id.
    Prevents Workspace A from viewing Workspace B's persona even if persona_id is known.
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


def create_persona(
    workspace_id: str,
    name: str,
    slug: str,
    description: Optional[str] = None,
    prompt_guidance: Optional[str] = None,
    is_starter: bool = False
) -> Dict[str, Any]:
    """
    Create a new marketing persona explicitly linked to workspace_id.
    """
    query = """
        INSERT INTO public.persona (
            workspace_id, name, slug, description, prompt_guidance, is_starter
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, workspace_id, slug, name, description,
                  prompt_guidance, is_starter, created_at, updated_at;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            query,
            (workspace_id, name, slug, description, prompt_guidance, is_starter)
        )
        row = cursor.fetchone()
        return dict(row)


def update_persona(
    workspace_id: str,
    persona_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    prompt_guidance: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Update persona attributes strictly scoped to workspace_id.
    Returns None if the persona does not exist or belongs to another workspace.
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


def delete_persona(workspace_id: str, persona_id: str) -> bool:
    """
    Soft-delete a persona strictly scoped to workspace_id by setting deleted_at = now().
    Returns True if a row was updated, False if not found or unauthorized.
    """
    query = """
        UPDATE public.persona
        SET deleted_at = now(),
            updated_at = now()
        WHERE id = %s
          AND workspace_id = %s
          AND deleted_at IS NULL;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(query, (persona_id, workspace_id))
        return cursor.rowcount > 0