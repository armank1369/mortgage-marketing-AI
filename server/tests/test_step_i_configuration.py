"""API capability and partial-update tests, plus isolated SQL shape/commit tests."""
from contextlib import contextmanager
from copy import deepcopy
from unittest.mock import Mock

import pytest
import app as api
from errors import ConflictError, DatabaseUnavailableError
from repositories import brand_profile_repository as brands, persona_repository as personas
from tests.test_step_g_routes import client, W, S

P = S


@pytest.fixture
def config_store(client, monkeypatch):
    profile = {'workspace_id': W, 'business_name': 'Synthetic', 'nmls_id': '123456',
               'dre_number': '00123456', 'tone': {'voice': 'Clear', 'emoji_policy': 'Minimal'},
               'settings': {'licensed_person_name': 'Synthetic Licensee', 'unrelated': 'PRIVATE'}}
    persona = {'id': P, 'workspace_id': W, 'name': 'Education', 'slug': 'education',
               'description': '', 'audience_profile': {}, 'prompt_guidance': '', 'is_starter': False}
    read_brand = Mock(side_effect=lambda workspace: deepcopy(profile))
    def write_brand(workspace, **patch):
        assert workspace == W
        if 'licensed_person_name' in patch:
            profile['settings']['licensed_person_name'] = patch.pop('licensed_person_name')
        profile.update(patch)
        return deepcopy(profile)
    write = Mock(side_effect=write_brand)
    create = Mock(return_value=persona)
    update = Mock(return_value=persona)
    listing = Mock(return_value=[persona])
    monkeypatch.setattr(api, 'get_brand_profile', read_brand)
    monkeypatch.setattr(api, 'update_brand_profile', write)
    monkeypatch.setattr(api, 'list_personas', listing)
    monkeypatch.setattr(api, 'create_persona', create)
    monkeypatch.setattr(api, 'update_persona', update)
    return profile, persona, read_brand, write, listing, create, update


@pytest.mark.parametrize('role,environment,allowed', [('owner', 'production', True), ('admin', 'production', True),
    ('developer', 'development', True), ('developer', 'test', True), ('developer', 'production', False),
    ('developer', 'staging', False), ('member', 'test', False), ('viewer', 'test', False)])
@pytest.mark.parametrize('method,path,payload,index', [
    ('PUT', '/api/brand-profile', {'tone': {'voice': 'Warm'}}, 3),
    ('POST', '/api/personas', {'slug': 'education', 'name': 'Education'}, 5),
    ('PUT', '/api/personas/' + P, {'prompt_guidance': 'Clear education'}, 6)])
def test_configuration_write_capabilities(client, config_store, role, environment, allowed, method, path, payload, index):
    client.context.update(role=role, environment=environment)
    response = client.open(path, method=method, json=payload, headers=client.headers())
    assert response.status_code == ((201 if method == 'POST' else 200) if allowed else 403)
    if allowed: config_store[index].assert_called_once()
    else: config_store[index].assert_not_called()
    client.ai.messages.create.assert_not_called()


@pytest.mark.parametrize('role', ['owner', 'admin', 'developer', 'member', 'viewer'])
def test_read_fields_and_permissions_without_private_settings(client, config_store, role):
    client.context['role'] = role
    brand = client.get('/api/brand-profile', headers=client.headers()).json
    listing = client.get('/api/personas', headers=client.headers()).json
    assert brand['licensed_person_name'] == 'Synthetic Licensee'
    assert brand['tone']['voice'] == 'Clear'
    assert 'PRIVATE' not in str(brand) and 'settings' not in brand
    assert brand['can_write'] == listing['can_write'] == (role in {'owner', 'admin', 'developer'})
    assert listing['personas'][0]['id'] == P


def test_partial_brand_update_preserves_other_values_and_name_setting(client, config_store):
    client.context['role'] = 'owner'
    before = deepcopy(config_store[0])
    response = client.put('/api/brand-profile', headers=client.headers(), json={'keywords': ['clear', 'precise']})
    assert response.status_code == 200
    config_store[3].assert_called_once_with(W, keywords=['clear', 'precise'])
    assert config_store[0]['tone'] == before['tone']
    assert config_store[0]['settings'] == before['settings']
    response = client.put('/api/brand-profile', headers=client.headers(), json={'licensed_person_name': 'New Synthetic Licensee'})
    assert response.json['licensed_person_name'] == 'New Synthetic Licensee'
    assert config_store[0]['settings']['unrelated'] == 'PRIVATE'


def test_all_brand_fields_can_be_saved_and_cleared(client, config_store):
    client.context['role'] = 'owner'
    fields = {'business_name': 'Reviewed Synthetic', 'licensed_person_name': 'New Name',
              'nmls_id': '654321', 'dre_number': '00111111', 'tone': {'voice': 'Warm'},
              'values': ['Accuracy'], 'keywords': ['clear'], 'catchphrases': ['Clarity.'],
              'banned_words': ['hype'], 'blog_examples': ['Educational example'],
              'compliance_footer': 'Supplemental disclosure', 'equal_housing_text': 'Additional reviewed text'}
    response = client.put('/api/brand-profile', headers=client.headers(), json=fields)
    assert response.status_code == 200
    for key, value in fields.items(): assert response.json[key] == value
    response = client.put('/api/brand-profile', headers=client.headers(), json={
        'tone': {}, 'values': [], 'compliance_footer': '', 'nmls_id': ''})
    assert response.status_code == 200 and response.json['nmls_id'] == ''
    # Drafts may be incomplete; resolver blocks generation until required fields are valid.


@pytest.mark.parametrize('payload', [{}, {'settings': {'licensed_person_name': 'Name'}}, {'workspace_id': S},
    {'licensed_person_name': None}, {'licensed_person_name': 'Name\nForged'}, {'nmls_id': '000000'},
    {'dre_number': 'invalid'}, {'tone': 'warm'}, {'values': ['x'] * 41}, {'keywords': [None]},
    {'blog_examples': 'raw'}, {'equal_housing_text': 'x' * 501}, {'compliance_footer': 'x' * 1001}])
def test_invalid_brand_changes_do_not_write(client, config_store, payload):
    client.context['role'] = 'owner'
    response = client.put('/api/brand-profile', headers=client.headers(), json=payload)
    assert response.status_code == 400
    config_store[3].assert_not_called()


@pytest.mark.parametrize('payload', [{}, {'name': 'Missing slug'}, {'slug': 'INVALID', 'name': 'Name'},
    {'slug': 'valid', 'name': ''}, {'slug': 'valid', 'name': 'Name', 'audience_profile': []},
    {'name': 'Name', 'slug': 'valid', 'is_starter': True}, {'workspace_id': S, 'name': 'Name', 'slug': 'valid'},
    {'slug': 'valid', 'name': 'Name', 'prompt_guidance': 'x' * 4001}])
def test_invalid_persona_changes_do_not_write(client, config_store, payload):
    client.context['role'] = 'owner'
    assert client.post('/api/personas', headers=client.headers(), json=payload).status_code == 400
    config_store[5].assert_not_called()


def test_persona_creation_and_partial_edit_are_scoped(client, config_store):
    client.context['role'] = 'owner'
    payload = {'slug': 'education', 'name': 'Education', 'audience_profile': {'needs': ['Clarity']}}
    assert client.post('/api/personas', headers=client.headers(), json=payload).status_code == 201
    config_store[5].assert_called_once_with(W, **payload)
    assert client.put('/api/personas/' + P, headers=client.headers(), json={'description': 'New description'}).status_code == 200
    config_store[6].assert_called_once_with(W, P, description='New description')


def test_persona_list_filters_foreign_deleted_and_private_fields(client, config_store):
    row = config_store[1]
    config_store[4].return_value = [{**row, 'private': 'SECRET'}, {**row, 'workspace_id': S},
                                   {**row, 'deleted_at': 'synthetic'}]
    response = client.get('/api/personas', headers=client.headers())
    assert len(response.json['personas']) == 1
    assert 'SECRET' not in str(response.json)
    config_store[4].assert_called_once_with(W)


def test_missing_persona_update_and_database_errors(client, config_store):
    client.context['role'] = 'owner'
    config_store[6].return_value = None
    response = client.put('/api/personas/' + P, headers=client.headers(), json={'name': 'Name'})
    assert response.status_code == 404
    config_store[5].side_effect = ConflictError('A persona with this slug already exists.')
    assert client.post('/api/personas', headers=client.headers(), json={'name': 'Name', 'slug': 'name'}).status_code == 409
    config_store[4].side_effect = DatabaseUnavailableError()
    assert client.get('/api/personas', headers=client.headers()).status_code == 503


@pytest.fixture
def sql_cursor(monkeypatch):
    cursor = Mock()
    cursor.fetchone.return_value = {'workspace_id': W, 'id': P}
    committed = []
    @contextmanager
    def acquire(commit=False):
        assert commit is True
        yield cursor
        committed.append(True)
    monkeypatch.setattr(brands, 'get_db_cursor', acquire)
    monkeypatch.setattr(personas, 'get_db_cursor', acquire)
    return cursor, committed


def test_brand_sql_merges_setting_without_losing_unknown_keys(sql_cursor):
    cursor, committed = sql_cursor
    brands.update_brand_profile(W, licensed_person_name="O'Connor", values=['Accuracy'], tone={'voice': 'Clear'}, keywords=['clear'])
    sql, params = cursor.execute.call_args.args
    assert "settings = COALESCE(settings, '{}'::jsonb) || %s::jsonb" in sql
    assert 'WHERE workspace_id = %s' in sql and 'RETURNING' in sql
    assert "O'Connor" not in sql
    assert any(getattr(param, 'obj', None) == {'licensed_person_name': "O'Connor"} for param in params)
    assert any(getattr(param, 'obj', None) == ['Accuracy'] for param in params)
    assert params[-1] == W and committed == [True]


def test_persona_sql_keeps_scope_and_soft_delete_on_update(sql_cursor):
    cursor, committed = sql_cursor
    personas.update_persona(W, P, audience_profile={'needs': ['Clarity']})
    sql, params = cursor.execute.call_args.args
    assert 'id = %s AND workspace_id = %s AND deleted_at IS NULL' in sql
    assert 'RETURNING' in sql and params[-2:] == (P, W)
    assert committed == [True]


def test_persona_create_sql_is_parameterized_and_starter_is_server_owned(sql_cursor):
    cursor, committed = sql_cursor
    personas.create_persona(W, slug='education', name="O'Connor")
    sql, params = cursor.execute.call_args.args
    assert 'false' in sql and "O'Connor" not in sql and params[0] == W
    assert 'RETURNING' in sql and committed == [True]
