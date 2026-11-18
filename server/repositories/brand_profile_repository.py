"""
server/repositories/brand_profile_repository.py
Data access operations for public.brand_profile.
Enforces workspace scoping, parameterization, and sanitized logging.
"""

from typing import Optional, Dict, Any
import psycopg
from psycopg.types.json import Jsonb
from psycopg.errors import UniqueViolation, ForeignKeyViolation, CheckViolation

from db.connection import get_db_cursor
from errors import ConflictError, ValidationError, DatabaseUnavailableError
from logging_utils import log_db_operation, log_db_error


def get_brand_profile(workspace_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the brand profile for a specific workspace with safe logging."""
    query = """
        SELECT id, workspace_id, business_name, nmls_id, dre_number,
               compliance_footer, equal_housing_text, tone, values,
               keywords, catchphrases, banned_words, blog_examples,
               settings, created_at, updated_at
        FROM public.brand_profile
        WHERE workspace_id = %s;
    """
    try:
        with get_db_cursor() as cursor:
            cursor.execute(query, (workspace_id,))
            row = cursor.fetchone()
            log_db_operation("get_brand_profile", workspace_id=workspace_id, status="success" if row else "not_found")
            return dict(row) if row else None
    except psycopg.OperationalError as e:
        log_db_error("get_brand_profile", e, workspace_id=workspace_id)
        raise DatabaseUnavailableError() from e
    except Exception as e:
        log_db_error("get_brand_profile", e, workspace_id=workspace_id)
        raise


def update_brand_profile(
    workspace_id: str,
    business_name: Optional[str] = None,
    nmls_id: Optional[str] = None,
    dre_number: Optional[str] = None,
    compliance_footer: Optional[str] = None,
    equal_housing_text: Optional[str] = None,
    **brand_fields,
) -> Optional[Dict[str, Any]]:
    """Update core identity and compliance fields without leaking sensitive inputs to logs."""
    allowed = {"tone", "values", "keywords", "catchphrases", "banned_words", "blog_examples", "licensed_person_name"}
    if brand_fields.keys() - allowed:
        raise ValidationError("Unsupported brand profile fields.")
    assignments = [
        "business_name = COALESCE(%s, business_name)",
        "nmls_id = COALESCE(%s, nmls_id)",
        "dre_number = COALESCE(%s, dre_number)",
        "compliance_footer = COALESCE(%s, compliance_footer)",
        "equal_housing_text = COALESCE(%s, equal_housing_text)",
    ]
    params = [business_name, nmls_id, dre_number, compliance_footer, equal_housing_text]
    for key, value in sorted(brand_fields.items()):
        if key == "licensed_person_name":
            assignments.append("settings = COALESCE(settings, '{}'::jsonb) || %s::jsonb")
            params.append(Jsonb({"licensed_person_name": value}))
        else:
            assignments.append(f'"{key}" = %s')
            params.append(Jsonb(value) if key in {"tone", "values", "blog_examples"} else value)
    params.append(workspace_id)
    query = "UPDATE public.brand_profile SET " + ", ".join(assignments) + """,
        updated_at = now() WHERE workspace_id = %s
        RETURNING id, workspace_id, business_name, nmls_id, dre_number,
                  compliance_footer, equal_housing_text, tone, values, keywords,
                  catchphrases, banned_words, blog_examples, settings, updated_at;
    """
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute(
                query,
                tuple(params),
            )
            row = cursor.fetchone()
        # Cursor context has committed before reporting success.
        log_db_operation("update_brand_profile", workspace_id=workspace_id, status="success" if row else "not_found")
        return dict(row) if row else None
    except UniqueViolation as e:
        log_db_error("update_brand_profile", e, workspace_id=workspace_id)
        raise ConflictError("A brand profile with this identifier already exists.") from e
    except (ForeignKeyViolation, CheckViolation) as e:
        log_db_error("update_brand_profile", e, workspace_id=workspace_id)
        raise ValidationError("Invalid brand profile data provided.") from e
    except psycopg.OperationalError as e:
        log_db_error("update_brand_profile", e, workspace_id=workspace_id)
        raise DatabaseUnavailableError() from e
    except Exception as e:
        log_db_error("update_brand_profile", e, workspace_id=workspace_id)
        raise
