"""
server/auth/__init__.py
Centralized exports for authentication and workspace authorization.
"""

from .workspace_context import resolve_user_workspace, require_workspace

__all__ = ["resolve_user_workspace", "require_workspace"]