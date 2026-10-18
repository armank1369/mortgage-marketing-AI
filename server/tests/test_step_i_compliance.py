"""Focused regressions for independent review issues 1 and 2; no live services."""
from copy import deepcopy

import pytest
import app as api
from services.generation_context import resolve_generation_context
from services.prompt_builder import build_footer
from tests.test_step_i_context import rows, W, P
from tests.test_step_i_routes import client, configured, output


@pytest.fixture
def context(rows):
    rows[0]['compliance_footer'] = 'Supplemental disclosure.'
    return resolve_generation_context(W, persona_id=P)


@pytest.mark.parametrize('kind', ['text', 'posts', 'video', 'campaign'])
def test_review_flags_are_separate_and_disclosure_is_last(context, kind):
    text = 'A guaranteed result for young professionals.'
    footer = build_footer(context)
    if kind == 'text':
        result, flags = api.enforce_compliance(text, context)
        copy = result
    elif kind == 'posts':
        result, flags = api.enforce_posts_compliance({'posts': [{'script': {'hook': text, 'body': 'Details', 'cta': 'Learn more'}}]}, context)
        copy = result['posts'][0]['script']['cta']
    elif kind == 'video':
        result, flags = api.enforce_video_brief_compliance({'script': {'intro': {'text': text}, 'cta': {'text': 'Learn more', 'time': '16–20s'}}}, context)
        copy = result['script']['cta']['text']
        assert result['script']['cta']['time'] == '16–20s'
    else:
        result, flags = api.enforce_campaign_compliance({'content_calendar': [{'caption': text, 'slides': [], 'hashtags': []}]}, context)
        copy = result['content_calendar'][0]['caption']
    assert 'possible_fair_housing_language' in flags
    assert 'forbidden_word_used' in flags
    assert 'Compliance note' not in str(result)
    assert copy.endswith(f'[END CARD: {footer}]' if kind == 'video' else footer)


@pytest.mark.parametrize('marker', ['Compliance note:', '⚠️ Compliance note (auto-flagged, human review required):', '**Compliance note**:'])
def test_model_inserted_notes_are_removed_without_changing_approved_footer(context, marker):
    footer = build_footer(context)
    result, flags = api.enforce_compliance(f'Educational copy.\n\n{footer}\n\n{marker} HUMAN_REVIEW_ONLY\nContinuation of advisory.', context)
    assert 'embedded_compliance_note_removed' in flags
    assert 'HUMAN_REVIEW_ONLY' not in result and 'Continuation of advisory' not in result
    assert result.endswith(footer) and result.count(footer) == 1


def test_footer_already_in_middle_moves_to_end_without_losing_publication_text(context):
    footer = build_footer(context)
    result, flags = api.enforce_compliance(f'Education.\n\n{footer}\n\nContact us to learn more.', context)
    assert result.endswith(footer) and result.count(footer) == 1
    assert 'Contact us to learn more.' in result
    assert 'missing_or_altered_footer' in flags
    again, _ = api.enforce_compliance(result, context)
    assert again == result


@pytest.mark.parametrize('field,value,flag', [
    ('slides', ['Education', 'A safe neighborhood for young families'], 'possible_fair_housing_language'),
    ('slides', ['Education', 'An amazing result'], 'forbidden_word_used'),
    ('hashtags', ['#YoungProfessionals'], 'possible_fair_housing_language'),
    ('hashtags', ['#GuaranteedApproval'], 'forbidden_word_used'),
])
def test_campaign_checks_slides_and_hashtags_when_caption_is_clean(context, field, value, flag):
    entry = {'caption': 'Mortgage process education.', 'slides': ['First', 'Last'], 'hashtags': ['#Education'], 'format': 'carousel'}
    entry[field] = value
    result, flags = api.enforce_campaign_compliance({'content_calendar': [entry]}, context)
    assert flag in flags
    fixed = result['content_calendar'][0]
    assert fixed['caption'].endswith(build_footer(context))
    assert fixed['slides'][-1].endswith(build_footer(context))
    assert 'Compliance note' not in str(fixed)


@pytest.mark.parametrize('field,value', [
    ('caption', 'Our current rate is a special rate.'),
    ('slides', ['Education', 'A promotional rate just for you.']),
    ('hashtags', ['#Special_Rate']),
    ('hashtags', ['#PromotionalRate']),
])
def test_restricted_offer_in_any_campaign_field_withholds_publication_packet(context, field, value):
    entry = {'caption': 'Education.', 'slides': ['Cover', 'Details', 'Close'], 'hashtags': ['#Education'],
             'day': 'Monday', 'date': '2026-10-19', 'platform': 'Instagram', 'format': 'carousel', 'time': '12:00', 'category': 'Education'}
    entry[field] = value
    metadata = {key: entry[key] for key in ['day', 'date', 'platform', 'format', 'time', 'category']}
    unaffected = {'caption': 'An unrelated educational draft.', 'slides': [], 'hashtags': ['#Education']}
    result, flags = api.enforce_campaign_compliance({'content_calendar': [entry, unaffected], 'platform_breakdown': []}, context)
    assert 'restricted_pricing_offer_removed' in flags
    fixed, clean = result['content_calendar']
    assert api.RESTRICTED_PRICING_FALLBACK in fixed['caption']
    assert len(fixed['slides']) == 1 and fixed['slides'][-1].endswith(build_footer(context))
    assert fixed['hashtags'] == []
    assert {key: fixed[key] for key in metadata} == metadata
    assert clean['caption'].startswith('An unrelated educational draft.')
    assert clean['hashtags'] == ['#Education']
    assert 'platform_breakdown' in result


def test_campaign_notes_removed_from_every_published_field_and_final_slide_is_not_duplicated(context):
    entry = {'caption': 'Education.\n\nCompliance note: REVIEW_CAPTION',
             'slides': ['Cover', 'Close.\n\nCompliance note: REVIEW_SLIDE'],
             'hashtags': ['#Education', 'Compliance note: REVIEW_TAG']}
    result, flags = api.enforce_campaign_compliance({'content_calendar': [entry]}, context)
    assert 'embedded_compliance_note_removed' in flags
    assert 'REVIEW_' not in str(result)
    fixed = result['content_calendar'][0]
    assert fixed['caption'].endswith(build_footer(context))
    assert fixed['slides'][-1].count(build_footer(context)) == 1
    again, _ = api.enforce_campaign_compliance(deepcopy(result), context)
    assert again == result


def test_post_carousel_final_slide_and_cta_keep_disclosure_but_no_notes(context):
    result, flags = api.enforce_posts_compliance({'intro': 'Editorial context', 'posts': [{
        'format': 'carousel', 'script': {'hook': 'Education', 'body': ['First', 'Last.\n\nCompliance note: REVIEW_ONLY'], 'cta': 'Learn more'}}]}, context)
    script = result['posts'][0]['script']
    assert script['body'][-1].endswith(build_footer(context))
    assert script['cta'].endswith(build_footer(context))
    assert 'REVIEW_ONLY' not in str(script)
    assert 'embedded_compliance_note_removed' in flags


def test_referral_advisory_is_flag_metadata_not_copy(context):
    result, flags = api.enforce_compliance('An educational partner spotlight.', context)
    assert 'possible_respa_review' in flags
    assert 'Compliance note' not in result
    assert result.endswith(build_footer(context))


def test_real_campaign_route_returns_slide_flags_and_keeps_json_contract(client, configured):
    campaign = {'content_calendar': [{'caption': 'Educational copy', 'slides': ['Cover', 'For young professionals'],
        'hashtags': ['#Education'], 'format': 'carousel'}], 'platform_breakdown': []}
    output(client, campaign)
    response = client.post('/api/chat', headers=client.headers(), json={
        'message': 'Original request: create a campaign', 'persona_id': P})
    assert response.status_code == 200 and response.json['type'] == 'campaign'
    assert 'possible_fair_housing_language' in response.json['compliance_flags']
    assert 'Compliance note' not in str(response.json['campaign'])
    assert response.json['campaign']['content_calendar'][0]['slides'][-1].endswith('Equal Housing Opportunity')
    client.ai.messages.create.assert_called_once()
