"""Workspace-scoped rows for the Insights KPIs, imported post metrics and cached analyses."""
from datetime import timedelta

from psycopg.types.json import Jsonb

from db.connection import get_db_transaction
from repositories.chat_persistence_repository import lock_member
from services import insights
from services.insights_import import METRICS


def installed(cur):
    """The import tables ship as a reviewed migration (docs/database/insights.sql)."""
    cur.execute("SELECT to_regclass('public.post_metric') IS NOT NULL AND "
                "to_regclass('public.insight_report') IS NOT NULL AS ok")
    return cur.fetchone()["ok"]


def load(workspace, *, today, days, zone):
    previous_start, start = insights.period_bounds(today, days)
    horizon = today + timedelta(days=insights.UPCOMING_DAYS)
    with get_db_transaction() as cur:
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        cur.execute("""SELECT (e.scheduled_for AT TIME ZONE e.timezone)::date AS day, e.status,
                       COALESCE(i.platform, e.display_data->>'platform') AS platform,
                       COALESCE(i.content_type, e.display_data->>'format') AS format,
                       p.name AS persona, i.campaign_id,
                       COALESCE(jsonb_array_length(e.display_data->'details'->'compliance_flags'), 0) > 0 AS flagged
                       FROM public.calendar_entry e
                       LEFT JOIN public.content_item i ON i.id=e.content_item_id AND i.workspace_id=e.workspace_id
                       LEFT JOIN public.persona p ON p.id=i.persona_id AND p.workspace_id=e.workspace_id
                       WHERE e.workspace_id=%s
                         AND (e.scheduled_for AT TIME ZONE e.timezone)::date BETWEEN %s AND %s""",
                    (workspace, previous_start, horizon))
        entries = cur.fetchall()
        cur.execute("""SELECT
                         COUNT(*) FILTER (WHERE d >= %(start)s) AS current,
                         COUNT(*) FILTER (WHERE d < %(start)s) AS previous,
                         COUNT(*) FILTER (WHERE d >= %(start)s AND saved) AS current_saved
                       FROM (SELECT (m.created_at AT TIME ZONE %(zone)s)::date AS d,
                                    EXISTS (SELECT 1 FROM public.content_item i
                                            WHERE i.source_message_id=m.id AND i.workspace_id=%(ws)s) AS saved
                             FROM public.chat_message m JOIN public.chat_session s ON s.id=m.session_id
                             WHERE s.workspace_id=%(ws)s AND m.role='assistant'
                               AND m.structured_data->>'type' IN ('posts','campaign')) drafts
                       WHERE d BETWEEN %(prev)s AND %(today)s""",
                    {"start": start, "prev": previous_start, "today": today, "zone": zone, "ws": workspace})
        generated = cur.fetchone()
        cur.execute("""SELECT c.name, c.status, c.start_date, c.end_date,
                       COUNT(e.id) FILTER (WHERE e.status<>'cancelled') AS scheduled,
                       COUNT(e.id) FILTER (WHERE e.status<>'cancelled'
                                           AND (e.scheduled_for AT TIME ZONE e.timezone)::date <= %s) AS past
                       FROM public.campaign c
                       LEFT JOIN public.content_item i ON i.campaign_id=c.id AND i.workspace_id=c.workspace_id
                       LEFT JOIN public.calendar_entry e ON e.content_item_id=i.id AND e.workspace_id=c.workspace_id
                       WHERE c.workspace_id=%s GROUP BY c.id ORDER BY c.start_date NULLS LAST, c.name""",
                    (today, workspace))
        campaigns = cur.fetchall()
        metrics = None
        if installed(cur):
            cur.execute("""SELECT (m.posted_at AT TIME ZONE %(zone)s)::date AS day, m.platform,
                           m.impressions,m.reach,m.views,m.likes,m.comments,m.shares,m.saves,m.clicks,m.follows,
                           m.caption, m.permalink, m.calendar_entry_id, p.name AS persona, m.updated_at AS imported_at
                           FROM public.post_metric m
                           LEFT JOIN public.calendar_entry e ON e.id=m.calendar_entry_id AND e.workspace_id=m.workspace_id
                           LEFT JOIN public.content_item i ON i.id=e.content_item_id AND i.workspace_id=m.workspace_id
                           LEFT JOIN public.persona p ON p.id=i.persona_id AND p.workspace_id=m.workspace_id
                           WHERE m.workspace_id=%(ws)s AND m.posted_at >= %(since)s::date - 1""",
                        {"zone": zone, "ws": workspace, "since": previous_start})
            metrics = [row for row in cur.fetchall() if row["day"] >= previous_start]
            if not metrics:
                cur.execute("SELECT EXISTS (SELECT 1 FROM public.post_metric WHERE workspace_id=%s) AS any",
                            (workspace,))
                if cur.fetchone()["any"]:
                    metrics = []  # Imports exist, just none in this window.
    result = insights.compute(entries, generated, campaigns, today=today, days=days, metrics=metrics)
    if metrics == [] and result["performance"].get("reason") == "no_imports":
        result["performance"]["reason"] = "none_in_period"
    return result


def save_metrics(workspace, member, rows):
    """Upsert parsed export rows and link each to a same-platform calendar slot on the same local day."""
    if not rows:
        return {"imported": 0, "updated": 0, "matched": 0}
    with get_db_transaction() as cur:
        lock_member(cur, workspace, member, "config:write")
        if not installed(cur):
            return None
        imported = updated = matched = 0
        for row in rows:
            cur.execute("""SELECT e.id FROM public.calendar_entry e
                           LEFT JOIN public.content_item i ON i.id=e.content_item_id AND i.workspace_id=e.workspace_id
                           WHERE e.workspace_id=%(ws)s AND e.status<>'cancelled'
                             AND lower(COALESCE(i.platform, e.display_data->>'platform', '')) LIKE %(platform)s
                             AND (e.scheduled_for AT TIME ZONE e.timezone)::date
                                 = (%(at)s::timestamptz AT TIME ZONE e.timezone)::date
                             AND NOT EXISTS (SELECT 1 FROM public.post_metric o WHERE o.calendar_entry_id=e.id
                                             AND NOT (o.platform=%(name)s AND o.external_id=%(ext)s))
                           ORDER BY abs(extract(epoch FROM e.scheduled_for - %(at)s::timestamptz)) LIMIT 1""",
                        {"ws": workspace, "platform": "%" + row["platform"].lower() + "%", "at": row["posted_at"],
                         "name": row["platform"], "ext": row["external_id"]})
            entry = cur.fetchone()
            values = [row[name] for name in METRICS]
            cur.execute(f"""INSERT INTO public.post_metric(workspace_id,platform,external_id,posted_at,permalink,
                           caption,post_type,{",".join(METRICS)},calendar_entry_id,imported_by_member_id)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,{",".join(["%s"] * len(METRICS))},%s,%s)
                           ON CONFLICT (workspace_id,platform,external_id) DO UPDATE SET
                           posted_at=excluded.posted_at, permalink=excluded.permalink, caption=excluded.caption,
                           post_type=excluded.post_type,
                           {",".join(f"{n}=COALESCE(excluded.{n},post_metric.{n})" for n in METRICS)},
                           calendar_entry_id=COALESCE(excluded.calendar_entry_id,post_metric.calendar_entry_id),
                           imported_by_member_id=excluded.imported_by_member_id
                           RETURNING (xmax = 0) AS inserted, calendar_entry_id""",
                        (workspace,row["platform"],row["external_id"],row["posted_at"],row["permalink"],
                         row["caption"],row["post_type"],*values,entry["id"] if entry else None,member))
            result = cur.fetchone()
            imported += result["inserted"]
            updated += not result["inserted"]
            matched += result["calendar_entry_id"] is not None
        return {"imported": imported, "updated": updated, "matched": matched}


def cached_report(workspace, days, period_end):
    with get_db_transaction() as cur:
        if not installed(cur):
            return None
        cur.execute("""SELECT analysis, kpi_hash, model, created_at FROM public.insight_report
                       WHERE workspace_id=%s AND period_days=%s AND period_end=%s""", (workspace, days, period_end))
        return cur.fetchone()


def save_report(workspace, member, days, period_end, kpi_hash, model, analysis):
    with get_db_transaction() as cur:
        if not installed(cur):
            return
        cur.execute("""INSERT INTO public.insight_report(workspace_id,period_days,period_end,kpi_hash,model,
                       analysis,created_by_member_id) VALUES (%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (workspace_id,period_days,period_end) DO UPDATE SET kpi_hash=excluded.kpi_hash,
                       model=excluded.model, analysis=excluded.analysis,
                       created_by_member_id=excluded.created_by_member_id, created_at=now()""",
                    (workspace, days, period_end, kpi_hash, model, Jsonb(analysis), member))
