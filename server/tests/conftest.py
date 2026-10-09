"""
server/tests/conftest.py
Pytest configuration and shared fixtures for repository testing.
"""

import sys
import os
import uuid
import pytest
from dotenv import load_dotenv

# Ensure server module imports resolve cleanly
server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

load_dotenv(os.path.join(server_dir, ".env"))

from db.connection import get_db_cursor


@pytest.fixture(scope="session")
def dev_workspace_id():
    """Fetches the real development workspace UUID for scoped testing."""
    with get_db_cursor() as cur:
        cur.execute("SELECT id FROM public.workspace WHERE slug = 'lucie-development';")
        row = cur.fetchone()
    
    assert row is not None, "Workspace 'lucie-development' not found in database."
    return str(row["id"])


@pytest.fixture(scope="session")
def alternate_workspace_id():
    """Generates an arbitrary isolated workspace UUID to test cross-tenant boundaries."""
    return str(uuid.uuid4())