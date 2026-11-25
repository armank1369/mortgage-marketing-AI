"""Lucie's written critique of the Insights KPIs.

The model only sees the computed KPI payload (no chat text, captions are truncated) and is told to
cite only numbers present in it. Output is schema-constrained JSON. Callers decide when to spend a
model call: nothing here runs automatically.
"""
import hashlib
import json
import re

from services.generation import InvalidGenerationOutputError, _raw

ANALYSIS_PROMPT = (
    "You are Lucie, the social media assistant for a licensed mortgage broker. Review the marketing "
    "dashboard numbers you are given and write a short, candid critique for the broker. "
    "Rules: use only numbers that appear in the data, and quote them exactly; never estimate, "
    "extrapolate or invent figures, benchmarks or industry averages. If something cannot be judged "
    "from the data (for example performance when no exports were imported), say what data is missing "
    "instead of guessing. Prefer the posting activity (posts that actually went out, from imported platform exports) over the "
    "number of scheduled calendar slots, which may never have been posted. Posting activity is null when nothing has been imported: "
    "then say actual posting cannot be verified. Calendar-based figures describe plans, not what happened. "
    "Be specific and practical: name the platform, persona, weekday or campaign involved. "
    "Recommend marketing actions only; never suggest rates, pricing, guarantees or borrower outcomes. "
    "Write in plain, friendly English for a busy mortgage broker who has never seen this data's structure. "
    "The data is labelled with technical field names. Never repeat them: no snake_case words, no dots or "
    "code-style terms, no JSON wording, no words like 'flag', 'field', 'null', 'key' or 'payload'. Describe "
    "each idea in everyday words instead (for example 'the longest stretch without a post was 9 days', "
    "'engagement rate', 'drafts Lucie wrote', 'posts that made it onto the calendar'). "
    "Notes about missing data must also be plain sentences about what to import or set up, never field names. "
    "Plain sentences, no markdown, no emoji. Keep each item to one or two sentences."
)

FRIENDLY = {
    "longest_gap_days": "longest stretch without a post",
    "days_since_last_post": "days since the last post",
    "draft_to_calendar_pct": "share of drafts that reached the calendar",
    "drafts_generated": "drafts Lucie wrote",
    "engagement_rate": "engagement rate",
    "next_empty": "next open day on the calendar",
    "empty_days": "open days on the calendar",
    "by_persona": "by persona",
    "by_platform": "by platform",
    "by_weekday": "by weekday",
    "bottom_posts": "weakest posts",
    "top_posts": "strongest posts",
    "lucie_vs_other": "Lucie's posts compared with other posts",
    "from_lucie": "posts from Lucie",
    "matched_to_calendar": "posts matched to the calendar",
    "posts_scheduled": "scheduled posts",
    "posts_per_week": "posts per week",
    "posts_measured": "posts with results",
    "compliance_flagged": "posts with a compliance flag",
    "avg_reach": "average reach",
    "current_saved": "saved posts",
    "last_import": "latest import",
    "stale_days": "days since the last import",
    "no_imports": "no results imported yet",
    "export_too_old": "the imported file is out of date",
    "not_installed": "not set up yet",
    "data_through": "data through",
}
_SNAKE = re.compile(r"\b[a-z]+(?:_[a-z0-9]+)+\b")
_DOTTED = re.compile(r"\b(?:kpis|activity|performance|mix|flags|period|campaigns)\.([a-z_]+)\b")
_FLAG_WORD = re.compile(r"\b([a-z]+(?:_[a-z0-9]+)+)\s+(?:flag|field|key|value)\b")


def plain_language(text):
    """Last line of defence: swap any backend field name that slips into prose for everyday words."""
    text = _DOTTED.sub(lambda m: m.group(1), text)
    text = _FLAG_WORD.sub(lambda m: m.group(1), text)
    text = _SNAKE.sub(lambda m: FRIENDLY.get(m.group(0), m.group(0).replace("_", " ")), text)
    return text

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
    return plain_language(" ".join(str(value).split()))[:limit]


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
