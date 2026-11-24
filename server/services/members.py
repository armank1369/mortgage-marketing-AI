"""Who may change workspace roles. Pure policy, so it can be tested without a database.

Only owners and admins manage people (developers are deliberately excluded, even in development
workspaces). Owners can set any role. Admins can only hand out and change the everyday roles, so an
admin can never create another admin or owner, or touch one. Nobody changes their own role, and a
workspace always keeps at least one owner.
"""
from errors import PermissionDeniedError, ValidationError, ConflictError

ROLES = ("owner", "admin", "developer", "member", "viewer")
MANAGER_ROLES = frozenset({"owner", "admin"})
ADMIN_MANAGED_ROLES = frozenset({"member", "viewer"})


def can_manage(actor_role):
    return actor_role in MANAGER_ROLES


def assignable_roles(actor_role):
    if actor_role == "owner":
        return list(ROLES)
    if actor_role == "admin":
        return [r for r in ROLES if r in ADMIN_MANAGED_ROLES]
    return []


def can_change(actor_role, actor_member_id, target_member_id, target_role):
    """UI hint and server rule: may this actor edit this person's role at all?"""
    if not can_manage(actor_role) or actor_member_id == target_member_id:
        return False
    return actor_role == "owner" or target_role in ADMIN_MANAGED_ROLES


def check_role_value(role):
    if role not in ROLES:
        raise ValidationError("Choose one of: " + ", ".join(ROLES) + ".")
    return role


def authorize_change(*, actor_role, actor_member_id, target_member_id, target_role, new_role, owner_count):
    """Raise unless this exact change is allowed. target_role is None when granting a new person."""
    check_role_value(new_role)
    if not can_manage(actor_role):
        raise PermissionDeniedError()
    if actor_member_id == target_member_id:
        raise ConflictError("You cannot change your own role. Ask another owner or admin.")
    if new_role not in assignable_roles(actor_role):
        raise PermissionDeniedError()
    if target_role is not None and not can_change(actor_role, actor_member_id, target_member_id, target_role):
        raise PermissionDeniedError()
    if target_role == "owner" and new_role != "owner" and owner_count <= 1:
        raise ConflictError("A workspace must keep at least one owner. Make someone else an owner first.")
