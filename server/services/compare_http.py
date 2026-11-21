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


@blueprint.route("/api/compare/summary", methods=["GET"])
@require_workspace
@require_capability("workspace:read")
def summary():
    _config()
    return jsonify({"models": comparisons.comparison_summary(g.workspace_id)})
