"""Step C Policy v1 capabilities; role labels are never permission ranks."""
from functools import wraps

from flask import g

from errors import PermissionDeniedError

ROLE_CAPABILITIES = {
    "owner": frozenset({"workspace:read", "chat:read", "chat:create", "ai:generate", "config:write"}),
    "admin": frozenset({"workspace:read", "chat:read", "chat:create", "ai:generate", "config:write"}),
    "developer": frozenset({"workspace:read", "chat:read", "chat:create", "ai:generate"}),
    "member": frozenset({"workspace:read", "chat:read", "chat:create", "ai:generate"}),
    "viewer": frozenset({"workspace:read", "chat:read"}),
}


def check_capability(context, capability):
    allowed = capability in ROLE_CAPABILITIES.get(context["role"], ())
    if capability == "config:write" and context["role"] == "developer":
        allowed = context["environment"] in {"development", "test"}
    if not allowed:
        raise PermissionDeniedError()


def require_capability(capability):
    """Compose after require_workspace so identity and membership are checked first."""
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            check_capability(g.workspace_context, capability)
            return view(*args, **kwargs)
        return wrapped
    return decorate
