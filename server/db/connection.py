"""
server/db.py
Centralized PostgreSQL connection module using Psycopg and psycopg_pool.
Reads DATABASE_URL from the local environment and ensures safe query handling.
"""

import os
import logging
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Ensure server/.env contains your Neon development connection string."
    )

# Initialize thread-safe connection pool for Psycopg 3
try:
    _connection_pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row}
    )
    logger.info("Psycopg 3 database connection pool initialized successfully.")
except Exception as e:
    logger.error("Failed to initialize database connection pool: %s", str(e))
    raise


@contextmanager
def get_db_connection():
    """Acquires a connection from the pool and returns it upon completion."""
    with _connection_pool.connection() as conn:
        yield conn


@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Yields a dictionary cursor (dict_row).
    Commits automatically if commit=True and the block succeeds.
    Rolls back automatically on unhandled exception.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            try:
                yield cursor
                if commit:
                    conn.commit()
            except Exception:
                conn.rollback()
                raise