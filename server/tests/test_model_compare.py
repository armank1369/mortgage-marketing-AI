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
])
def test_error_codes(error, code):
    assert model_compare.error_code(error) == code


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
