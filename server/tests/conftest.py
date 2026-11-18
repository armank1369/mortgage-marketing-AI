"""Default tests cannot open PostgreSQL; integration requires explicit isolated URL."""
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import connection


def pytest_addoption(parser):
    parser.addoption("--run-integration", action="store_true", default=False)


def pytest_configure(config):
    config.addinivalue_line("markers", "integration: writes synthetic data to an explicitly approved isolated database")


def pytest_collection_modifyitems(config, items):
    for item in items:
        if item.get_closest_marker("integration") and not config.getoption("--run-integration"):
            item.add_marker(pytest.mark.skip(reason="Requires --run-integration and LUCIE_TEST_DATABASE_URL"))


@pytest.fixture(autouse=True)
def isolate_database(request, monkeypatch):
    if request.node.get_closest_marker("integration"):
        url = os.environ.get("LUCIE_TEST_DATABASE_URL")
        if not url:
            pytest.fail("Set LUCIE_TEST_DATABASE_URL to an approved disposable test database")
        monkeypatch.setenv("DATABASE_URL", url)
        yield
        connection._connection_pool.close()
    else:
        def forbidden(*args, **kwargs):
            raise AssertionError("Live database access is forbidden in unit tests")
        monkeypatch.setattr(connection._connection_pool, "connection", forbidden)
        yield


@pytest.fixture
def synthetic_workspace():
    workspace_id = str(uuid.uuid4())
    from db.connection import get_db_cursor
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace (id,slug,name,environment) VALUES (%s,%s,%s,'test')",
                    (workspace_id, "step-g-" + workspace_id, "Synthetic Step G"))
        cur.execute("INSERT INTO public.brand_profile (workspace_id,business_name) VALUES (%s,%s)",
                    (workspace_id, "Synthetic brand"))
    try:
        yield workspace_id
    finally:
        with get_db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM public.workspace WHERE id=%s AND environment='test'", (workspace_id,))


@pytest.fixture
def dev_workspace_id(synthetic_workspace):
    return synthetic_workspace


@pytest.fixture
def alternate_workspace_id():
    from db.connection import get_db_cursor
    workspace_id = str(uuid.uuid4())
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace (id,slug,name,environment) VALUES (%s,%s,%s,'test')",
                    (workspace_id, "step-g-" + workspace_id, "Second synthetic workspace"))
    try:
        yield workspace_id
    finally:
        with get_db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM public.workspace WHERE id=%s AND environment='test'", (workspace_id,))


@pytest.fixture
def member_id(dev_workspace_id):
    from db.connection import get_db_cursor
    with get_db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO public.workspace_member (workspace_id,auth_user_id,role) VALUES (%s,%s,'member') RETURNING id",
                    (dev_workspace_id, "synthetic-" + uuid.uuid4().hex))
        return str(cur.fetchone()["id"])
