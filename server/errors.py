"""
server/errors.py
Centralized application and database domain exception hierarchy.
Maps low-level exceptions to sanitized, safe HTTP responses.
"""

from typing import Tuple, Dict, Any, Optional


class AppError(Exception):
    """Base class for all domain-level application errors."""
    status_code: int = 500
    error_code: str = "internal_server_error"

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_response(self) -> Tuple[Dict[str, Any], int]:
        """Returns a sanitized JSON-serializable dictionary and HTTP status code."""
        payload: Dict[str, Any] = {
            "error": self.error_code,
            "message": self.message,
        }
        if self.details:
            payload["details"] = self.details
        return payload, self.status_code


class DatabaseUnavailableError(AppError):
    """Raised when Neon/PostgreSQL is unreachable, pool is exhausted, or connection timed out."""
    status_code = 503
    error_code = "database_unavailable"

    def __init__(self, message: str = "Database service is temporarily unavailable."):
        super().__init__(message)


class NotFoundError(AppError):
    """Raised when a requested resource does not exist in the specified workspace."""
    status_code = 404
    error_code = "not_found"

    def __init__(self, message: str = "The requested resource was not found."):
        super().__init__(message)


class ValidationError(AppError):
    """Raised when input parameters fail domain validation rules."""
    status_code = 400
    error_code = "validation_error"

    def __init__(self, message: str = "Invalid request parameters.", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)


class ConflictError(AppError):
    """Raised when a unique constraint or idempotency collision occurs."""
    status_code = 409
    error_code = "conflict"

    def __init__(self, message: str = "Resource conflict or duplicate entry."):
        super().__init__(message)


class WorkspaceAccessDeniedError(AppError):
    """Raised when a request attempts to access an unauthorized workspace."""
    status_code = 403
    error_code = "workspace_access_denied"

    def __init__(self, message: str = "Access to the requested workspace is forbidden."):
        super().__init__(message)


class PermissionDeniedError(AppError):
    status_code = 403
    error_code = "permission_denied"

    def __init__(self):
        super().__init__("You do not have permission for this operation.")


class WorkspaceSelectionRequiredError(AppError):
    status_code = 409
    error_code = "workspace_selection_required"

    def __init__(self):
        super().__init__("Select a workspace before continuing.")


class LegacyEndpointRetiredError(AppError):
    status_code = 410
    error_code = "legacy_endpoint_retired"

    def __init__(self):
        super().__init__("This legacy endpoint is no longer available in Lucie V2.")
