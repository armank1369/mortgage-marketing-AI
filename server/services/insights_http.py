"""Insights dashboard API: KPIs, platform CSV imports and Lucie's written analysis.

Insights are for the people who run the account, so every route needs config:write (owners and
admins; developers only in development/test workspaces).
"""
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import anthropic
from flask import Blueprint, current_app, g, jsonify, request

from auth.permissions import require_capability
from auth.workspace_context import require_workspace
from errors import AppError, ValidationError
from repositories import insights_repository
from services import insights, insights_analysis, insights_import
from validation import json_object

blueprint = Blueprint("insights", __name__)
DEFAULT_ZONE = "America/Los_Angeles"


class InsightsNotInstalledError(AppError):
    status_code = 409
    error_code = "insights_storage_missing"

    def __init__(self):
        super().__init__("Performance imports are not set up for this workspace yet. "
                         "An administrator needs to apply the Insights database update.")


class ProviderUnavailableError(AppError):
    status_code = 502
    error_code = "ai_provider_unavailable"

    def __init__(self):
        super().__init__("Lucie could not reach the AI provider. Try again in a minute.")


def _zone(value):
    name = value or DEFAULT_ZONE
    try:
        if not isinstance(name, str) or len(name) > 64:
            raise ZoneInfoNotFoundError(name)
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValidationError("Unknown timezone.") from None
    return name


def _days(value):
    try:
        days = int(value if value is not None else 30)
    except (TypeError, ValueError):
        days = 0
    if days not in insights.PERIODS:
        raise ValidationError("Choose a 7, 30 or 90 day period.")
    return days


def _member():
    return g.workspace_context["workspace_member_id"]


def _kpis(days, zone):
    today = datetime.now(ZoneInfo(zone)).date()
    return today, insights_repository.load(g.workspace_id, today=today, days=days, zone=zone)


def _report_dto(row, current_hash):
    if not row:
        return None
    return {"analysis": row["analysis"], "model": row["model"], "created_at": row["created_at"].isoformat(),
            "outdated": row["kpi_hash"] != current_hash}


@blueprint.get("/api/insights")
@require_workspace
@require_capability("config:write")
def read():
    days, zone = _days(request.args.get("days")), _zone(request.args.get("tz"))
    today, result = _kpis(days, zone)
    result["report"] = _report_dto(insights_repository.cached_report(g.workspace_id, days, today),
                                   insights_analysis.kpi_hash(result))
    response = jsonify(result)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@blueprint.post("/api/insights/imports")
@require_workspace
@require_capability("config:write")
def import_export():
    request.max_content_length = insights_import.MAX_BYTES + 64 * 1024
    data = json_object()
    zone = _zone(data.get("timezone"))
    platform = data.get("platform") or None
    try:
        detected, rows, skipped = insights_import.parse(data.get("text"), timezone=zone, platform=platform)
    except insights_import.ImportFormatError as error:
        raise ValidationError(str(error)) from None
    if not rows:
        raise ValidationError("No posts with dates and numbers were found in this file.")
    summary = insights_repository.save_metrics(g.workspace_id, _member(), rows)
    if summary is None:
        raise InsightsNotInstalledError()
    return jsonify({**summary, "platform": detected, "rows": len(rows), "skipped": skipped}), 200


@blueprint.post("/api/insights/analysis")
@require_workspace
@require_capability("config:write")
def analyze():
    data = json_object()
    days, zone = _days(data.get("days")), _zone(data.get("timezone"))
    today, kpis = _kpis(days, zone)
    runtime = current_app.extensions["generation_runtime"]

    def invoke(label, **kwargs):
        return runtime.create(**kwargs)

    try:
        analysis = insights_analysis.analyze(kpis, invoke, model=runtime.model)
    except (anthropic.APIConnectionError, anthropic.AuthenticationError, anthropic.APIStatusError):
        raise ProviderUnavailableError() from None
    digest = insights_analysis.kpi_hash(kpis)
    insights_repository.save_report(g.workspace_id, _member(), days, today, digest, runtime.model, analysis)
    return jsonify({"analysis": analysis, "model": runtime.model,
                    "created_at": datetime.now(ZoneInfo(zone)).isoformat(), "outdated": False}), 200
