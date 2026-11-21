"""Beta: send one chat prompt to two models and let the broker pick the better reply.

Off unless LUCIE_COMPARE_BETA is truthy and both candidate models are configured.
Each comparison makes two paid generation passes (one per model), never retries
either, and records token usage plus an estimated cost for each side.
"""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import json
import logging
import os
import random
from time import perf_counter
from types import SimpleNamespace

import anthropic

from services.generation import generate_chat, InvalidGenerationOutputError

logger = logging.getLogger(__name__)

PROVIDERS = ("anthropic", "openai")
CHOICES = ("A", "B", "tie", "neither")
DEFAULT_MODEL_A = "anthropic:claude-sonnet-5-5"

# USD per million tokens (input, output), Anthropic first-party list prices.
# Override or extend with COMPARE_PRICES='{"model-id": [input, output]}'.
DEFAULT_PRICES = {
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-5-5": (4.00, 20.00),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-haiku-4-5": (1.00, 5.00),
}
# Thinking cannot be set to "disabled" on these models (the API returns 400).
_BETWEEN_TOOLS_MODELS = ("claude-sonnet-5-5",)
_ADAPTIVE_ONLY_MODELS = ("claude-opus-5-5",)


def _truthy(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Candidate:
    provider: str
    model: str

    @property
    def label(self):
        return f"{self.provider}:{self.model}"


def parse_candidate(value):
    provider, _, model = (value or "").strip().partition(":")
    provider, model = provider.strip().lower(), model.strip()
    if provider not in PROVIDERS or not model or len(model) > 200:
        return None
    return Candidate(provider, model)


@dataclass(frozen=True)
class CompareConfig:
    enabled: bool
    reason: str
    candidates: tuple


def load_config(environ=None):
    env = os.environ if environ is None else environ
    if not _truthy(env.get("LUCIE_COMPARE_BETA")):
        return CompareConfig(False, "beta_disabled", ())
    a = parse_candidate(env.get("COMPARE_MODEL_A") or DEFAULT_MODEL_A)
    b = parse_candidate(env.get("COMPARE_MODEL_B"))
    if not a or not b:
        return CompareConfig(False, "models_not_configured", ())
    if a == b:
        return CompareConfig(False, "models_identical", ())
    if any(c.provider == "openai" for c in (a, b)) and not env.get("OPENAI_API_KEY"):
        return CompareConfig(False, "openai_key_missing", ())
    return CompareConfig(True, "", (a, b))


def price_table(environ=None):
    env = os.environ if environ is None else environ
    prices = dict(DEFAULT_PRICES)
    raw = env.get("COMPARE_PRICES")
    if raw:
        try:
            for model, pair in json.loads(raw).items():
                if (isinstance(model, str) and isinstance(pair, (list, tuple)) and len(pair) == 2
                        and all(isinstance(p, (int, float)) and p >= 0 for p in pair)):
                    prices[model] = (float(pair[0]), float(pair[1]))
        except (ValueError, AttributeError):
            logger.warning("COMPARE_PRICES is not valid JSON; using default prices.")
    return prices


def estimate_cost(model, usage, prices):
    """Estimated USD for one candidate, or None when the model has no configured price.

    Anthropic cache writes are billed at 2x input (1h TTL) and reads at 0.1x input.
    OpenAI cached input is reported inside input_tokens, so it is priced as plain input.
    """
    price = prices.get(model)
    if price is None:
        return None
    input_price, output_price = price
    total = (usage.get("input_tokens", 0) * input_price
             + usage.get("cache_creation_input_tokens", 0) * input_price * 2
             + usage.get("cache_read_input_tokens", 0) * input_price * 0.1
             + usage.get("output_tokens", 0) * output_price) / 1_000_000
    return round(total, 6)


def _add_usage(totals, usage):
    for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"):
        value = getattr(usage, key, None) if usage is not None else None
        if type(value) is int and value >= 0:
            totals[key] = totals.get(key, 0) + value


# ---------------------------------------------------------------- providers

def adapt_anthropic_kwargs(kwargs):
    """generate_chat sends thinking disabled; newer models reject that value."""
    model = kwargs.get("model", "")
    adapted = dict(kwargs)
    if adapted.get("thinking") == {"type": "disabled"}:
        if model.startswith(_BETWEEN_TOOLS_MODELS):
            adapted["thinking"] = {"type": "between_tools"}
        elif model.startswith(_ADAPTIVE_ONLY_MODELS):
            adapted.pop("thinking")
            adapted["output_config"] = {**adapted.get("output_config", {}), "effort": "low"}
    return adapted


def _text_of(content):
    if isinstance(content, str):
        return content
    return "\n\n".join(block.get("text", "") for block in content or ()
                       if isinstance(block, dict) and block.get("type") == "text")


def openai_request(kwargs, model, reasoning_effort=None):
    """Translate generate_chat's Anthropic-style request into Chat Completions params."""
    system = kwargs.get("system")
    system_text = system if isinstance(system, str) else _text_of(system)
    messages = [{"role": "system", "content": system_text}] if system_text else []
    for message in kwargs.get("messages", ()):
        messages.append({"role": message["role"], "content": _text_of(message.get("content"))})
    request = {"model": model, "messages": messages,
               "max_completion_tokens": kwargs.get("max_tokens", 4096)}
    schema = (kwargs.get("output_config") or {}).get("format", {})
    if schema.get("type") == "json_schema":
        request["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "lucie_output", "schema": schema["schema"], "strict": False}}
    if reasoning_effort:
        request["reasoning_effort"] = reasoning_effort
    return request


def openai_result(completion):
    """Wrap a Chat Completions result in the shape generate_chat reads (Anthropic-like)."""
    choice = completion.choices[0] if completion.choices else None
    text = (choice.message.content if choice and choice.message else None) or ""
    usage = getattr(completion, "usage", None)
    cached = getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", None)
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        stop_reason="max_tokens" if choice and choice.finish_reason == "length" else "end_turn",
        model=getattr(completion, "model", None),
        usage=SimpleNamespace(
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            cache_read_input_tokens=None,
            cache_creation_input_tokens=None,
            openai_cached_tokens=cached,
        ),
    )


def default_clients():
    """Lazily built provider callables: create(candidate, **anthropic_kwargs) -> result."""
    cache = {}

    def anthropic_create(candidate, **kwargs):
        if "anthropic" not in cache:
            cache["anthropic"] = anthropic.Anthropic(max_retries=0, timeout=120.0)
        return cache["anthropic"].messages.create(**adapt_anthropic_kwargs({**kwargs, "model": candidate.model}))

    def openai_create(candidate, **kwargs):
        if "openai" not in cache:
            import openai  # Optional dependency; only needed when a candidate uses OpenAI.
            cache["openai"] = openai.OpenAI(max_retries=0, timeout=120.0)
        request = openai_request(kwargs, candidate.model, os.environ.get("COMPARE_OPENAI_REASONING_EFFORT"))
        return openai_result(cache["openai"].chat.completions.create(**request))

    return {"anthropic": anthropic_create, "openai": openai_create}


def error_code(error):
    """Safe error code for either SDK, by exception class name (both SDKs share names)."""
    if isinstance(error, InvalidGenerationOutputError):
        return "invalid_provider_output"
    names = {cls.__name__ for cls in type(error).__mro__}
    if "AuthenticationError" in names or "PermissionDeniedError" in names:
        return "provider_unavailable"
    if "RateLimitError" in names:
        return "provider_rate_limited"
    if "APIConnectionError" in names or "APITimeoutError" in names:
        return "provider_outcome_unknown"
    if "APIStatusError" in names:
        return "provider_failed"
    return "generation_failed"


# ---------------------------------------------------------------- orchestration

def _run_one(candidate, create, message, context, device_zone, prices):
    usage, calls = {}, []

    def invoke(label, **kwargs):
        calls.append(label)
        result = create(candidate, **kwargs)
        _add_usage(usage, getattr(result, "usage", None))
        return result

    started = perf_counter()
    outcome = {"provider": candidate.provider, "model": candidate.model}
    try:
        outcome["response"] = generate_chat(message, context, invoke, model=candidate.model,
                                            device_zone=device_zone)
    except Exception as error:  # Never retry: a retry is another paid call.
        logger.warning("Model comparison candidate failed: %s", type(error).__name__)
        outcome["error"] = error_code(error)
    outcome["latency_ms"] = max(0, int((perf_counter() - started) * 1000))
    outcome["provider_calls"] = len(calls)
    outcome["usage"] = usage
    outcome["estimated_cost_usd"] = estimate_cost(candidate.model, usage, prices)
    return outcome


def run_comparison(message, context, config, *, clients=None, device_zone=None, rng=None, prices=None):
    """Generate both candidates in parallel; slots A/B are shuffled so the vote is blind."""
    clients = clients or default_clients()
    prices = prices if prices is not None else price_table()
    candidates = list(config.candidates)
    (rng or random).shuffle(candidates)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_run_one, c, clients[c.provider], message, context, device_zone, prices)
                   for c in candidates]
        outcomes = [future.result() for future in futures]
    for slot, outcome in zip("AB", outcomes):
        outcome["slot"] = slot
    return outcomes


def total_cost(outcomes):
    costs = [o.get("estimated_cost_usd") for o in outcomes]
    if any(cost is None for cost in costs):
        return None
    return round(sum(costs), 6)


def blind_view(outcome):
    """What the user sees before voting: no provider or model names."""
    view = {"slot": outcome["slot"]}
    if "response" in outcome:
        view["response"] = outcome["response"]
    else:
        view["error"] = outcome["error"]
    return view


def reveal_view(outcome):
    return {key: outcome.get(key) for key in
            ("slot", "provider", "model", "latency_ms", "provider_calls", "usage", "estimated_cost_usd", "error")}
