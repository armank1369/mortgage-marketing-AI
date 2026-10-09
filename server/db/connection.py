"""
server/db/connection.py
Centralized PostgreSQL connection pooling and transaction boundary module.
Uses Psycopg 3 with automatic connection recovery and atomic transactions.
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
    logger.info("Psycopg 3 connection pool initialized.")
except Exception as e:
    logger.error("Failed to initialize database connection pool: %s", str(e))
    raise


@contextmanager
def get_db_connection():
    """Yields an active connection from the pool and returns it upon completion."""
    with _connection_pool.connection() as conn:
        yield conn


@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Yields a dict_row cursor for simple single-statement reads or isolated writes.
    If commit=True, commits automatically when exiting the block without error.
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
    
    Guarantees:
    - If all statements in the caller's block succeed -> conn.commit() is called once.
    - If any error or exception occurs -> conn.rollback() cancels all intermediate changes.
    - Connection is returned cleanly to the pool in both cases.
    """
    with get_db_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cursor:
                yield cursor