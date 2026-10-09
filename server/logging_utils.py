"""
server/logging_utils.py
Centralized safe logging utilities.
Guarantees database logs record diagnostic metadata without leaking
credentials, connection strings, auth tokens, or client financial data.
"""

import re
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("lucie.db")

# Keys whose values should never appear in application logs
SENSITIVE_FIELD_NAMES = {
    "password", "token", "jwt", "authorization", "secret", "database_url",
    "nmls_id", "dre_number", "compliance_footer", "equal_housing_text",
    "blog_examples", "audience_profile", "prompt_guidance"
}


def mask_connection_string(conn_str: Optional[str]) -> str:
    """
    Masks credentials in database URIs (e.g. postgresql://user:password@host/db -> postgresql://user:***@host/db).
    """
    if not conn_str:
        return "[EMPTY]"
    # Regex masks password between user: and @
    return re.sub(r":([^:@]+)@", r":***@", conn_str)


def log_db_operation(
    operation: str,
    workspace_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    status: str = "success",
    extra: Optional[Dict[str, Any]] = None
) -> None:
    """
    Outputs structured diagnostic operational logs without dumping raw payloads.
    Example: [DB_OP] operation=get_brand_profile workspace_id=8bab... status=success
    """
    safe_parts = [
        f"operation={operation}",
        f"status={status}"
    ]
    if workspace_id:
        safe_parts.append(f"workspace_id={workspace_id}")
    if resource_id:
        safe_parts.append(f"resource_id={resource_id}")

    if extra:
        for k, v in extra.items():
            if k.lower() in SENSITIVE_FIELD_NAMES:
                safe_parts.append(f"{k}=[REDACTED]")
            else:
                safe_parts.append(f"{k}={v}")

    msg = f"[DB_OP] {' '.join(safe_parts)}"
    if status == "error":
        logger.error(msg)
    else:
        logger.info(msg)


def log_db_error(
    operation: str,
    exception: Exception,
    workspace_id: Optional[str] = None,
    resource_id: Optional[str] = None
) -> None:
    """
    Safely logs an exception name and high-level context without dumping sensitive statement payloads.
    """
    log_db_operation(
        operation=operation,
        workspace_id=workspace_id,
        resource_id=resource_id,
        status="error",
        extra={"exception": exception.__class__.__name__}
    )