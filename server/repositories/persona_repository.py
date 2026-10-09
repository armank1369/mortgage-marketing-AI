"""
server/repositories/persona_repository.py
Data access operations for public.persona.
Enforces workspace scoping, parameterization, and sanitized domain errors.
"""

import logging
from typing import List, Optional, Dict, Any
import psycopg
from psycopg.errors import UniqueViolation, ForeignKeyViolation, CheckViolation

from db.connection import get_db_cursor
from errors import ConflictError, ValidationError, DatabaseUnavailableError

logger = logging.getLogger(__name__)

ALLOWED_SORT_COLUMNS = {"created_at", "name", "updated_at"}
ALLOWED_SORT_DIRECTIONS = {"ASC", "DESC"}


def list_personas(workspace_id: str, sort_by: str = "created_at", order: str = "ASC") -> List[Dict[str, Any]]:
    """List all active personas belonging strictly to workspace_id."""
    safe_sort = sort_by if sort_by in ALLOWED_SORT_COLUMNS else "created_at"
    safe_order = order.upper() if order.upper() in ALLOWED_SORT_DIRECTIONS else "ASC"

    query = f"""
        SELECT id, workspace_id, slug, name, description,
               audience_profile, prompt_guidance, is_starter,
               created_at, updated_at
        FROM public.persona
        WHERE workspace_id = %s
          AND deleted_at IS NULL
        ORDER BY {safe_sort} {safe_order};
    """
    try:
        with get_db_cursor() as cursor:
            cursor.execute(query, (workspace_id,))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
    except psycopg.OperationalError as e:
        logger.error("DB operational error in list_personas: %s", str(e))
        raise DatabaseUnavailableError() from e
    except Exception as e:
        logger.error("Unexpected error listing personas for workspace %s: %s", workspace_id, str(e))
        raise


def get_persona(workspace_id: str, persona_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single persona by ID, strictly constrained to workspace_id."""
    query = """
        SELECT id, workspace_id, slug, name, description,
               audience_profile, prompt_guidance, is_starter,
               created_at, updated_at
        FROM public.persona
        WHERE id = %s
          AND workspace_id = %s
          AND deleted_at IS NULL;
    """
    try:
        with get_db_cursor() as cursor:
            cursor.execute(query, (persona_id, workspace_id))
            row = cursor.fetchone()
            return dict(row) if row else None
    except psycopg.OperationalError as e:
        logger.error("DB operational error in get_persona: %s", str(e))
        raise DatabaseUnavailableError() from e
    except Exception as e:
        logger.error("Unexpected error getting persona %s: %s", persona_id, str(e))
        raise


def update_persona(
    workspace_id: str,
    persona_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    prompt_guidance: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Update editable fields of a persona belonging strictly to workspace_id."""
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
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute(
                query,
                (name, description, prompt_guidance, persona_id, workspace_id),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
    except UniqueViolation as e:
        logger.warning("Unique violation updating persona %s: %s", persona_id, str(e))
        raise ConflictError("A persona with this name or identifier already exists.") from e
    except (ForeignKeyViolation, CheckViolation) as e:
        logger.warning("Validation violation updating persona %s: %s", persona_id, str(e))
        raise ValidationError("Invalid persona data provided.") from e
    except psycopg.OperationalError as e:
        logger.error("DB operational error in update_persona: %s", str(e))
        raise DatabaseUnavailableError() from e
    except Exception as e:
        logger.error("Unexpected error updating persona %s: %s", persona_id, str(e))
        raise