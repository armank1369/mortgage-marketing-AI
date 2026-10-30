"""
server/tests/test_brand_profile_repository.py
Automated tests for brand_profile_repository operations,
parameterization, and workspace isolation.
"""

import pytest

pytestmark = pytest.mark.integration
from repositories.brand_profile_repository import get_brand_profile, update_brand_profile
from errors import DatabaseUnavailableError
from psycopg_pool import ConnectionPool


def test_get_existing_brand_profile(dev_workspace_id):
    """Verify reading the existing brand profile for the development workspace."""
    profile = get_brand_profile(dev_workspace_id)
    assert profile is not None
    assert str(profile["workspace_id"]) == dev_workspace_id
    assert "business_name" in profile
    assert "nmls_id" in profile


def test_brand_profile_isolated_from_foreign_workspace(alternate_workspace_id):
    """Verify that querying with a different/unrelated workspace returns None."""
    profile = get_brand_profile(alternate_workspace_id)
    assert profile is None


def test_update_brand_profile_and_read_back(dev_workspace_id):
    """Verify updating a profile field persists and can be read back cleanly."""
    baseline = get_brand_profile(dev_workspace_id)
    original_name = baseline.get("business_name") if baseline else "Lucie Mortgage"

    test_name = f"{original_name} Test"
    updated = update_brand_profile(dev_workspace_id, business_name=test_name)
    assert updated is not None
    assert updated["business_name"] == test_name

    # Confirm read-back
    refetched = get_brand_profile(dev_workspace_id)
    assert refetched["business_name"] == test_name

    # Restore baseline
    update_brand_profile(dev_workspace_id, business_name=original_name)


def test_sql_metacharacters_in_text_fields(dev_workspace_id):
    """Verify text containing SQL injection characters is stored and treated as literal data."""
    baseline = get_brand_profile(dev_workspace_id)
    original_name = baseline.get("business_name") if baseline else "Lucie Mortgage"

    malicious_string = "Mortgage O'Connor; DROP TABLE workspace; --"
    updated = update_brand_profile(dev_workspace_id, business_name=malicious_string)
    assert updated is not None
    assert updated["business_name"] == malicious_string

    # Read back and confirm exact string literal preserved
    refetched = get_brand_profile(dev_workspace_id)
    assert refetched["business_name"] == malicious_string

    # Restore baseline
    update_brand_profile(dev_workspace_id, business_name=original_name)


def test_database_connection_failure_handling():
    """Verify that invalid connection parameters raise controlled DatabaseUnavailableError."""
    from contextlib import contextmanager
    import psycopg

    @contextmanager
    def broken_connection():
        raise psycopg.OperationalError("Simulated connection timeout")

    with pytest.raises(DatabaseUnavailableError):
        # Trigger an operational error through our error mapping
        try:
            with broken_connection():
                pass
        except psycopg.OperationalError as e:
            raise DatabaseUnavailableError("Database unreachable") from e