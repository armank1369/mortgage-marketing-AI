"""Regression tests for raw clarification-questions JSON shown as an "AI Response".

Incident: the model answered with the questions JSON but dropped the final closing brace and the app
appended the compliance signature. The strict parser failed and the raw JSON was saved as plain text.
Synthetic data and a mocked provider only.
"""
import json
import pytest

from services import generation
from services import generation_policy as policy
from services.generation import InvalidGenerationOutputError

QUESTIONS = [
    {"question": "Which platform is this video script for?", "type": "single",
     "options": ["Instagram", "TikTok", "Facebook", "LinkedIn"], "allow_custom": False},
    {"question": 'Which angle on "buying good homes" fits best?', "type": "single",
     "options": ["Overview", "Sound financial choice"], "allow_custom": True},
]
SIGNATURE = "Joseph W. Kim | NMLS #684894 | DRE #02190229 | Equal Housing Opportunity"
FULL = json.dumps({"questions": QUESTIONS})

# Each shape must still produce the same two questions.
SHAPES = {
    "strict": FULL,
    "missing_final_brace": FULL[:-1],
    "missing_brace_plus_signature": FULL[:-1] + "\n\n" + SIGNATURE,
    "trailing_signature": FULL + "\n\n" + SIGNATURE,
    "leading_prose": "Before I write this, a few quick questions:\n\n" + FULL,
    "bare_list": json.dumps(QUESTIONS),
    "bare_list_with_signature": json.dumps(QUESTIONS) + "\n\n" + SIGNATURE,
    "fenced": "```json\n" + FULL + "\n```",
    "truncated_inside_array": FULL[:-2],
}


@pytest.mark.parametrize("shape", sorted(SHAPES))
def test_clarification_parsed_in_every_shape(shape):
    parsed = policy._parse_clarification(SHAPES[shape])
    assert parsed and len(parsed["questions"]) == 2
    assert parsed["questions"][1]["question"] == QUESTIONS[1]["question"]


def test_prose_and_posts_are_not_mistaken_for_questions():
    assert policy._parse_clarification("Here is a caption. What do you think?") is None
    assert policy._parse_clarification(json.dumps({"intro": "x", "posts": []})) is None
    assert not policy.looks_like_questions_payload("Here is a caption about asking good questions.")


def _run(raw, **kw):
    from tests.test_model_compare import _generation_context, result

    def invoke(label, **kwargs):
        return result(raw)

    return generation.generate_chat("Write a video script for new homebuyers", _generation_context(), invoke,
                                    model="m", **kw)


@pytest.mark.parametrize("shape", sorted(SHAPES))
def test_chat_returns_a_question_card_for_every_shape(shape):
    out = _run(SHAPES[shape])
    assert out["type"] == "clarification"
    assert len(out["clarification"]["questions"]) == 2


@pytest.mark.parametrize("shape", sorted(SHAPES))
def test_regenerate_without_questions_never_shows_raw_json(shape):
    # allow_clarification=False is the path used when a caller cannot render a question form.
    with pytest.raises(InvalidGenerationOutputError):
        _run(SHAPES[shape], allow_clarification=False)


def test_unparseable_questions_fragment_fails_instead_of_saving_raw_json():
    garbled = '{"questions": [{"question": "Which platform?", "type": "sin'
    with pytest.raises(InvalidGenerationOutputError):
        _run(garbled)
