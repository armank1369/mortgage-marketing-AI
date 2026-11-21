"""Insights KPIs, platform CSV parsing and the dashboard routes, with synthetic data only."""
import json
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from repositories import insights_repository
from services import insights, insights_analysis, insights_import
from tests.test_step_g_routes import client, W, M  # noqa: F401

TODAY = date(2026, 11, 21)  # Saturday


def entry(day, platform="Instagram", persona="First-time buyers", status="planned", flagged=False):
    return {"day": day, "status": status, "platform": platform, "format": "text-only",
            "persona": persona, "campaign_id": None, "flagged": flagged}


def metric(day, platform="Instagram", reach=1000, likes=40, comments=5, matched=True, persona="First-time buyers"):
    return {"day": day, "platform": platform, "impressions": None, "reach": reach, "views": None,
            "likes": likes, "comments": comments, "shares": 0, "saves": 0, "clicks": 3, "follows": 1,
            "caption": "Synthetic caption", "permalink": None,
            "calendar_entry_id": "e" if matched else None, "persona": persona if matched else None,
            "imported_at": datetime(2026, 11, 20, tzinfo=timezone.utc)}


GENERATED = {"current": 10, "previous": 5, "current_saved": 4}


def test_pipeline_kpis_compare_with_previous_period():
    entries = [entry(date(2026, 11, d)) for d in (3, 10, 17, 20)]
    entries += [entry(date(2026, 10, 20), platform="LinkedIn"), entry(date(2026, 11, 22), platform="Facebook"),
                entry(date(2026, 11, 19), status="cancelled")]
    result = insights.compute(entries, GENERATED, [], today=TODAY, days=30)
    k = result["kpis"]
    assert result["period"] == {"days": 30, "start": "2026-10-23", "end": "2026-11-21",
                                "previous_start": "2026-09-23"}
    assert k["posts_scheduled"] == {"value": 4, "previous": 1, "change_pct": 300}
    assert k["posts_per_week"]["value"] == 0.9
    assert k["longest_gap_days"]["value"] == 11  # Oct 23 through Nov 2.
    assert k["upcoming"]["value"] == 1 and k["upcoming"]["empty_days"] == 13
    assert k["drafts_generated"]["change_pct"] == 100
    assert k["draft_to_calendar_pct"]["value"] == 40
    assert result["mix"]["platform"] == [{"label": "Instagram", "count": 4, "share": 100}]
    texts = " ".join(f["text"] for f in result["flags"])
    assert "11 days" in texts and "13 of the next 14 days" in texts and "Instagram carries" in texts
    assert result["performance"] == {"available": False, "reason": "not_installed"}


def test_empty_workspace_has_no_divide_by_zero():
    result = insights.compute([], {"current": 0, "previous": 0, "current_saved": 0}, [], today=TODAY, days=7,
                              metrics=[])
    assert result["kpis"]["posts_scheduled"]["change_pct"] is None
    assert result["kpis"]["draft_to_calendar_pct"]["value"] is None
    assert result["flags"][0]["text"] == "Nothing was scheduled in the last 7 days."
    assert result["performance"]["reason"] == "no_imports"
    with pytest.raises(ValueError):
        insights.compute([], GENERATED, [], today=TODAY, days=14)


def test_performance_kpis():
    rows = [metric(date(2026, 11, 2)), metric(date(2026, 11, 9), reach=2000, likes=100),
            metric(date(2026, 11, 16), platform="LinkedIn", reach=500, likes=5, comments=0, matched=False),
            metric(date(2026, 10, 1), reach=800, likes=20)]
    perf = insights.compute([], GENERATED, [], today=TODAY, days=30, metrics=rows)["performance"]
    assert perf["available"] and perf["stale_days"] == 5
    assert perf["kpis"]["reach"] == {"value": 3500, "previous": 800, "change_pct": 338}
    assert perf["kpis"]["engagement"]["value"] == 155
    assert perf["kpis"]["engagement_rate"] == {"value": 4.43, "previous": 3.12}
    assert perf["kpis"]["matched_to_calendar"] == {"value": 2, "of": 3}
    assert perf["lucie_vs_other"]["lucie"]["engagement_rate"] == 5.0
    assert perf["by_platform"][0]["label"] == "Instagram" and perf["by_platform"][0]["posts"] == 2
    assert perf["by_persona"] == [{"label": "First-time buyers", "posts": 2, "reach": 3000, "avg_reach": 1500,
                                   "engagement": 150, "engagement_rate": 5.0}]
    assert perf["top_posts"][0]["engagement_rate"] == 5.25
    assert perf["bottom_posts"] == []


INSTAGRAM = ("﻿Post ID,Account ID,Account username,Account name,Description,Duration (sec),Publish time,"
             "Permalink,Post type,Data comment,Date,Views,Reach,Likes,Shares,Follows,Comments,Saves\n"
             '1790001,17841,synthetic,Synthetic,"Rates, explained",0,11/03/2026 09:30,https://ig.example/p/1,'
             'IG image,,Lifetime,"1,204",980,41,3,1,6,9\n'
             "1790002,17841,synthetic,Synthetic,No date,0,,https://ig.example/p/2,IG image,,Lifetime,5,5,1,0,0,0,0\n")
FACEBOOK = ("Post ID,Page ID,Page name,Title,Description,Publish time,Permalink,Post type,Reach,"
            "\"Reactions, Comments and Shares\",Reactions,Comments,Shares,Total clicks\n"
            "5501,99,Synthetic,,Open house,11/04/2026 17:00,https://fb.example/1,Photos,450,30,22,5,3,17\n")
LINKEDIN = ("All posts,Page analytics for synthetic data\n"
            "Post title,Post link,Post type,Campaign name,Posted by,Created date,Impressions,"
            "\"Views (excluding off-site video views)\",Clicks,Click through rate (CTR),Likes,Comments,Reposts,Follows,"
            "Engagement rate\n"
            "Market update,https://li.example/1,Organic,,Synthetic,11/05/2026,1500,,40,2.6%,25,4,2,1,4.7%\n")


def test_parse_meta_instagram_export():
    platform, rows, skipped = insights_import.parse(INSTAGRAM, timezone="America/Los_Angeles")
    assert platform == "Instagram" and skipped == 1 and len(rows) == 1
    row = rows[0]
    assert row["external_id"] == "1790001" and row["views"] == 1204 and row["reach"] == 980
    assert (row["likes"], row["comments"], row["shares"], row["saves"]) == (41, 6, 3, 9)
    assert row["posted_at"].isoformat() == "2026-11-03T09:30:00-08:00"
    assert row["caption"] == "Rates, explained"


def test_parse_meta_facebook_and_linkedin_exports():
    platform, rows, _ = insights_import.parse(FACEBOOK, timezone="America/Los_Angeles")
    assert platform == "Facebook" and rows[0]["likes"] == 22 and rows[0]["clicks"] == 17
    platform, rows, _ = insights_import.parse(LINKEDIN, timezone="America/Los_Angeles")
    assert platform == "LinkedIn"
    assert rows[0]["external_id"] == "https://li.example/1"
    assert (rows[0]["impressions"], rows[0]["shares"], rows[0]["clicks"]) == (1500, 2, 40)
    assert insights_import.audience(rows[0]) == 1500 and insights_import.engagement(rows[0]) == 31


def test_parse_rejects_unknown_files():
    with pytest.raises(insights_import.ImportFormatError, match="column headers"):
        insights_import.parse("name,email\nA,b@example.com\n", timezone="UTC")
    with pytest.raises(insights_import.ImportFormatError, match="empty"):
        insights_import.parse("  ", timezone="UTC")
    generic = "Publish time,Reach,Likes,Comments\n2026-11-03,100,5,1\n"
    with pytest.raises(insights_import.ImportFormatError, match="which platform"):
        insights_import.parse(generic, timezone="UTC")
    platform, rows, _ = insights_import.parse(generic, timezone="UTC", platform="Facebook")
    assert platform == "Facebook" and rows[0]["external_id"].startswith("fp-")


def _payload():
    return insights.compute([entry(date(2026, 11, 20))], GENERATED, [], today=TODAY, days=30)


def test_routes_require_admin_and_valid_period(client, monkeypatch):
    load = Mock(return_value=_payload())
    monkeypatch.setattr(insights_repository, "load", load)
    monkeypatch.setattr(insights_repository, "cached_report", Mock(return_value=None))
    assert client.get("/api/insights", headers=client.headers()).status_code == 403  # member
    client.context["role"] = "admin"
    response = client.get("/api/insights?days=30&tz=America/New_York", headers=client.headers())
    assert response.status_code == 200 and response.json["kpis"]["posts_scheduled"]["value"] == 1
    assert response.json["report"] is None and response.headers["Cache-Control"] == "private, no-store"
    assert load.call_args.kwargs["zone"] == "America/New_York"
    assert client.get("/api/insights?days=14", headers=client.headers()).status_code == 400
    assert client.get("/api/insights?tz=Mars/Base", headers=client.headers()).status_code == 400
    client.ai.messages.create.assert_not_called()


def test_import_route(client, monkeypatch):
    save = Mock(return_value={"imported": 1, "updated": 0, "matched": 1})
    monkeypatch.setattr(insights_repository, "save_metrics", save)
    client.context["role"] = "owner"
    body = {"text": INSTAGRAM, "timezone": "America/Los_Angeles"}
    response = client.post("/api/insights/imports", headers=client.headers(), json=body)
    assert response.status_code == 200
    assert response.json == {"imported": 1, "updated": 0, "matched": 1, "platform": "Instagram",
                             "rows": 1, "skipped": 1}
    assert save.call_args.args[:2] == (W, M)
    save.return_value = None
    response = client.post("/api/insights/imports", headers=client.headers(), json=body)
    assert response.status_code == 409 and response.json["error"] == "insights_storage_missing"
    bad = client.post("/api/insights/imports", headers=client.headers(), json={"text": "a,b\n1,2"})
    assert bad.status_code == 400


def test_analysis_route_uses_only_computed_numbers(client, monkeypatch):
    payload = _payload()
    monkeypatch.setattr(insights_repository, "load", Mock(return_value=payload))
    saved = Mock()
    monkeypatch.setattr(insights_repository, "save_report", saved)
    answer = {"headline": "Steady output,  thin runway.", "working": ["One post on Nov 20."],
              "concerns": ["13 empty days ahead."], "data_gaps": ["No exports imported."],
              "next_actions": [{"action": "Fill next week.", "why": "13 of 14 days are empty."}] * 5}
    client.ai.messages.create.return_value = SimpleNamespace(
        content=[SimpleNamespace(type="text", text=json.dumps(answer))], usage=None, stop_reason="end_turn")
    client.context["role"] = "admin"
    response = client.post("/api/insights/analysis", headers=client.headers(),
                           json={"days": 30, "timezone": "America/Los_Angeles"})
    assert response.status_code == 200
    analysis = response.json["analysis"]
    assert analysis["headline"] == "Steady output, thin runway." and len(analysis["next_actions"]) == 3
    call = client.ai.messages.create.call_args.kwargs
    assert call["output_config"]["format"]["schema"] == insights_analysis.ANALYSIS_SCHEMA
    sent = call["messages"][0]["content"]
    assert '"posts_scheduled":{"value":1' in sent and "Synthetic caption" not in sent
    assert saved.call_args.args[4] == insights_analysis.kpi_hash(payload)
    client.ai.messages.create.return_value = SimpleNamespace(
        content=[SimpleNamespace(type="text", text="not json")], usage=None, stop_reason="end_turn")
    assert client.post("/api/insights/analysis", headers=client.headers(), json={}).status_code == 502
    client.context["role"] = "viewer"
    assert client.post("/api/insights/analysis", headers=client.headers(), json={}).status_code == 403
