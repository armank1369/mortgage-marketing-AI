"""Bounded, revision-validated schedule reads for questions about existing plans."""
from collections import OrderedDict
from datetime import date, datetime, time, timedelta, timezone
import json
import re
from threading import Lock
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from db.connection import get_db_transaction
from repositories.schedule import revision

_LOOKUP = re.compile(
    r"\b(?:my|our|the|saved|current|existing|workspace)\s+(?:content\s+)?(?:calendar|schedule|campaigns?|plan)\b"
    r"|\b(?:on (?:the )?calendar|already scheduled|what.{0,45}(?:scheduled|planned|booked)|"
    r"(?:show|list|check|read|access|review).{0,30}(?:calendar|campaigns|schedule)|"
    r"(?:which|what) (?:posts|campaigns) (?:are|do we have))\b", re.I)
_cache = OrderedDict()
_lock = Lock()


def wants_schedule(message):
    return bool(_LOOKUP.search(message))


def _window(message, today):
    text = message.lower()
    monday = today - timedelta(days=today.weekday())
    if match := re.search(r"\b\d{4}-\d{2}-\d{2}\b", text):
        try:
            start = date.fromisoformat(match[0])
            return start, start + timedelta(days=1)
        except ValueError:
            pass
    for word, offset in (("tomorrow", 1), ("today", 0), ("yesterday", -1)):
        if word in text:
            start = today + timedelta(days=offset)
            return start, start + timedelta(days=1)
    for word, offset in (("this week", 0), ("next week", 7), ("last week", -7)):
        if word in text:
            start = monday + timedelta(days=offset)
            return start, start + timedelta(days=7)
    if "this month" in text or "next month" in text:
        start = today.replace(day=1)
        if "next month" in text:
            start = (start + timedelta(days=32)).replace(day=1)
        return start, (start + timedelta(days=32)).replace(day=1)
    # Supply an explicit window so omitted dates are never presented as an empty calendar.
    return today - timedelta(days=30), today + timedelta(days=91)


def lookup(workspace, message, device_zone):
    try:
        zone = ZoneInfo(device_zone or "UTC")
    except (ValueError, ZoneInfoNotFoundError):
        zone = timezone.utc
    start, end = _window(message, datetime.now(zone).date())
    with get_db_transaction() as cur:
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        version = revision(cur, workspace)
        key = (str(workspace), version, start, end, str(zone))
        with _lock:
            if key in _cache:
                return _cache[key]
        cur.execute("""SELECT left(e.title,200) AS title,e.scheduled_for,e.status,left(i.platform,64) AS platform,
                    left(c.name,120) AS campaign FROM public.calendar_entry e
                    LEFT JOIN public.content_item i ON i.id=e.content_item_id AND i.workspace_id=e.workspace_id
                    LEFT JOIN public.campaign c ON c.id=i.campaign_id AND c.workspace_id=e.workspace_id
                    WHERE e.workspace_id=%s AND e.scheduled_for >= %s AND e.scheduled_for < %s
                    ORDER BY e.scheduled_for,e.id LIMIT 41""",
                    (workspace, datetime.combine(start,time.min,zone), datetime.combine(end,time.min,zone)))
        entries = cur.fetchall()
        for entry in entries:
            entry["scheduled_for"] = entry["scheduled_for"].astimezone(zone).isoformat()
        cur.execute("""SELECT left(name,120) AS name,left(objective,240) AS objective,status,
                       start_date::text,end_date::text FROM public.campaign WHERE workspace_id=%s
                       ORDER BY updated_at DESC,id LIMIT 21""", (workspace,))
        campaigns = cur.fetchall()
    context = json.dumps({"from": str(start), "until_exclusive": str(end), "timezone": str(zone),
                          "entries": entries[:40], "more_entries": len(entries)>40,
                          "recent_campaigns": campaigns[:20], "more_campaigns": len(campaigns)>20})
    with _lock:
        _cache[key] = context
        if len(_cache)>64:
            _cache.popitem(last=False)
    return context
