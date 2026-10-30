"""Isolated pool/repository tests: never open a PostgreSQL connection."""
from contextlib import contextmanager
from unittest.mock import Mock

import psycopg
import pytest
from psycopg_pool import PoolTimeout

from db import connection
from errors import DatabaseUnavailableError
from repositories import brand_profile_repository as repository
from tests.test_step_g_routes import W


def test_pool_stays_lazy_and_validates_checkout(monkeypatch):
    constructor = Mock()
    constructor.check_connection = Mock()
    monkeypatch.setattr(connection, 'ConnectionPool', constructor)
    monkeypatch.setenv('DATABASE_URL', 'synthetic-no-network')
    pool = connection.LazyPool()
    constructor.assert_not_called()
    pool.connection()
    pool.connection()
    constructor.assert_called_once()
    assert constructor.call_args.kwargs['check'] is constructor.check_connection
    assert constructor.call_args.kwargs['min_size'] == 1
    assert constructor.call_args.kwargs['max_size'] == 10
    pool.close()
    constructor.return_value.close.assert_called_once()
    assert pool._pool is None


@pytest.mark.parametrize('exception', [psycopg.OperationalError('secret'), PoolTimeout('secret')])
@pytest.mark.parametrize('during_query', [False, True])
def test_connection_failures_are_sanitized_without_replay(monkeypatch, caplog, exception, during_query):
    @contextmanager
    def checkout():
        if not during_query: raise exception
        yield Mock()
    acquire = Mock(side_effect=checkout)
    monkeypatch.setattr(connection._connection_pool, 'connection', acquire)
    with pytest.raises(DatabaseUnavailableError) as failure:
        with connection.get_db_connection():
            raise exception
    assert 'secret' not in str(failure.value)
    assert 'secret' not in caplog.text
    acquire.assert_called_once()


@pytest.mark.parametrize('row', [None, {'workspace_id': W, 'business_name': "O'Connor; --"}])
def test_update_parameterization_and_commit_before_success(monkeypatch, row):
    cursor = Mock()
    cursor.fetchone.return_value = row
    committed = []
    @contextmanager
    def get_cursor(commit=False):
        assert commit
        yield cursor
        committed.append(True)
    monkeypatch.setattr(repository, 'get_db_cursor', get_cursor)
    def logged(*args, **kwargs):
        assert committed == [True]
        assert kwargs['status'] == ('success' if row else 'not_found')
    monkeypatch.setattr(repository, 'log_db_operation', logged)
    assert repository.update_brand_profile(W, business_name="O'Connor; --") == row
    sql, params = cursor.execute.call_args.args
    assert 'WHERE workspace_id = %s' in sql
    assert 'RETURNING' in sql
    assert "O'Connor" not in sql
    assert params == ("O'Connor; --", None, None, None, None, W)


def test_failed_commit_cannot_return_success(monkeypatch):
    @contextmanager
    def get_cursor(commit=False):
        cursor = Mock()
        cursor.fetchone.return_value = {'workspace_id': W, 'business_name': 'New'}
        yield cursor
        raise DatabaseUnavailableError()
    monkeypatch.setattr(repository, 'get_db_cursor', get_cursor)
    success = Mock()
    monkeypatch.setattr(repository, 'log_db_operation', success)
    with pytest.raises(DatabaseUnavailableError): repository.update_brand_profile(W, business_name='New')
    success.assert_not_called()
