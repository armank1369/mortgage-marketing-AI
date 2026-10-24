"""Regression tests for the "Saved clarification:" incident (Step J.5 history contamination).

Incident: in a chat that already held an unanswered clarification, a new simple request returned
the model's imitation of the internal history text ("Saved clarification: question: ... options: ...")
as an ordinary successful AI Response. Two mechanisms:
  A. history projection rendered earlier clarifications in a layout the model could copy;
  B. malformed clarification-like output fell through to the plain-text fallback and was saved.

Synthetic data and a mocked provider only: no database, network or paid calls. The tests drive the real
projection, generation, parsing and operation code through the existing in-memory `world` harness.
"""
from copy import deepcopy
from unittest.mock import Mock
from uuid import uuid4

import pytest

from services.conversation_context import project_artifact
from tests.test_step_j_operations import world, run, result, fixture
from tests.test_step_j_repository import send, P, M, OTHER
from tests.test_step_i_context import rows  # fixture required by `world`

INCIDENT_MESSAGE = "Give me a post idea for a first-time homebuyer tip"
CAMPAIGN_MESSAGE = "Create a content strategy and 2-week social media calendar for my mortgage brand"

CAMPAIGN_CLARIFICATION = {"questions": [
    {"question": "Which platforms should the calendar cover?", "type": "multiple", "allow_custom": True,
     "options": ["Instagram", "LinkedIn", "Facebook"]},
    {"question": "How often do you want to post?", "type": "single", "allow_custom": False,
     "options": ["3 times a week", "5 times a week"]},
]}

# The exact shape observed in the incident (provider output, not stored history).
MALFORMED_CLARIFICATION = (
    "Saved clarification:\n"
    "question: Which platform is this post for?\n"
    'options: ["LinkedIn", "Instagram", "Facebook", "TikTok"]\n'
    "type: single\nallow_custom: false\n"
    "question: What format do you want for this post?\n"
    'options: ["Text-only post", "Single image", "Multi Image Carousel", "Short video / Reel"]\n'
    "type: single\nallow_custom: false\n"
    "question: Any specific first-time homebuyer tip or angle you want covered?\n"
    'options: ["Pre-approval process", "Down payment basics"]\n'
    "type: multiple\nallow_custom: true"
)

# Lines the model must never be shown as if they were a reply layout.
STRUCTURE_PREFIXES = ("question:", "options:", "type:", "allow_custom:")


def assistants(db):
    return [row for row in db.messages.values() if row["role"] == "assistant"]


def build_incident_chat(world):
    """Completed clarification exchange, then an unanswered campaign clarification (the incident's chat)."""
    db, _ = world
    db.members[OTHER] = dict(db.members[M], id=OTHER)
    asked, _ = run(world, send(message=INCIDENT_MESSAGE), Mock(return_value=result(
        {"questions": [{"question": "Which platform?", "type": "single", "options": ["Instagram", "LinkedIn"]}]})))
    assert asked["response"]["structured_data"]["type"] == "clarification"
    answered, _ = run(world, dict(operation_key=str(uuid4()), action="clarify", persona_id=P,
                                  source_message_id=asked["response"]["id"],
                                  answers=[dict(question_index=0, selected=["LinkedIn"], custom="")]),
                      Mock(return_value=result(fixture("posts")["posts"])))
    assert answered["state"] == "succeeded" and answered["response"]["structured_data"]["type"] == "posts"
    open_question, _ = run(world, send(message=CAMPAIGN_MESSAGE), Mock(return_value=result(CAMPAIGN_CLARIFICATION)))
    assert open_question["response"]["structured_data"]["type"] == "clarification"


MEMBERS = pytest.mark.parametrize("member", [M, OTHER], ids=["same-user", "other-workspace-member"])


# ---- Mechanism A: what the model is shown as history -------------------------------------------------

@MEMBERS
def test_unanswered_clarification_reaches_the_model_as_context_not_as_a_reply_layout(world, member):
    build_incident_chat(world)
    db, _ = world
    stored_before = deepcopy(db.messages)

    _, provider = run(world, send(message=INCIDENT_MESSAGE), Mock(return_value=result("A short educational answer.")),
                      member_id=member)
    messages = provider.call_args.kwargs["messages"]

    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant", "user"]
    assert messages[-1]["content"] == INCIDENT_MESSAGE  # the current request stays the authoritative task
    assert "Original request: " + INCIDENT_MESSAGE in messages[0]["content"] and "LinkedIn" in messages[0]["content"]
    assert messages[1]["content"].startswith("Saved posts:")  # completed work is still replayed (unchanged)

    open_questions = messages[3]["content"]
    assert not open_questions.startswith("Saved")
    assert not any(line.strip().lower().startswith(STRUCTURE_PREFIXES) for line in open_questions.splitlines())
    for question in CAMPAIGN_CLARIFICATION["questions"]:  # what was asked is preserved
        assert question["question"] in open_questions
        assert all(option in open_questions for option in question["options"])
    assert "not been answered" in open_questions  # provenance: it is history, and still open
    assert "not an output format" in open_questions.lower() or "not a format" in open_questions.lower()

    # The patch changes only what is sent to the model: saved rows are never rewritten.
    for message_id, row in stored_before.items():
        assert db.messages[message_id] == row


def test_clarification_projection_is_deterministic_and_keeps_the_other_artifact_formats():
    envelope = {"type": "clarification", "payload": {"clarification": CAMPAIGN_CLARIFICATION}}
    assert project_artifact(envelope) == project_artifact(deepcopy(envelope))
    for kind in ("posts", "campaign"):  # existing contracts relied on by Step J.5 tests
        assert project_artifact({"type": kind, "payload": {kind: {}}}).startswith(f"Saved {kind}:")


@MEMBERS
def test_do_not_imitate_instruction_accompanies_replayed_history(world, member):
    build_incident_chat(world)
    _, provider = run(world, send(message=INCIDENT_MESSAGE), Mock(return_value=result("Answer.")), member_id=member)
    system = str(provider.call_args.kwargs["system"])
    assert "not an output format" in system and "Never begin a reply with" in system


def test_no_instruction_when_there_is_no_history(world):
    _, provider = run(world, send(message="Explain the document checklist."))
    assert provider.call_args.kwargs["messages"] == [{"role": "user", "content": "Explain the document checklist."}]
    assert "not an output format" not in str(provider.call_args.kwargs["system"])


# ---- Mechanism B: malformed output must not become a successful reply ---------------------------------

@MEMBERS
@pytest.mark.parametrize("malformed", [
    MALFORMED_CLARIFICATION,
    MALFORMED_CLARIFICATION.removeprefix("Saved clarification:\n"),  # same layout, no label
    "Saved posts:\ntitle: Rate myths\nplatform: Instagram\nformat: Text\nhook: Think you need 20% down?",
    "  \nSAVED CLARIFICATION:\nquestion: Which platform?\noptions: [\"Instagram\"]",
], ids=["incident", "unlabelled-layout", "saved-posts-label", "case-and-whitespace"])
def test_malformed_history_style_output_fails_safely_and_is_not_saved(world, member, malformed):
    build_incident_chat(world)
    db, _ = world
    assistants_before = len(assistants(db))

    saved, provider = run(world, send(message=INCIDENT_MESSAGE), Mock(return_value=result(malformed)), member_id=member)

    assert saved["state"] == "failed" and saved["safe_error_code"] == "invalid_provider_output"
    assert provider.call_count == 1  # no automatic second paid request
    assert len(assistants(db)) == assistants_before  # nothing was saved as an AI answer
    assert not any("Saved clarification" in str(row) for row in assistants(db))


def test_malformed_campaign_output_also_fails_safely(world):
    db, _ = world
    provider = Mock(side_effect=[result({"proceed": True}), result("Saved campaign:\ntitle: Spring plan\ngoal: Leads")])
    saved, provider = run(world, send(message=CAMPAIGN_MESSAGE), provider)
    assert saved["state"] == "failed" and saved["safe_error_code"] == "invalid_provider_output"
    assert provider.call_count == 2 and not assistants(db)


# ---- Valid output keeps working ------------------------------------------------------------------------

@MEMBERS
def test_valid_clarification_json_still_becomes_interactive_cards(world, member):
    build_incident_chat(world)
    raw = {"questions": [
        {"question": "Which platform is this post for?", "type": "single", "allow_custom": False,
         "options": ["LinkedIn", "Instagram"]},
        {"question": "Any specific angle?", "type": "multiple", "allow_custom": True,
         "options": ["Pre-approval process", "Down payment basics"]}]}
    saved, _ = run(world, send(message=INCIDENT_MESSAGE), Mock(return_value=result(raw)), member_id=member)
    data = saved["response"]["structured_data"]
    assert saved["state"] == "succeeded" and data["type"] == "clarification"
    assert data["payload"]["clarification"]["questions"] == raw["questions"]  # text, options, type, custom all kept


@pytest.mark.parametrize("reply", [
    "A rate lock holds your quoted rate for a set period while your loan is processed.",
    # Legitimate explanation that mentions the same terms must not be rejected.
    'Stored summaries in this tool are labelled "Saved clarification:" and list each question with its options '
    "so earlier turns can be understood. They are internal context, not something to send to clients.",
    "Here is an example of how a question and its options might be recorded:\nquestion: Which platform?\n"
    'options: ["Instagram", "LinkedIn"]\nIt is only an illustration.',
], ids=["plain-answer", "mentions-label-mid-text", "prose-then-example"])
def test_legitimate_plain_text_answers_still_succeed(world, reply):
    saved, _ = run(world, send(message="Explain what a rate lock is."), Mock(return_value=result(reply)))
    assert saved["state"] == "succeeded" and saved["response"]["structured_data"]["type"] == "text"
    assert reply.split("\n")[0] in saved["response"]["structured_data"]["payload"]["response"]


@MEMBERS
def test_valid_carousel_posts_keep_structure_and_compliance(world, member):
    build_incident_chat(world)
    saved, _ = run(world, send(message=INCIDENT_MESSAGE), Mock(return_value=result(fixture("posts")["posts"])),
                   member_id=member)
    data = saved["response"]["structured_data"]
    post = data["payload"]["posts"]["posts"][0]
    assert saved["state"] == "succeeded" and data["type"] == "posts"
    assert post["format"] == "carousel" and len(post["script"]["body"]) >= 2
    assert "Equal Housing Opportunity" in post["script"]["body"][-1] and "Equal Housing Opportunity" in post["script"]["cta"]
