"""
server/repositories/brand_profile_repository.py
Data access operations for public.brand_profile.
All operations mandate explicit workspace scoping.
"""

from typing import Optional, Dict, Any
from db import get_db_cursor


def get_brand_profile(workspace_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch the brand profile for a specific workspace.
    Returns None if no profile exists for that workspace.
    """
    query = """
        SELECT id, workspace_id, business_name, nmls_id, dre_number,
               compliance_footer, equal_housing_text, tone, values,
               keywords, catchphrases, banned_words, blog_examples,
               settings, created_at, updated_at
        FROM public.brand_profile
        WHERE workspace_id = %s;
    """
    with get_db_cursor() as cursor:
        cursor.execute(query, (workspace_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_brand_profile(
    workspace_id: str,
    business_name: Optional[str] = None,
    nmls_id: Optional[str] = None,
    dre_number: Optional[str] = None,
    compliance_footer: Optional[str] = None,
    equal_housing_text: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Update core compliance and identity fields on the workspace brand profile.
    """
    query = """
        UPDATE public.brand_profile
        SET
            business_name = COALESCE(%s, business_name),
            nmls_id = COALESCE(%s, nmls_id),
            dre_number = COALESCE(%s, dre_number),
            compliance_footer = COALESCE(%s, compliance_footer),
            equal_housing_text = COALESCE(%s, equal_housing_text),
            updated_at = now()
        WHERE workspace_id = %s
        RETURNING id, workspace_id, business_name, nmls_id, dre_number,
                  compliance_footer, equal_housing_text, updated_at;
    """
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            query,
            (business_name, nmls_id, dre_number, compliance_footer, equal_housing_text, workspace_id)
        )
        row = cursor.fetchone()
        return dict(row) if row else None