"""Two-model comparison beta. Both providers and the repository are mocked: no paid calls, no database."""
import json
import random
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

import app as api
from services import compare_http, model_compare
from services.generation import InvalidGenerationOutputError
from tests.test_step_g_routes import client  # noqa: F401  (fixture)

P = "33333333-3333-4333-8333-333333333333"
CID = "44444444-4444-4444-8444-444444444444"
ENV = {"LUCIE_COMPARE_BETA": "true", "COMPARE_MODEL_A": "anthropic:claude-sonnet-5-5",
       "COMPARE_MODEL_B": "openai:gpt-test", "OPENAI_API_KEY": "synthetic"}


def result(text, input_tokens=1000, output_tokens=200):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason="end_turn",
                           usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                                                 cache_creation_input_tokens=0, cache_read_input_tokens=0))


# ---------------------------------------------------------------- config

def test_disabled_by_default():
    assert model_compare.load_config({}).enabled is False
    assert model_compare.load_config({}).reason == "beta_disabled"


@pytest.mark.parametrize("change,reason", [
    ({"COMPARE_MODEL_B": ""}, "models_not_configured"),
    ({"COMPARE_MODEL_B": "bogus:model"}, "models_not_configured"),
    ({"COMPARE_MODEL_B": "anthropic:claude-sonnet-5-5"}, "models_identical"),
    ({"OPENAI_API_KEY": ""}, "openai_key_missing"),
])
def test_config_needs_two_distinct_models(change, reason):
    config = model_compare.load_config({**ENV, **change})
    assert (config.enabled, config.reason) == (False, reason)


def test_config_defaults_model_a_to_sonnet():
    config = model_compare.load_config({**ENV, "COMPARE_MODEL_A": ""})
    assert config.enabled
    assert config.candidates[0] == model_compare.Candidate("anthropic", "claude-sonnet-5-5")


def test_anthropic_only_pair_needs_no_openai_key():
    config = model_compare.load_config({"LUCIE_COMPARE_BETA": "1", "COMPARE_MODEL_B": "anthropic:claude-haiku-4-5"})
    assert config.enabled


# ---------------------------------------------------------------- cost

def test_cost_estimate_uses_price_table_and_cache_multipliers():
    prices = {"m": (2.0, 10.0)}
    usage = {"input_tokens": 1_000_000, "output_tokens": 100_000,
             "cache_creation_input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000}
    # 2.00 input + 1.00 output + 4.00 cache write (2x) + 0.20 cache read (0.1x)
    assert model_compare.estimate_cost("m", usage, prices) == pytest.approx(7.2)
    assert model_compare.estimate_cost("unknown", usage, prices) is None


def test_price_overrides_from_env():
    prices = model_compare.price_table({"COMPARE_PRICES": json.dumps({"gpt-test": [1.25, 10]})})
    assert prices["gpt-test"] == (1.25, 10.0)
    assert prices["claude-sonnet-5-5"] == (2.0, 10.0)
    assert model_compare.price_table({"COMPARE_PRICES": "not json"})["claude-sonnet-5-5"] == (2.0, 10.0)


# ---------------------------------------------------------------- provider adapters

def test_sonnet_5_5_never_gets_disabled_thinking():
    adapted = model_compare.adapt_anthropic_kwargs({"model": "claude-sonnet-5-5", "thinking": {"type": "disabled"}})
    assert adapted["thinking"] == {"type": "between_tools"}
    adapted = model_compare.adapt_anthropic_kwargs({"model": "claude-opus-5-5", "thinking": {"type": "disabled"}})
    assert "thinking" not in adapted and adapted["output_config"]["effort"] == "low"
    kept = {"model": "claude-haiku-4-5", "thinking": {"type": "disabled"}}
    assert model_compare.adapt_anthropic_kwargs(kept) == kept


def test_openai_request_translation():
    request = model_compare.openai_request({
        "system": [{"type": "text", "text": "Stable", "cache_control": {"type": "ephemeral"}},
                   {"type": "text", "text": "Clock"}],
        "messages": [{"role": "user", "content": "Write a post"}],
        "max_tokens": 10000, "thinking": {"type": "disabled"},
        "output_config": {"format": {"type": "json_schema", "schema": {"type": "object"}}},
    }, "gpt-test", "low")
    assert request["model"] == "gpt-test"
    assert request["messages"] == [{"role": "system", "content": "Stable\n\nClock"},
                                   {"role": "user", "content": "Write a post"}]
    assert request["max_completion_tokens"] == 10000
    assert request["response_format"]["json_schema"]["schema"] == {"type": "object"}
    assert request["reasoning_effort"] == "low"
    assert "thinking" not in request


def test_openai_result_maps_length_to_max_tokens():
    completion = SimpleNamespace(model="gpt-test", choices=[SimpleNamespace(
        message=SimpleNamespace(content="Hi"), finish_reason="length")],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5, prompt_tokens_details=None))
    wrapped = model_compare.openai_result(completion)
    assert wrapped.content[0].text == "Hi" and wrapped.stop_reason == "max_tokens"
    assert (wrapped.usage.input_tokens, wrapped.usage.output_tokens) == (10, 5)


@pytest.mark.parametrize("error,code", [
    (InvalidGenerationOutputError(), "invalid_provider_output"),
    (type("RateLimitError", (Exception,), {})(), "provider_rate_limited"),
    (type("AuthenticationError", (Exception,), {})(), "provider_unavailable"),
    (type("APIConnectionError", (Exception,), {})(), "provider_outcome_unknown"),
    (RuntimeError(), "generation_failed"),
    (type("RateLimitError", (Exception,), {"status_code": 429, "body": {"error": {"code": "insufficient_quota"}}})(),
     "provider_quota"),
    (type("NotFoundError", (Exception,), {"status_code": 404, "body": {}})(), "provider_model_unavailable"),
    (type("InternalServerError", (Exception,), {"status_code": 529})(), "provider_busy"),
])
def test_error_codes(error, code):
    assert model_compare.error_code(error) == code


def test_comparison_never_asks_clarifying_questions(monkeypatch):
    seen = []

    def fake_generate(message, context, invoke, **options):
        seen.append(options)
        return {"type": "text", "response": "Draft"}

    monkeypatch.setattr(model_compare, "generate_chat", fake_generate)
    config = model_compare.load_config(ENV)
    model_compare.run_comparison("give me a post about first time homebuyers", None, config,
                                 clients={"anthropic": None, "openai": None}, prices={})
    assert len(seen) == 2 and all(o["allow_clarification"] is False for o in seen)


def test_blind_view_names_failed_model_only():
    ok = model_compare.blind_view({"slot": "A", "response": {"type": "text"}, "model": "m1"})
    bad = model_compare.blind_view({"slot": "B", "error": "provider_quota", "model": "m2"})
    assert "failed_model" not in ok and bad["failed_model"] == "m2"


# ---------------------------------------------------------------- routes

@pytest.fixture
def beta(client, monkeypatch):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    calls = []

    def anthropic_create(candidate, **kwargs):
        calls.append(("anthropic", candidate.model, kwargs))
        return result("Claude educational answer.", 1000, 200)

    def openai_create(candidate, **kwargs):
        calls.append(("openai", candidate.model, kwargs))
        return result("GPT educational answer.", 900, 300)

    api.app.extensions["compare_clients"] = {"anthropic": anthropic_create, "openai": openai_create}
    repo = SimpleNamespace(create_comparison=Mock(return_value=CID), record_choice=Mock(),
                           comparison_summary=Mock(return_value=[]))
    monkeypatch.setattr(compare_http, "comparisons", repo)
    monkeypatch.setattr(model_compare, "random", random.Random(0))
    client.compare_calls, client.repo = calls, repo
    yield client
    api.app.extensions.pop("compare_clients", None)


def test_config_route_reports_disabled_without_model_names(client, monkeypatch):
    monkeypatch.delenv("LUCIE_COMPARE_BETA", raising=False)
    response = client.get("/api/compare/config", headers=client.headers())
    assert response.status_code == 200
    assert response.get_json() == {"enabled": False, "reason": "beta_disabled", "calls_per_comparison": 0}


def test_compare_rejected_when_beta_off(client, monkeypatch):
    monkeypatch.delenv("LUCIE_COMPARE_BETA", raising=False)
    response = client.post("/api/compare", headers=client.headers(), json={"message": "Hi", "persona_id": P})
    assert response.status_code == 404
    assert response.get_json()["error"] == "compare_beta_disabled"
    client.ai.messages.create.assert_not_called()


def test_viewer_cannot_compare(beta):
    beta.context["role"] = "viewer"
    response = beta.post("/api/compare", headers=beta.headers(), json={"message": "Hi", "persona_id": P})
    assert response.status_code == 403
    assert beta.compare_calls == []


def test_compare_calls_each_model_once_and_hides_names(beta):
    response = beta.post("/api/compare", headers=beta.headers(),
                         json={"message": "Explain what a pre-approval is", "persona_id": P})
    assert response.status_code == 200
    body = response.get_json()
    assert body["comparison_id"] == CID and body["saved"] is True
    assert sorted(call[0] for call in beta.compare_calls) == ["anthropic", "openai"]
    assert [c["slot"] for c in body["candidates"]] == ["A", "B"]
    texts = sorted(c["response"]["response"] for c in body["candidates"])
    assert texts[0].startswith("Claude educational answer.") and texts[1].startswith("GPT educational answer.")
    assert all("NMLS #123456" in text for text in texts)  # compliance enforced on both sides
    serialized = json.dumps(body["candidates"])
    assert "claude" not in serialized.lower().replace("claude educational", "")
    assert "gpt-test" not in serialized
    # Sonnet: (1000*2 + 200*10)/1e6 = 0.004. GPT has no configured price -> total unknown.
    assert body["estimated_cost_usd"] is None
    stored = beta.repo.create_comparison.call_args.args
    assert stored[3] == "Explain what a pre-approval is"
    assert {c["model"] for c in stored[4]} == {"claude-sonnet-5-5", "gpt-test"}
    sonnet = next(c for c in stored[4] if c["provider"] == "anthropic")
    assert sonnet["estimated_cost_usd"] == pytest.approx(0.004)
    assert sonnet["usage"] == {"input_tokens": 1000, "output_tokens": 200,
                               "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}


def test_total_cost_when_both_models_priced(beta, monkeypatch):
    monkeypatch.setenv("COMPARE_PRICES", json.dumps({"gpt-test": [1.0, 4.0]}))
    body = beta.post("/api/compare", headers=beta.headers(), json={"message": "Hi", "persona_id": P}).get_json()
    # Sonnet 0.004 + GPT (900*1 + 300*4)/1e6 = 0.0021
    assert body["estimated_cost_usd"] == pytest.approx(0.0061)


def test_one_failed_model_still_returns_the_other(beta):
    def broken(candidate, **kwargs):
        raise type("RateLimitError", (Exception,), {})()
    api.app.extensions["compare_clients"]["openai"] = broken
    response = beta.post("/api/compare", headers=beta.headers(), json={"message": "Hi", "persona_id": P})
    assert response.status_code == 200
    candidates = response.get_json()["candidates"]
    assert sorted("error" in c for c in candidates) == [False, True]
    assert next(c for c in candidates if "error" in c)["error"] == "provider_rate_limited"


def test_both_failed_is_502_and_still_logged(beta):
    def broken(candidate, **kwargs):
        raise RuntimeError("boom")
    api.app.extensions["compare_clients"] = {"anthropic": broken, "openai": broken}
    response = beta.post("/api/compare", headers=beta.headers(), json={"message": "Hi", "persona_id": P})
    assert response.status_code == 502
    assert response.get_json()["error"] == "comparison_failed"
    beta.repo.create_comparison.assert_called_once()


def test_unsaved_comparison_still_returns_outputs(beta):
    beta.repo.create_comparison.side_effect = RuntimeError("relation does not exist")
    response = beta.post("/api/compare", headers=beta.headers(), json={"message": "Hi", "persona_id": P})
    assert response.status_code == 200
    body = response.get_json()
    assert body["comparison_id"] is None and body["saved"] is False
    assert all("response" in c for c in body["candidates"])


def test_never_retries_a_failed_call(beta):
    attempts = []

    def broken(candidate, **kwargs):
        attempts.append(1)
        raise type("APIConnectionError", (Exception,), {})()
    api.app.extensions["compare_clients"]["anthropic"] = broken
    beta.post("/api/compare", headers=beta.headers(), json={"message": "Hi", "persona_id": P})
    assert len(attempts) == 1


@pytest.mark.parametrize("payload", [{}, {"message": ""}, {"message": "x" * 16001}])
def test_compare_validates_message(beta, payload):
    response = beta.post("/api/compare", headers=beta.headers(), json={**payload, "persona_id": P})
    assert response.status_code == 400
    assert beta.compare_calls == []


def test_choice_is_stored_and_reveals_models(beta):
    beta.repo.record_choice.return_value = {
        "id": CID, "chosen_slot": "B", "estimated_cost_usd": 0.0061,
        "candidates": [{"slot": "A", "provider": "anthropic", "model": "claude-sonnet-5-5", "response": {},
                        "usage": {}, "latency_ms": 5, "provider_calls": 1, "estimated_cost_usd": 0.004},
                       {"slot": "B", "provider": "openai", "model": "gpt-test", "response": {},
                        "usage": {}, "latency_ms": 6, "provider_calls": 1, "estimated_cost_usd": 0.0021}]}
    response = beta.post(f"/api/compare/{CID}/choice", headers=beta.headers(),
                         json={"choice": "B", "note": "  Warmer tone  "})
    assert response.status_code == 200
    body = response.get_json()
    assert body["choice"] == "B"
    assert [c["model"] for c in body["candidates"]] == ["claude-sonnet-5-5", "gpt-test"]
    assert "response" not in body["candidates"][0]
    args = beta.repo.record_choice.call_args.args
    assert args[1] == CID and args[3] == "B" and args[4] == "Warmer tone"


@pytest.mark.parametrize("payload", [{"choice": "C"}, {}, {"choice": "A", "note": 5},
                                     {"choice": "A", "note": "x" * 1001}])
def test_choice_validation(beta, payload):
    response = beta.post(f"/api/compare/{CID}/choice", headers=beta.headers(), json=payload)
    assert response.status_code == 400
    beta.repo.record_choice.assert_not_called()


def test_choice_for_unknown_comparison_is_404(beta):
    beta.repo.record_choice.return_value = None
    response = beta.post(f"/api/compare/{CID}/choice", headers=beta.headers(), json={"choice": "A"})
    assert response.status_code == 404


def test_summary_is_workspace_scoped(beta):
    beta.repo.comparison_summary.return_value = [{"model": "claude-sonnet-5-5", "wins": 3}]
    response = beta.get("/api/compare/summary", headers=beta.headers())
    assert response.status_code == 200
    assert response.get_json()["models"][0]["wins"] == 3
    assert beta.repo.comparison_summary.call_args.args[0] == beta.context["workspace_id"]


# ---------------------------------------------------------------- combine / refine

STORED = {
    "id": CID, "persona_id": P, "prompt": "Write a Facebook post about pre-approval",
    "feedback": {}, "merges": [], "chosen_slot": None, "estimated_cost_usd": 0.006,
    "candidates": [
        {"slot": "A", "provider": "anthropic", "model": "claude-sonnet-5-5", "usage": {}, "estimated_cost_usd": 0.004,
         "response": {"type": "text", "response": "DRAFT-A hook about knowing your numbers.", "compliance_flags": []}},
        {"slot": "B", "provider": "openai", "model": "gpt-test", "usage": {}, "estimated_cost_usd": 0.002,
         "response": {"type": "text", "response": "DRAFT-B friendly call to action.", "compliance_flags": []}},
    ],
}
FEEDBACK = {"A": {"aspects": ["Opening hook"], "note": "love the numbers angle"},
            "B": {"aspects": ["Call to action", "Tone and voice"]}}


@pytest.fixture
def stored(beta):
    import copy
    beta.repo.get_comparison = Mock(return_value=copy.deepcopy(STORED))
    beta.repo.append_merge = Mock(side_effect=lambda w, c, m, feedback, record, expected: {
        "chosen_slot": "merged", "estimated_cost_usd": 0.01, "merges": [record]})
    return beta


def test_combine_uses_both_drafts_and_what_was_liked(stored):
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(),
                           json={"feedback": FEEDBACK, "change": "Keep it under 80 words"})
    assert response.status_code == 200
    body = response.get_json()
    assert body["merge"]["round"] == 1 and body["merge"]["kind"] == "combine"
    assert body["merge"]["model"] == "claude-sonnet-5-5"  # merge model defaults to model A
    assert "NMLS #123456" in body["merge"]["response"]["response"]
    assert body["reveal"]["choice"] == "merged"
    assert {c["model"] for c in body["reveal"]["candidates"]} == {"claude-sonnet-5-5", "gpt-test"}
    assert body["rounds_left"] == model_compare.MAX_MERGE_ROUNDS - 1
    # Exactly one paid call, with both drafts and the feedback in the prompt.
    assert len(stored.compare_calls) == 1
    sent = stored.compare_calls[0][2]["messages"][-1]["content"]
    assert sent.startswith("Original request: Write a Facebook post")
    for expected in ("DRAFT-A", "DRAFT-B", "Opening hook", "love the numbers angle",
                     "Call to action, Tone and voice", "Keep it under 80 words"):
        assert expected in sent
    args = stored.repo.append_merge.call_args.args
    assert args[3] == {"A": {"aspects": ["Opening hook"], "note": "love the numbers angle"},
                       "B": {"aspects": ["Call to action", "Tone and voice"], "note": ""}}
    assert args[5] == 0  # optimistic check on the round count


def test_combine_never_asks_clarifying_questions(stored):
    stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK})
    labels = [call for call in stored.compare_calls]
    assert len(labels) == 1  # no separate clarification check call
    from services.generation_policy import AMBIGUOUS_SCOPE_PROMPT
    system = "".join(block["text"] for block in labels[0][2]["system"])
    assert AMBIGUOUS_SCOPE_PROMPT not in system


def test_combine_keeps_campaign_format(stored):
    stored.repo.get_comparison.return_value["candidates"][0]["response"] = {
        "type": "campaign", "campaign": {"content_calendar": []}, "compliance_flags": []}
    api.app.extensions["compare_clients"]["anthropic"] = lambda candidate, **kwargs: (
        stored.compare_calls.append(("anthropic", candidate.model, kwargs))
        or result(json.dumps({"content_calendar": [{"caption": "Combined"}], "platform_breakdown": []})))
    body = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK}).get_json()
    assert body["merge"]["response"]["type"] == "campaign"
    assert stored.compare_calls[0][2]["output_config"]["format"]["type"] == "json_schema"


def test_refine_rewrites_latest_combination(stored):
    stored.repo.get_comparison.return_value["feedback"] = {"A": {"aspects": ["Opening hook"], "note": ""}}
    stored.repo.get_comparison.return_value["merges"] = [
        {"round": 1, "response": {"type": "text", "response": "COMBINED-V1"}}]
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(),
                           json={"refine": True, "change": "Make the call to action softer"})
    assert response.status_code == 200
    assert response.get_json()["merge"]["kind"] == "refine"
    assert response.get_json()["merge"]["round"] == 2
    sent = stored.compare_calls[0][2]["messages"][-1]["content"]
    assert "COMBINED-V1" in sent and "Make the call to action softer" in sent and "Opening hook" in sent
    assert "DRAFT-A" not in sent
    assert stored.repo.append_merge.call_args.args[5] == 1


@pytest.mark.parametrize("payload,message", [
    ({}, "Pick at least one"),
    ({"refine": True, "change": "softer"}, "Combine the drafts before refining"),
    ({"feedback": {"C": {}}}, "feedback"),
    ({"feedback": {"A": {"aspects": ["x" * 61]}}}, "aspects"),
    ({"feedback": {"A": {"aspects": "hook"}}}, "aspects"),
    ({"feedback": FEEDBACK, "change": 5}, "change"),
    ({"feedback": FEEDBACK, "refine": "yes"}, "refine"),
])
def test_combine_validation_makes_no_call(stored, payload, message):
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json=payload)
    assert response.status_code == 400
    assert message in response.get_json()["message"]
    assert stored.compare_calls == []


def test_combine_round_limit(stored):
    stored.repo.get_comparison.return_value["merges"] = [{"round": i} for i in range(model_compare.MAX_MERGE_ROUNDS)]
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK})
    assert response.status_code == 400
    assert stored.compare_calls == []


def test_combine_unknown_comparison(stored):
    stored.repo.get_comparison.return_value = None
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK})
    assert response.status_code == 404


def test_viewer_cannot_combine(stored):
    stored.context["role"] = "viewer"
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK})
    assert response.status_code == 403
    assert stored.compare_calls == []


def test_failed_combine_is_502_once_and_recorded(stored):
    attempts = []

    def broken(candidate, **kwargs):
        attempts.append(1)
        raise type("RateLimitError", (Exception,), {})()
    api.app.extensions["compare_clients"]["anthropic"] = broken
    response = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK})
    assert response.status_code == 502
    assert response.get_json()["merge"]["error"] == "provider_rate_limited"
    assert attempts == [1]
    stored.repo.append_merge.assert_called_once()


def test_combine_output_survives_save_failure(stored):
    stored.repo.append_merge.side_effect = RuntimeError("db down")
    body = stored.post(f"/api/compare/{CID}/combine", headers=stored.headers(), json={"feedback": FEEDBACK}).get_json()
    assert body["saved"] is False and "response" in body["merge"]


def test_merge_model_can_be_configured(monkeypatch):
    config = model_compare.load_config({**ENV, "COMPARE_MERGE_MODEL": "openai:gpt-test"})
    assert config.merge_model == model_compare.Candidate("openai", "gpt-test")
    assert model_compare.load_config(ENV).merge_model == model_compare.Candidate("anthropic", "claude-sonnet-5-5")


def test_clean_feedback_dedupes_and_drops_empty():
    cleaned = model_compare.clean_feedback({"A": {"aspects": [" Hook ", "Hook"], "note": " "}, "B": {"aspects": []}})
    assert cleaned == {"A": {"aspects": ["Hook"], "note": ""}}


# ---------------------------------------------------------------- reopening a saved comparison

def test_detail_returns_the_whole_record_for_saved_history(stored, monkeypatch):
    import datetime
    from decimal import Decimal
    monkeypatch.delenv("LUCIE_COMPARE_BETA")  # history stays readable after the beta is switched off
    record = dict(STORED, feedback={"A": {"aspects": ["Opening hook"], "note": ""}}, chosen_slot="merged",
                  estimated_cost_usd=Decimal("0.0123"), created_at=datetime.datetime(2026, 11, 22, tzinfo=datetime.timezone.utc),
                  merges=[{"round": 1, "kind": "combine", "response": {"type": "text", "response": "COMBINED"}}])
    stored.repo.get_comparison.return_value = record
    body = stored.get(f"/api/compare/{CID}", headers=stored.headers()).get_json()["comparison"]
    assert body["prompt"] == STORED["prompt"] and body["chosen_slot"] == "merged"
    assert body["estimated_cost_usd"] == pytest.approx(0.0123)
    assert [c["model"] for c in body["candidates"]] == ["claude-sonnet-5-5", "gpt-test"]
    assert body["candidates"][0]["response"]["response"].startswith("DRAFT-A")
    assert body["feedback"]["A"]["aspects"] == ["Opening hook"]
    assert body["merges"][0]["response"]["response"] == "COMBINED"
    assert stored.repo.get_comparison.call_args.args == (stored.context["workspace_id"], CID)


def test_detail_unknown_comparison_is_404(stored):
    stored.repo.get_comparison.return_value = None
    assert stored.get(f"/api/compare/{CID}", headers=stored.headers()).status_code == 404


# ---------------------------------------------------------------- questions envelope safeguard

QUESTIONS_JSON = ('{"questions":[{"question":"Which platform is this first-time homebuyer post for?","type":"single",'
                  '"options":["LinkedIn","Instagram","Facebook","TikTok"],"allow_custom":false},'
                  '{"question":"Which content format would you like?","type":"single",'
                  '"options":["Text-only post","Single image","Multi Image Carousel","Short video / Reel"],'
                  '"allow_custom":false}]}')
POSTS_JSON = ('{"intro":"","posts":[{"title":"First home","platform":"Instagram","format":"single-image",'
              '"script":{"hook":"Ready to buy?","body":["Know your numbers."],"cta":"Message me."},"hashtags":[]}]}')


def _generation_context():
    from services.generation_context import BrandContext, GenerationContext, LicenseIdentity, PersonaContext
    brand = BrandContext("Lucie Lending", "", (), (), (), (), "", "", "")
    persona = PersonaContext("p", "w", "first-time", "First-Time Buyer", "", "", "", True)
    return GenerationContext("w", LicenseIdentity("Jane Doe", "123", "456"), brand, persona)


def _generate(replies):
    from services.generation import generate_chat
    calls = []

    def invoke(label, **kwargs):
        calls.append((label, kwargs))
        return result(replies[len(calls) - 1])

    try:
        return generate_chat("give me a post about first time homebuyers", _generation_context(), invoke,
                             model="m", allow_clarification=False), calls
    except InvalidGenerationOutputError:
        return None, calls


def test_no_clarification_prompt_is_sent_to_the_model():
    response, calls = _generate([POSTS_JSON])
    assert response["type"] == "posts" and len(calls) == 1
    assert "DO NOT ASK QUESTIONS" in model_compare._text_of(calls[0][1]["system"])


def test_questions_envelope_triggers_one_retry_that_produces_a_draft():
    response, calls = _generate([QUESTIONS_JSON, POSTS_JSON])
    assert response["type"] == "posts"
    assert [c[0] for c in calls] == ["chat_non_campaign", "chat_no_questions_retry"]


def test_questions_twice_fails_cleanly_instead_of_showing_raw_json():
    response, calls = _generate([QUESTIONS_JSON, QUESTIONS_JSON])
    assert response is None and len(calls) == 2
    outcome = model_compare._run_one(
        model_compare.Candidate("anthropic", "m"), lambda c, **k: result(QUESTIONS_JSON), "give me a post",
        _generation_context(), None, {}, allow_clarification=False)
    assert outcome["error"] == "invalid_provider_output" and "response" not in outcome


# ---------------------------------------------------------------- questions before drafts

def test_questions_route_returns_the_card_before_any_drafts(beta):
    beta.ai = None
    api.app.extensions["compare_clients"]["anthropic"] = lambda candidate, **kwargs: result(QUESTIONS_JSON)
    response = beta.post("/api/compare/questions", headers=beta.headers(),
                         json={"message": "give me a post about first time homebuyers", "persona_id": P})
    assert response.status_code == 200
    questions = response.get_json()["clarification"]["questions"]
    assert [q["question"] for q in questions][0].startswith("Which platform")
    assert beta.compare_calls == []  # no draft was generated by either model
    beta.repo.create_comparison.assert_not_called()


def test_questions_route_returns_null_when_nothing_is_needed(beta):
    api.app.extensions["compare_clients"]["anthropic"] = lambda candidate, **kwargs: result('{"questions": []}')
    response = beta.post("/api/compare/questions", headers=beta.headers(),
                         json={"message": "Instagram single image post about first time buyers", "persona_id": P})
    assert response.get_json() == {"clarification": None}


def test_questions_check_skipped_once_answers_are_included(beta):
    response = beta.post("/api/compare/questions", headers=beta.headers(), json={
        "message": "Original request: a post\n\nAnswers:\n- Platform: Instagram", "persona_id": P})
    assert response.get_json() == {"clarification": None} and beta.compare_calls == []


def test_failed_questions_check_never_blocks_comparing(beta):
    def broken(candidate, **kwargs):
        raise RuntimeError("down")
    api.app.extensions["compare_clients"]["anthropic"] = broken
    response = beta.post("/api/compare/questions", headers=beta.headers(), json={"message": "a post", "persona_id": P})
    assert response.status_code == 200 and response.get_json() == {"clarification": None}
