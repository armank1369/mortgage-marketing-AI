"""Synthetic regression coverage; no database or provider network access."""
from copy import deepcopy
import json
from uuid import uuid4

import pytest

from errors import ChatConflictError, PreconditionFailedError
from repositories import chat_persistence_repository as repo
from repositories import generation_operation_repository as runs
from services.chat_contract import metadata_etag, public_message
from services.session_presentation import assert_persona, persona_state, PRESENTATION_SQL
from services.recent_ideas import extract_ideas, capture_recent_ideas, encode_ideas
from services.prompt_builder import build_prompt
from tests.test_step_j_repository import store, W, S, M, P, OTHER, send
from tests.test_step_j_operations import world
from tests.test_step_i_context import rows


@pytest.mark.parametrize('selection', [OTHER, None])
def test_persisted_selection_is_immutable_and_etag_still_applies(store, selection):
    before = deepcopy(store.sessions[S])
    with pytest.raises(PreconditionFailedError):
        repo.patch_session(W, S, M, {'default_persona_id': selection}, 'stale')
    with pytest.raises(ChatConflictError) as caught:
        repo.patch_session(W, S, M, {'default_persona_id': selection}, metadata_etag(before))
    assert caught.value.error_code == 'persona_locked'
    assert store.sessions[S] == before
    assert repo.patch_session(W, S, M, {'default_persona_id': P}, metadata_etag(before))['default_persona_id'] == P


@pytest.mark.parametrize('action', ['send', 'clarify', 'regenerate', 'video', 'social_image'])
def test_every_provider_action_rejects_other_persona_without_writes(store, action):
    with pytest.raises(ChatConflictError) as caught:
        assert_persona(store, store.sessions[S], {'action': action, 'persona_id': OTHER})
    assert caught.value.error_code == 'persona_locked'
    assert not store.messages


def test_claim_and_preparation_reject_mismatch_but_replay_still_works(world):
    db, _ = world
    with pytest.raises(ChatConflictError):
        runs.prepare_operation(W, S, M, send(persona_id=OTHER))
    with pytest.raises(ChatConflictError):
        repo.claim_operation(W, S, M, send(persona_id=OTHER))
    assert not db.messages and not db.runs
    data = send()
    claim = repo.claim_operation(W, S, M, data)
    repo.complete_operation(W, S, M, data['operation_key'], claim['request']['structured_data']['operation']['claim_token'],
                            {'type': 'text', 'response': 'Saved concept'})
    db.sessions[S]['default_persona_id'] = OTHER
    db.personas.clear()
    assert runs.prepare_operation(W, S, M, data)['replay']['state'] == 'succeeded'
    assert not repo.claim_operation(W, S, M, data)['created']


def test_full_history_conflict_is_not_limited_to_latest_page(store):
    for i in range(65):
        data = send(message=f'Idea {i}')
        claim = repo.claim_operation(W, S, M, data)
        repo.complete_operation(W, S, M, data['operation_key'], claim['request']['structured_data']['operation']['claim_token'],
                                {'type': 'text', 'response': f'Concept {i}'})
    oldest = next(row for row in store.messages.values() if row['role'] == 'assistant')
    oldest['persona_id'] = OTHER
    history = repo.get_session(W, S, M, limit=2)
    assert len(history['messages']) == 2 and history['persona_state'] == 'mixed'
    listing = repo.list_sessions(W, M, limit=1)['sessions'][0]
    assert listing['preview'] == 'Idea 0' and listing['content_types'] == ['text']
    with pytest.raises(ChatConflictError):
        repo.claim_operation(W, S, M, send())
    store.messages[oldest['id']]['persona_id'] = None
    assert repo.get_session(W, S, M)['persona_state'] == 'ambiguous'


def test_state_and_source_checks_do_not_reassign_history(store):
    assert persona_state({'default_persona_id': None}, {'persona_ids': [P]}) == 'ambiguous'
    assert persona_state({'default_persona_id': P}, {'persona_ids': [P]}) == 'unavailable'
    with pytest.raises(ChatConflictError):
        assert_persona(store, store.sessions[S], {'action': 'video', 'persona_id': P}, {'persona_id': OTHER})
    assert_persona(store, store.sessions[S], {'action': 'shorten'})
    assert 'limit' not in PRESENTATION_SQL.split('AS persona_ids')[0].lower()


def test_recent_ideas_boundaries_and_public_serialization():
    rows = [{'structured_data': {'type': 'posts', 'payload': {'posts': {'posts': [
        {'title': f'{index} ' + '🏡' * 500} for index in range(40)]}}}}]
    ideas = extract_ideas(rows)
    assert 0 < len(ideas) <= 25
    assert len(encode_ideas(ideas).encode('utf-8')) <= 8192
    malicious = [{'structured_data': {'type': 'posts', 'payload': {'posts': {'posts': [{'title': str(index) + '<' * 500} for index in range(30)]}}}}]
    assert len(encode_ideas(extract_ideas(malicious)).encode('utf-8')) <= 8192
    assert '<' not in encode_ideas(extract_ideas(malicious))
    assert extract_ideas([{'structured_data': {'type': 'text', 'payload': {'response': 'One\nTwo'}}}] * 12) == ['One']
    message = public_message({'structured_data': {'operation': {'claim_token': 'secret'}, 'generation_input': {'claim_token': 'nested'}}})
    assert 'secret' not in json.dumps(message) and 'claim_token' not in json.dumps(message)


def test_recent_ideas_scope_revisions_and_exclusion(world):
    db, _ = world
    def save(content):
        data = send()
        claim = repo.claim_operation(W, S, M, data)
        return repo.complete_operation(W, S, M, data['operation_key'], claim['request']['structured_data']['operation']['claim_token'],
                                       {'type': 'text', 'response': content})['response']
    response = save('First concept')
    assert capture_recent_ideas(db, W, M) == ['First concept']
    assert capture_recent_ideas(db, OTHER, M) == []
    assert capture_recent_ideas(db, W, OTHER) == []
    assert capture_recent_ideas(db, W, M, response['id']) == []
    data = {'operation_key': str(uuid4()), 'action': 'regenerate', 'persona_id': P, 'source_message_id': response['id']}
    claim = repo.claim_operation(W, S, M, data)
    repo.complete_operation(W, S, M, data['operation_key'], claim['request']['structured_data']['operation']['claim_token'],
                            {'type': 'text', 'response': 'Replacement concept'})
    assert capture_recent_ideas(db, W, M) == ['Replacement concept']


def test_claim_rechecks_selection_after_preparation(world):
    db, _ = world
    data = send()
    prepared = runs.prepare_operation(W, S, M, data)
    db.sessions[S]['default_persona_id'] = OTHER
    with pytest.raises(ChatConflictError):
        repo.claim_operation(W, S, M, data, generation_input=prepared['generation_input'])
    assert not db.messages and not db.runs


def test_scale_semantics_and_saved_audience_reach_prompt(rows):
    from services.generation_context import resolve_generation_context
    rows[0]['tone']['professional'] = 2
    rows[1]['audience_profile']['common_questions'] = ['Which documents?']
    context = resolve_generation_context(W, persona_id=str(rows[1]['id']))
    prompt = build_prompt(context, 'Fixed policy')
    assert '1 is the left endpoint, 5 the right, 3 balanced' in prompt
    assert 'professional: Professional to Casual' in prompt
    assert 'Which documents?' in prompt and 'professional' in prompt


def test_recent_ideas_reach_generation_without_extra_provider_calls(world):
    from tests.test_step_j_operations import run
    first, first_provider = run(world, send(message='Explain documentation'))
    second, second_provider = run(world, send(message='Suggest another educational topic'))
    assert first['state'] == second['state'] == 'succeeded'
    assert first_provider.call_count == second_provider.call_count == 1
    kwargs = second_provider.call_args.kwargs
    assert 'Recent ideas from this creator' in json.dumps(kwargs['system'])
    assert 'Educational documentation guidance.' in json.dumps(kwargs['system'])


def test_failed_and_foreign_completed_ideas_are_excluded(world):
    from tests.test_step_j_operations import run
    db, _ = world
    saved, _ = run(world)
    source = db.messages[saved['response']['id']]
    for index, (workspace, member, state) in enumerate([(OTHER, M, 'succeeded'), (W, OTHER, 'succeeded'), (W, M, 'failed')]):
        sid, request_id, response_id = str(uuid4()), str(uuid4()), str(uuid4())
        db.sessions[sid] = {**deepcopy(db.sessions[S]), 'id': sid, 'workspace_id': workspace, 'created_by_member_id': member}
        request = deepcopy(db.messages[source['request_message_id']])
        request.update(id=request_id, session_id=sid)
        request['structured_data']['operation']['state'] = state
        response = deepcopy(source)
        response.update(id=response_id, session_id=sid, request_message_id=request_id)
        response['structured_data'].pop('original_request_id', None)
        response['structured_data']['payload']['response'] = f'Foreign or failed {index}'
        db.messages[request_id], db.messages[response_id] = request, response
    assert capture_recent_ideas(db, W, M) == ['Educational documentation guidance.']
