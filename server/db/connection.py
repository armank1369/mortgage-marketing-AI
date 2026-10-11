"""
server/db/connection.py
Centralized PostgreSQL connection pooling with safe diagnostic logging.
"""

import os
import logging
import atexit
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from errors import DatabaseUnavailableError

logger = logging.getLogger(__name__)

# Importing repositories or collecting tests must not connect to a live database.
# Preserve the existing pool interface for diagnostic scripts.
from threading import Lock


class LazyPool:
    def __init__(self):
        self._pool = None
        self._lock = Lock()

    def connection(self):
        with self._lock:
            if self._pool is None:
                url = os.getenv("DATABASE_URL")
                if not url:
                    raise DatabaseUnavailableError("Database is not configured.")
                self._pool = ConnectionPool(
                    conninfo=url, min_size=1, max_size=10, open=True,
                    kwargs={"row_factory": dict_row},
                )
            return self._pool.connection()

    def close(self):
        with self._lock:
            if self._pool is not None:
                self._pool.close()
                self._pool = None


_connection_pool = LazyPool()
atexit.register(_connection_pool.close)


@contextmanager
def get_db_connection():
    """Yields an active connection from the pool; maps connection failures to DatabaseUnavailableError."""
    try:
        with _connection_pool.connection() as conn:
            yield conn
    except (psycopg.OperationalError, PoolTimeout) as e:
        logger.error("Database connection failed or timed out (%s)", type(e).__name__)
        raise DatabaseUnavailableError("Database is currently unreachable. Please try again shortly.") from e


@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Yields a dict_row cursor for single-statement reads or isolated writes.
    Translates connection drops and manages transaction commit/rollback.
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


@contextmanager
def get_db_transaction():
    """
    Formal Transaction Boundary (Step F.6).
    Yields a cursor within an explicit atomic transaction block.
    """
    with get_db_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cursor:
                yield cursor