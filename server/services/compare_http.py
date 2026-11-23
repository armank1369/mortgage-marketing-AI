"""HTTP routes for the two-model comparison beta (see docs/MODEL_COMPARISON_BETA.md)."""
import logging

from flask import Blueprint, current_app, g, jsonify, request

from auth.permissions import require_capability
from auth.workspace_context import require_workspace
from errors import NotFoundError, ValidationError
from repositories import model_comparison_repository as comparisons
from services import model_compare
from services.generation_context import resolve_generation_context
from validation import json_object, required_text, uuid_string

logger = logging.getLogger(__name__)
blueprint = Blueprint("model_compare", __name__)

MAX_PROMPT_CHARS = 16000
MAX_NOTE_CHARS = 1000


class CompareBetaDisabledError(NotFoundError):
    error_code = "compare_beta_disabled"


def _config():
    config = model_compare.load_config()
    if not config.enabled:
        raise CompareBetaDisabledError("The model comparison beta is not enabled.")
    return config


@blueprint.route("/api/compare/config", methods=["GET"])
@require_workspace
@require_capability("workspace:read")
def compare_config():
    config = model_compare.load_config()
    # Model names stay hidden here so votes are blind.
    return jsonify({"enabled": config.enabled, "reason": config.reason or None,
                    "calls_per_comparison": 2 if config.enabled else 0})


@blueprint.route("/api/compare/questions", methods=["POST"])
@require_workspace
@require_capability("ai:generate")
def compare_questions():
    """Ask-before-drafting step: returns {"clarification": {...}} when Lucie needs answers, else null."""
    config = _config()
    data = json_object()
    message = required_text(data, "message")
    if len(message) > MAX_PROMPT_CHARS:
        raise ValidationError("message is too long.")
    context = resolve_generation_context(g.workspace_id, persona_id=data.get("persona_id"))
    clarification, cost = model_compare.run_questions(
        message, context, config, clients=current_app.extensions.get("compare_clients"),
        device_zone=request.headers.get("X-Device-Timezone"))
    logger.info("[compare_usage] questions asked=%s est_cost_usd=%s", bool(clarification), cost)
    return jsonify({"clarification": clarification})


@blueprint.route("/api/compare", methods=["POST"])
@require_workspace
@require_capability("ai:generate")
def create_comparison():
    config = _config()
    data = json_object()
    message = required_text(data, "message")
    if len(message) > MAX_PROMPT_CHARS:
        raise ValidationError("message is too long.")
    context = resolve_generation_context(g.workspace_id, persona_id=data.get("persona_id"))
    outcomes = model_compare.run_comparison(
        message, context, config, clients=current_app.extensions.get("compare_clients"),
        device_zone=request.headers.get("X-Device-Timezone"))
    cost = model_compare.total_cost(outcomes)
    for outcome in outcomes:
        logger.info("[compare_usage] slot=%s model=%s usage=%s est_cost_usd=%s error=%s",
                    outcome["slot"], outcome["model"], outcome["usage"],
                    outcome["estimated_cost_usd"], outcome.get("error"))
    comparison_id = None
    try:
        comparison_id = comparisons.create_comparison(
            g.workspace_id, g.workspace_context["workspace_member_id"], str(context.persona.id),
            message, outcomes, cost)
    except Exception as error:  # The paid outputs are still returned; only the log entry is lost.
        logger.error("Model comparison could not be saved: %s", type(error).__name__)
    body = {"comparison_id": comparison_id, "saved": comparison_id is not None,
            "candidates": [model_compare.blind_view(o) for o in outcomes],
            "estimated_cost_usd": cost}
    if all("error" in o for o in outcomes):
        body["error"] = "comparison_failed"
        body["message"] = "Neither model produced a response. Please try again later."
        return jsonify(body), 502
    return jsonify(body), 200


@blueprint.route("/api/compare/<comparison_id>/choice", methods=["POST"])
@require_workspace
@require_capability("ai:generate")
def choose(comparison_id):
    _config()
    comparison_id = uuid_string(comparison_id, "comparison_id")
    data = json_object()
    choice = data.get("choice")
    if choice not in model_compare.CHOICES:
        raise ValidationError("choice must be A, B, tie or neither.")
    note = data.get("note")
    if note is not None and (not isinstance(note, str) or len(note) > MAX_NOTE_CHARS):
        raise ValidationError("note must be text of at most 1000 characters.")
    row = comparisons.record_choice(g.workspace_id, comparison_id, g.workspace_context["workspace_member_id"],
                                    choice, (note or "").strip() or None)
    if not row:
        raise NotFoundError("Comparison not found in this workspace.")
    cost = row.get("estimated_cost_usd")
    return jsonify({"comparison_id": comparison_id, "choice": row["chosen_slot"],
                    "candidates": [model_compare.reveal_view(c) for c in row["candidates"]],
                    "estimated_cost_usd": float(cost) if cost is not None else None})


@blueprint.route("/api/compare/<comparison_id>/combine", methods=["POST"])
@require_workspace
@require_capability("ai:generate")
def combine(comparison_id):
    """Combine both drafts using what the user liked in each, or refine the latest combination.

    One paid call per request, never retried. Body:
      {"feedback": {"A": {"aspects": [...], "note": ""}, "B": {...}}, "change": "", "refine": false}
    """
    config = _config()
    comparison_id = uuid_string(comparison_id, "comparison_id")
    data = json_object()
    change = data.get("change") or ""
    if not isinstance(change, str) or len(change) > model_compare.MAX_FEEDBACK_NOTE_CHARS:
        raise ValidationError("change must be text of at most 1000 characters.")
    change = change.strip()
    refine = data.get("refine", False)
    if not isinstance(refine, bool):
        raise ValidationError("refine must be true or false.")
    row = comparisons.get_comparison(g.workspace_id, comparison_id)
    if not row:
        raise NotFoundError("Comparison not found in this workspace.")
    feedback = model_compare.clean_feedback(data.get("feedback")) if "feedback" in data else (row.get("feedback") or {})
    merges = row.get("merges") or []
    if len(merges) >= model_compare.MAX_MERGE_ROUNDS:
        raise ValidationError("This comparison has reached its limit of combine rounds. Start a new comparison.")
    candidates = row["candidates"]
    if refine:
        current = next((m["response"] for m in reversed(merges) if m.get("response")), None)
        if current is None:
            raise ValidationError("Combine the drafts before refining.")
        if not change:
            raise ValidationError("Say what to adjust.")
        message = model_compare.build_refine_message(row["prompt"], current, feedback, change)
    else:
        if not any(c.get("response") for c in candidates):
            raise ValidationError("Neither draft is available to combine.")
        if not feedback and not change:
            raise ValidationError("Pick at least one thing you like, or say what you want.")
        message = model_compare.build_merge_message(row["prompt"], candidates, feedback, change)
    persona_id = str(row["persona_id"]) if row.get("persona_id") else data.get("persona_id")
    context = resolve_generation_context(g.workspace_id, persona_id=persona_id)
    outcome = model_compare.run_merge(message, context, config, candidates,
                                      clients=current_app.extensions.get("compare_clients"),
                                      device_zone=request.headers.get("X-Device-Timezone"))
    outcome["kind"] = "refine" if refine else "combine"
    round_number = len(merges) + 1
    record = {**model_compare.merge_view(outcome, round_number), "change": change or None}
    logger.info("[compare_usage] merge round=%s model=%s usage=%s est_cost_usd=%s error=%s",
                round_number, outcome["model"], outcome["usage"], outcome["estimated_cost_usd"], outcome.get("error"))
    saved = None
    try:
        saved = comparisons.append_merge(g.workspace_id, comparison_id, g.workspace_context["workspace_member_id"],
                                         feedback, record, len(merges))
    except Exception as error:  # The paid output is still returned.
        logger.error("Comparison merge could not be saved: %s", type(error).__name__)
    cost = saved.get("estimated_cost_usd") if saved else row.get("estimated_cost_usd")
    body = {"comparison_id": comparison_id, "saved": saved is not None, "merge": record,
            "rounds_left": model_compare.MAX_MERGE_ROUNDS - round_number,
            "reveal": {"choice": (saved or row).get("chosen_slot") or "merged",
                       "candidates": [model_compare.reveal_view(c) for c in candidates],
                       "estimated_cost_usd": float(cost) if cost is not None else None}}
    if "error" in outcome:
        body["error"] = "combine_failed"
        body["message"] = "Lucie could not combine the drafts this time. Please try again."
        return jsonify(body), 502
    return jsonify(body), 200


@blueprint.route("/api/compare/<comparison_id>", methods=["GET"])
@require_workspace
@require_capability("chat:read")
def detail(comparison_id):
    """Full record of a comparison, for reopening one that was saved into a chat.

    Deliberately works even if the beta is later switched off, so saved history stays readable.
    """
    comparison_id = uuid_string(comparison_id, "comparison_id")
    row = comparisons.get_comparison(g.workspace_id, comparison_id)
    if not row:
        raise NotFoundError("Comparison not found in this workspace.")
    cost = row.get("estimated_cost_usd")
    created = row.get("created_at")
    return jsonify({"comparison": {
        "id": comparison_id, "prompt": row["prompt"], "chosen_slot": row.get("chosen_slot"),
        "candidates": [{**model_compare.reveal_view(c), **({"response": c["response"]} if c.get("response") else {})}
                       for c in row["candidates"]],
        "feedback": row.get("feedback") or {}, "merges": row.get("merges") or [],
        "estimated_cost_usd": float(cost) if cost is not None else None,
        "created_at": created.isoformat() if hasattr(created, "isoformat") else created}})


@blueprint.route("/api/compare/summary", methods=["GET"])
@require_workspace
@require_capability("workspace:read")
def summary():
    _config()
    return jsonify({"models": comparisons.comparison_summary(g.workspace_id)})
