"""Lucie's written critique of the Insights KPIs.

The model only sees the computed KPI payload (no chat text, captions are truncated) and is told to
cite only numbers present in it. Output is schema-constrained JSON. Callers decide when to spend a
model call: nothing here runs automatically.
"""
import hashlib
import json

from services.generation import InvalidGenerationOutputError, _raw

ANALYSIS_PROMPT = (
    "You are Lucie, the social media assistant for a licensed mortgage broker. Review the marketing "
    "dashboard numbers you are given and write a short, candid critique for the broker. "
    "Rules: use only numbers that appear in the data, and quote them exactly; never estimate, "
    "extrapolate or invent figures, benchmarks or industry averages. If something cannot be judged "
    "from the data (for example performance when no exports were imported), say what data is missing "
    "instead of guessing. Prefer 'activity' (posts that actually went out, from imported platform exports) over kpis.posts_scheduled, "
    "which counts calendar slots that may never have been posted. 'activity' is null when nothing has been imported: "
    "then say actual posting cannot be verified. Calendar-based fields describe plans, not what happened. "
    "Be specific and practical: name the platform, persona, weekday or campaign involved. "
    "Recommend marketing actions only; never suggest rates, pricing, guarantees or borrower outcomes. "
    "Plain sentences, no markdown, no emoji. Keep each item to one or two sentences."
)

ANALYSIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "working", "concerns", "next_actions", "data_gaps"],
    "properties": {
        "headline": {"type": "string"},
        "working": {"type": "array", "items": {"type": "string"}},
        "concerns": {"type": "array", "items": {"type": "string"}},
        "next_actions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["action", "why"],
            "properties": {"action": {"type": "string"}, "why": {"type": "string"}}}},
        "data_gaps": {"type": "array", "items": {"type": "string"}},
    },
}

LIMITS = {"working": 4, "concerns": 4, "next_actions": 3, "data_gaps": 3}


def kpi_hash(kpis):
    """Stable fingerprint so a cached analysis can say whether the numbers have changed since."""
    material = {k: v for k, v in kpis.items() if k != "performance"}
    performance = dict(kpis.get("performance") or {})
    performance.pop("last_import", None)
    performance.pop("stale_days", None)
    material["performance"] = performance
    return hashlib.sha256(json.dumps(material, sort_keys=True, default=str).encode()).hexdigest()[:32]


def _brief(kpis):
    data = {key: kpis[key] for key in ("period", "kpis", "mix", "campaigns", "flags", "activity", "performance") if key in kpis}
    return json.dumps(data, default=str, separators=(",", ":"))


def _clean(value, limit=400):
    return " ".join(str(value).split())[:limit]


def analyze(kpis, invoke, *, model, business_name=None):
    who = f"The business is {business_name}. " if business_name else ""
    result = invoke("insights_analysis", model=model,
                    system=[{"type": "text", "text": ANALYSIS_PROMPT}],
                    messages=[{"role": "user", "content": who + "Dashboard data (JSON):\n" + _brief(kpis)}],
                    max_tokens=1500, thinking={"type": "disabled"},
                    output_config={"format": {"type": "json_schema", "schema": ANALYSIS_SCHEMA}})
    try:
        data = json.loads(_raw(result))
        analysis = {"headline": _clean(data["headline"], 240)}
        for key, limit in LIMITS.items():
            items = data[key]
            if not isinstance(items, list):
                raise ValueError()
            if key == "next_actions":
                analysis[key] = [{"action": _clean(i["action"]), "why": _clean(i["why"])}
                                 for i in items[:limit] if isinstance(i, dict)]
            else:
                analysis[key] = [_clean(i) for i in items[:limit]]
    except (ValueError, TypeError, KeyError):
        raise InvalidGenerationOutputError("Lucie could not write the analysis. Try again.") from None
    return analysis
