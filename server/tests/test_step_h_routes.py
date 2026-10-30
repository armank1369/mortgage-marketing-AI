"""Actual route guards/JWT verification, with repositories mocked; no live writes."""
from unittest.mock import Mock

import pytest
import app as api
from errors import DatabaseUnavailableError
from tests.test_step_g_routes import client, W, S


@pytest.fixture
def repositories(client, monkeypatch):
    read = Mock(return_value={"workspace_id": W, "business_name": "Existing"})
    write = Mock(return_value={"workspace_id": W, "business_name": "Persisted"})
    monkeypatch.setattr(api, "get_brand_profile", read)
    monkeypatch.setattr(api, "update_brand_profile", write)
    return read, write


def test_get_and_missing_profile(client, repositories):
    read, write = repositories
    data = client.get('/api/brand-profile', headers=client.headers()).json
    assert data['workspace_id'] == W and data['business_name'] == 'Existing'
    assert data['exists'] is True and data['can_write'] is False
    read.assert_called_once_with(W)
    read.return_value = None
    response = client.get('/api/brand-profile', headers=client.headers())
    assert response.status_code == 200
    assert response.json['workspace_id'] == W and response.json['business_name'] == ''
    assert response.json['exists'] is False
    write.assert_not_called()


def test_get_capability_guard(client, repositories):
    # Defense in depth even if a future membership resolver returns an unknown role.
    client.context['role'] = 'unknown'
    assert client.get('/api/brand-profile', headers=client.headers()).status_code == 403
    for repository in repositories: repository.assert_not_called()


@pytest.mark.parametrize('method', ['GET', 'PUT'])
def test_membership_database_failure(client, repositories, monkeypatch, method):
    from auth import workspace_context
    monkeypatch.setattr(workspace_context, 'list_user_workspaces', Mock(side_effect=DatabaseUnavailableError()))
    response = client.open('/api/brand-profile', method=method, headers=client.headers(), json={'business_name': 'New'})
    assert response.status_code == 503
    assert response.json['error'] == 'database_unavailable'
    for repository in repositories: repository.assert_not_called()


@pytest.mark.parametrize('role,environment,allowed', [
    ('owner', 'production', True), ('admin', 'production', True),
    ('developer', 'development', True), ('developer', 'test', True),
    ('developer', 'production', False), ('developer', 'staging', False),
    ('member', 'test', False), ('viewer', 'development', False),
])
def test_write_policy_and_persisted_response(client, repositories, role, environment, allowed):
    _, write = repositories
    client.context.update(role=role, environment=environment)
    response = client.put('/api/brand-profile', headers=client.headers(), json={'business_name': '  New name  '})
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        write.assert_called_once_with(W, business_name='New name')
        assert response.json['workspace_id'] == W and response.json['business_name'] == 'Persisted'
        assert response.json['can_write'] is True
    else:
        write.assert_not_called()


@pytest.mark.parametrize('method', ['GET', 'PUT'])
@pytest.mark.parametrize('failure,status', [('missing_token', 401), ('invalid_token', 401),
    ('no_membership', 403), ('foreign_workspace', 403), ('multiple', 409), ('invalid_workspace', 400)])
def test_access_denial_never_reaches_repository(client, repositories, method, failure, status):
    headers = client.headers()
    if failure == 'missing_token': headers = {}
    if failure == 'invalid_token': headers = {'Authorization': 'Bearer invalid'}
    if failure == 'no_membership': client.memberships.clear()
    if failure == 'foreign_workspace': headers['X-Workspace-Id'] = S
    if failure == 'invalid_workspace': headers['X-Workspace-Id'] = 'invalid'
    if failure == 'multiple': client.memberships.append(dict(client.context, workspace_id=S))
    response = client.open('/api/brand-profile', method=method, headers=headers, json={'business_name': 'New'})
    assert response.status_code == status
    for repository in repositories: repository.assert_not_called()


@pytest.mark.parametrize('method', ['GET', 'PUT'])
def test_explicit_second_workspace(client, repositories, method):
    client.context['role'] = 'owner'
    client.memberships.append(dict(client.context, workspace_id=S))
    read, write = repositories
    read.return_value = write.return_value = {'workspace_id': S, 'business_name': 'Second'}
    response = client.open('/api/brand-profile', method=method,
        headers={**client.headers(), 'X-Workspace-Id': S}, json={'business_name': 'Second'})
    assert response.status_code == 200
    assert response.json['workspace_id'] == S
    if method == 'GET': read.assert_called_once_with(S)
    else: write.assert_called_once_with(S, business_name='Second')


@pytest.mark.parametrize('payload', [None, [], 'name', 1, {}, {'business_name': None},
    {'business_name': ''}, {'business_name': ' \t\n '}, {'business_name': False},
    {'business_name': 123}, {'business_name': []}, {'business_name': {}}, {'business_name': 'x' * 101}])
def test_invalid_payload(client, repositories, payload):
    client.context['role'] = 'owner'
    assert client.put('/api/brand-profile', headers=client.headers(), json=payload).status_code == 400
    repositories[1].assert_not_called()


@pytest.mark.parametrize('body,content_type', [('{invalid', 'application/json'), ('name', 'text/plain'), ('', 'application/json')])
def test_malformed_or_missing_json(client, repositories, body, content_type):
    client.context['role'] = 'owner'
    assert client.put('/api/brand-profile', headers=client.headers(), data=body, content_type=content_type).status_code == 400
    repositories[1].assert_not_called()


def test_max_length_and_trim(client, repositories):
    client.context['role'] = 'owner'
    assert client.put('/api/brand-profile', headers=client.headers(), json={'business_name': '  ' + 'x' * 100 + '  '}).status_code == 200
    repositories[1].assert_called_once_with(W, business_name='x' * 100)


def test_missing_row_cannot_succeed(client, repositories):
    client.context['role'] = 'owner'
    repositories[1].return_value = None
    response = client.put('/api/brand-profile', headers=client.headers(), json={'business_name': 'New'})
    assert response.status_code == 404
    assert response.json['error'] == 'not_found'


@pytest.mark.parametrize('method', ['GET', 'PUT'])
@pytest.mark.parametrize('exception,status', [(DatabaseUnavailableError(), 503), (RuntimeError('secret SQL connection password'), 500)])
def test_safe_failure_response_and_log(client, repositories, caplog, method, exception, status):
    client.context['role'] = 'owner'
    repositories[method == 'PUT'].side_effect = exception
    response = client.open('/api/brand-profile', method=method, headers=client.headers(), json={'business_name': 'New'})
    assert response.status_code == status
    assert 'secret' not in response.get_data(as_text=True)
    assert 'secret' not in caplog.text
