"""
server/db/connection.py
Centralized PostgreSQL connection pooling module using Psycopg.
Manages database sessions and automatic commit/rollback lifecycles.
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

try:
    _connection_pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row}
    )
    logger.info("Psycopg 3 connection pool initialized in db.connection.")
except Exception as e:
    logger.error("Failed to initialize database connection pool: %s", str(e))
    raise


@contextmanager
def get_db_connection():
    """Yields a raw connection from the pool and returns it upon completion."""
    with _connection_pool.connection() as conn:
        yield conn


@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Yields a dict_row cursor.
    Commits automatically if commit=True and block finishes without error.
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