"""Workspace people and roles. Reads the managed neon_auth.user table (names and emails only) and
writes only public.workspace_member, so no schema change is needed."""
import logging

from db.connection import get_db_transaction
from errors import ConflictError, NotFoundError, PermissionDeniedError, WorkspaceAccessDeniedError
from services import members as policy
from validation import uuid_string

logger = logging.getLogger(__name__)

ACTIVE = "(to_jsonb(wm)->>'revoked_at') IS NULL"


def _accounts_available(cur):
    cur.execute("SELECT to_regclass('neon_auth.\"user\"') IS NOT NULL AS ok")
    return cur.fetchone()["ok"]


def _lock_actor(cur, workspace_id, actor_member_id):
    """Re-read the actor's role inside the transaction; the token context could be stale."""
    cur.execute(f"""SELECT wm.id, wm.role FROM public.workspace_member wm
                    WHERE wm.id=%s AND wm.workspace_id=%s AND {ACTIVE} FOR SHARE OF wm""",
                (actor_member_id, workspace_id))
    actor = cur.fetchone()
    if not actor:
        raise WorkspaceAccessDeniedError()
    if not policy.can_manage(actor["role"]):
        raise PermissionDeniedError()
    return actor


def list_people(workspace_id, actor_member_id):
    with get_db_transaction() as cur:
        actor = _lock_actor(cur, workspace_id, actor_member_id)
        accounts = _accounts_available(cur)
        join = ("LEFT JOIN neon_auth.\"user\" u ON u.id::text = wm.auth_user_id" if accounts else "")
        ident = ("to_jsonb(u)->>'email' AS email, to_jsonb(u)->>'name' AS name" if accounts
                 else "NULL AS email, NULL AS name")
        cur.execute(f"""SELECT wm.id, wm.role, wm.created_at, {ident}
                        FROM public.workspace_member wm {join}
                        WHERE wm.workspace_id=%s AND {ACTIVE}
                        ORDER BY wm.created_at, wm.id""", (workspace_id,))
        rows = cur.fetchall()
        unassigned = []
        if accounts:
            cur.execute("""SELECT u.id::text AS auth_user_id, to_jsonb(u)->>'email' AS email,
                                  to_jsonb(u)->>'name' AS name, to_jsonb(u)->>'createdAt' AS created_at
                           FROM neon_auth."user" u
                           WHERE NOT EXISTS (SELECT 1 FROM public.workspace_member m WHERE m.auth_user_id = u.id::text)
                           ORDER BY to_jsonb(u)->>'createdAt' DESC NULLS LAST LIMIT 100""")
            unassigned = cur.fetchall()
    role = actor["role"]
    members = [{"id": str(r["id"]), "name": r["name"], "email": r["email"], "role": r["role"],
                "joined": r["created_at"].isoformat(), "is_you": str(r["id"]) == actor_member_id,
                "can_change": policy.can_change(role, actor_member_id, str(r["id"]), r["role"])} for r in rows]
    return {"you": actor_member_id, "your_role": role, "assignable_roles": policy.assignable_roles(role),
            "members": members,
            "unassigned": [{"auth_user_id": r["auth_user_id"], "name": r["name"], "email": r["email"],
                            "registered": r["created_at"]} for r in unassigned]}


def change_role(workspace_id, actor_member_id, member_id, new_role, expected_role):
    member_id = uuid_string(member_id, "member_id")
    with get_db_transaction() as cur:
        actor = _lock_actor(cur, workspace_id, actor_member_id)
        # Lock every membership of this workspace so two simultaneous demotions cannot both pass
        # the last-owner check.
        cur.execute(f"""SELECT wm.id, wm.role FROM public.workspace_member wm
                        WHERE wm.workspace_id=%s AND {ACTIVE} ORDER BY wm.id FOR UPDATE OF wm""", (workspace_id,))
        rows = {str(r["id"]): r["role"] for r in cur.fetchall()}
        if member_id not in rows:
            raise NotFoundError("That person is not in this workspace.")
        current = rows[member_id]
        if expected_role is not None and expected_role != current:
            raise ConflictError("Their role was changed by someone else. Refresh and try again.")
        policy.authorize_change(actor_role=actor["role"], actor_member_id=actor_member_id,
                                target_member_id=member_id, target_role=current, new_role=new_role,
                                owner_count=sum(1 for r in rows.values() if r == "owner"))
        if current != new_role:
            cur.execute("UPDATE public.workspace_member SET role=%s WHERE id=%s AND workspace_id=%s",
                        (new_role, member_id, workspace_id))
    logger.info("workspace role changed workspace=%s by=%s member=%s %s->%s",
                workspace_id, actor_member_id, member_id, current, new_role)
    return {"id": member_id, "role": new_role, "previous_role": current}


def grant_access(workspace_id, actor_member_id, auth_user_id, new_role):
    if not isinstance(auth_user_id, str) or not auth_user_id.strip() or len(auth_user_id) > 128:
        raise NotFoundError("That account was not found.")
    with get_db_transaction() as cur:
        actor = _lock_actor(cur, workspace_id, actor_member_id)
        policy.authorize_change(actor_role=actor["role"], actor_member_id=actor_member_id,
                                target_member_id=None, target_role=None, new_role=new_role, owner_count=1)
        if not _accounts_available(cur):
            raise NotFoundError("Registered accounts are not available to this workspace.")
        # Only accounts that belong to no workspace yet can be claimed, so one workspace's admin can
        # never pull in somebody who already works elsewhere.
        cur.execute("""SELECT 1 FROM neon_auth."user" u WHERE u.id::text=%s
                       AND NOT EXISTS (SELECT 1 FROM public.workspace_member m WHERE m.auth_user_id=u.id::text)""",
                    (auth_user_id,))
        if not cur.fetchone():
            raise NotFoundError("That account was not found or already has a workspace.")
        cur.execute("""INSERT INTO public.workspace_member (workspace_id, auth_user_id, role) VALUES (%s,%s,%s)
                       ON CONFLICT (workspace_id, auth_user_id) DO NOTHING RETURNING id""",
                    (workspace_id, auth_user_id, new_role))
        row = cur.fetchone()
        if not row:
            raise ConflictError("That person already has access.")
    logger.info("workspace access granted workspace=%s by=%s member=%s role=%s",
                workspace_id, actor_member_id, row["id"], new_role)
    return {"id": str(row["id"]), "role": new_role}
