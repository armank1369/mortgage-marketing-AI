"""Users tab: role policy, route guards and the repository's transactional checks, with fakes only."""
from contextlib import contextmanager

import pytest

from errors import ConflictError, NotFoundError, PermissionDeniedError
from repositories import members_repository
from services import members as policy
from tests.test_step_g_routes import client, W, M  # noqa: F401

OTHER = "44444444-4444-4444-8444-444444444444"
THIRD = "55555555-5555-4555-8555-555555555555"


def change(actor, target_role, new_role, owners=2, same=False):
    policy.authorize_change(actor_role=actor, actor_member_id="a", target_member_id="a" if same else "t",
                            target_role=target_role, new_role=new_role, owner_count=owners)


def test_owner_can_set_any_role():
    for new in policy.ROLES:
        change("owner", "member", new)
    change("owner", "admin", "viewer")


def test_admin_limited_to_everyday_roles():
    change("admin", "member", "viewer")
    change("admin", "viewer", "member")
    for target, new in [("member", "admin"), ("member", "owner"), ("member", "developer"),
                        ("admin", "member"), ("owner", "member"), ("developer", "member")]:
        with pytest.raises(PermissionDeniedError):
            change("admin", target, new)


@pytest.mark.parametrize("role", ["member", "viewer", "developer", None, "superuser"])
def test_non_managers_denied(role):
    with pytest.raises(PermissionDeniedError):
        change(role, "member", "viewer")


def test_no_self_change_and_last_owner_kept():
    with pytest.raises(ConflictError):
        change("owner", "owner", "member", same=True)
    with pytest.raises(ConflictError):
        change("owner", "owner", "admin", owners=1)
    change("owner", "owner", "admin", owners=2)


def test_unknown_role_value_rejected():
    with pytest.raises(Exception) as caught:
        policy.check_role_value("root")
    assert caught.value.status_code == 400


class FakeCursor:
    def __init__(self, members, actor_role):
        self.members, self.actor_role, self.rows, self.updates, self.inserted = members, actor_role, [], [], []

    def execute(self, sql, params=()):
        sql = " ".join(sql.split())
        if "FOR SHARE" in sql:
            self.rows = [{"id": M, "role": self.actor_role}] if params[0] == M else []
        elif "FOR UPDATE" in sql:
            self.rows = [{"id": k, "role": v} for k, v in self.members.items()]
        elif sql.startswith("UPDATE"):
            self.updates.append(params)
        elif "to_regclass" in sql:
            self.rows = [{"ok": True}]
        elif sql.startswith("SELECT 1 FROM neon_auth"):
            self.rows = [{"?column?": 1}] if params[0] == "free" else []
        elif sql.startswith("INSERT"):
            self.inserted.append(params)
            self.rows = [{"id": OTHER}] if params[1] != "dup" else []

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


@pytest.fixture
def db(monkeypatch):
    def install(members, actor_role="owner"):
        cur = FakeCursor(members, actor_role)

        @contextmanager
        def transaction():
            yield cur
        monkeypatch.setattr(members_repository, "get_db_transaction", transaction)
        return cur
    return install


def test_repository_updates_role(db):
    cur = db({M: "owner", OTHER: "member"})
    assert members_repository.change_role(W, M, OTHER, "admin", "member")["previous_role"] == "member"
    assert cur.updates == [("admin", OTHER, W)]


def test_repository_blocks_demoting_last_owner_even_by_another_owner_row(db):
    cur = db({M: "admin", OTHER: "owner"}, actor_role="admin")
    with pytest.raises(PermissionDeniedError):
        members_repository.change_role(W, M, OTHER, "member", None)
    cur = db({M: "owner", OTHER: "owner"})
    members_repository.change_role(W, M, OTHER, "member", "owner")
    cur = db({M: "owner", OTHER: "owner", THIRD: "member"})
    cur.members[OTHER] = "member"  # concurrent change already demoted them
    with pytest.raises(ConflictError):
        members_repository.change_role(W, M, OTHER, "admin", "owner")  # stale expected_role


def test_repository_unknown_member_and_actor_without_rights(db):
    db({M: "owner"})
    with pytest.raises(NotFoundError):
        members_repository.change_role(W, M, OTHER, "member", None)
    cur = db({M: "member", OTHER: "member"}, actor_role="member")
    with pytest.raises(PermissionDeniedError):
        members_repository.change_role(W, M, OTHER, "viewer", None)
    assert cur.updates == []


def test_grant_access(db):
    cur = db({M: "admin"}, actor_role="admin")
    assert members_repository.grant_access(W, M, "free", "member")["role"] == "member"
    assert cur.inserted == [(W, "free", "member")]
    with pytest.raises(PermissionDeniedError):
        members_repository.grant_access(W, M, "free", "admin")
    with pytest.raises(NotFoundError):
        members_repository.grant_access(W, M, "taken", "member")
    with pytest.raises(NotFoundError):
        members_repository.grant_access(W, M, "", "member")


@pytest.mark.parametrize("role", ["member", "viewer", "developer"])
def test_routes_forbidden_for_non_managers(client, role, monkeypatch):
    client.context["role"] = role
    called = []
    monkeypatch.setattr(members_repository, "list_people", lambda *a: called.append(a))
    monkeypatch.setattr(members_repository, "change_role", lambda *a: called.append(a))
    monkeypatch.setattr(members_repository, "grant_access", lambda *a: called.append(a))
    h = client.headers()
    assert client.get("/api/members", headers=h).status_code == 403
    assert client.put(f"/api/members/{OTHER}/role", json={"role": "viewer"}, headers=h).status_code == 403
    assert client.post("/api/members", json={"auth_user_id": "x", "role": "viewer"}, headers=h).status_code == 403
    assert called == []


def test_routes_for_admin(client, monkeypatch):
    client.context["role"] = "admin"
    seen = {}
    monkeypatch.setattr(members_repository, "list_people", lambda w, m: {"members": [], "workspace": w, "actor": m})
    monkeypatch.setattr(members_repository, "change_role",
                        lambda w, a, t, role, expected: seen.update(args=(w, a, t, role, expected)) or {"role": role})
    monkeypatch.setattr(members_repository, "grant_access", lambda w, a, u, role: {"id": OTHER, "role": role})
    h = client.headers()
    response = client.get("/api/members", headers=h)
    assert response.status_code == 200 and response.headers["Cache-Control"] == "private, no-store"
    assert response.get_json()["actor"] == M
    assert client.put(f"/api/members/{OTHER}/role", json={"role": "viewer", "expected_role": "member"},
                      headers=h).status_code == 200
    assert seen["args"] == (W, M, OTHER, "viewer", "member")
    assert client.put(f"/api/members/{OTHER}/role", json={"role": "root"}, headers=h).status_code == 400
    assert client.put(f"/api/members/{OTHER}/role", json={"role": "viewer", "expected_role": "root"},
                      headers=h).status_code == 400
    assert client.post("/api/members", json={"auth_user_id": "free", "role": "member"}, headers=h).status_code == 201
