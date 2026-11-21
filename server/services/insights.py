"""Workspace content-pipeline KPIs for the Insights page.

Every number is computed here from stored rows. Nothing in this module calls a model, so the
figures are deterministic and any later written analysis can only cite what this returns.
Lucie stores no social performance data (reach, likes, comments); these KPIs measure what the
workspace produced and scheduled, not how posts performed.
"""
from collections import Counter, defaultdict
from datetime import timedelta

from services.insights_import import audience, engagement

PERIODS = (7, 30, 90)
UPCOMING_DAYS = 14
STALE_GAP_DAYS = 4
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def period_bounds(today, days):
    """Current window [start, today] and the equally long window immediately before it."""
    start = today - timedelta(days=days - 1)
    previous_start = start - timedelta(days=days)
    return previous_start, start


def _change(current, previous):
    if previous == 0:
        return None
    return round((current - previous) / previous * 100)


def _longest_gap(days_with_posts, start, end):
    """Longest run of consecutive days in [start, end] with nothing scheduled."""
    longest = run = 0
    day = start
    while day <= end:
        run = 0 if day in days_with_posts else run + 1
        longest = max(longest, run)
        day += timedelta(days=1)
    return longest


def _mix(counter, total):
    return [{"label": label, "count": count, "share": round(count / total * 100) if total else 0}
            for label, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))]


def compute(entries, generated, campaigns, *, today, days, metrics=None):
    """Build the KPI payload.

    entries: calendar rows with local ``day`` (date), ``status``, ``platform``, ``format``,
        ``persona`` (name or None), ``campaign_id`` and ``flagged`` (bool).
    generated: dict with ``current``/``previous`` counts of post and campaign drafts Lucie wrote,
        and ``current_saved`` (how many of the current ones reached the calendar).
    campaigns: rows with ``name``, ``status``, ``start_date``/``end_date`` (date or None) and
        ``scheduled``/``past`` entry counts.
    metrics: imported post performance rows (see ``performance``), or None when the storage
        for imports is not installed yet.
    """
    if days not in PERIODS:
        raise ValueError("Unsupported period")
    previous_start, start = period_bounds(today, days)
    live = [e for e in entries if e["status"] != "cancelled"]
    current = [e for e in live if start <= e["day"] <= today]
    previous = [e for e in live if previous_start <= e["day"] < start]
    horizon = today + timedelta(days=UPCOMING_DAYS)
    upcoming = [e for e in live if today < e["day"] <= horizon]

    weeks = days / 7
    covered_ahead = {e["day"] for e in upcoming}
    empty_ahead = [today + timedelta(days=n) for n in range(1, UPCOMING_DAYS + 1)
                   if today + timedelta(days=n) not in covered_ahead]
    weekday_counts = Counter(WEEKDAYS[e["day"].weekday()] for e in current)

    saved_rate = (round(generated["current_saved"] / generated["current"] * 100)
                  if generated["current"] else None)
    active_campaigns = [c for c in campaigns if c["status"] != "archived" and
                        (c["end_date"] is None or c["end_date"] >= today) and
                        (c["start_date"] is None or c["start_date"] <= horizon)]

    return {
        "period": {"days": days, "start": start.isoformat(), "end": today.isoformat(),
                   "previous_start": previous_start.isoformat()},
        "kpis": {
            "posts_scheduled": {"value": len(current), "previous": len(previous),
                                "change_pct": _change(len(current), len(previous))},
            "posts_per_week": {"value": round(len(current) / weeks, 1),
                               "previous": round(len(previous) / weeks, 1)},
            "longest_gap_days": {"value": _longest_gap({e["day"] for e in current}, start, today)},
            "upcoming": {"value": len(upcoming), "days": UPCOMING_DAYS,
                         "empty_days": len(empty_ahead),
                         "next_empty": [d.isoformat() for d in empty_ahead[:5]]},
            "drafts_generated": {"value": generated["current"], "previous": generated["previous"],
                                 "change_pct": _change(generated["current"], generated["previous"])},
            "draft_to_calendar_pct": {"value": saved_rate, "saved": generated["current_saved"]},
            "compliance_flagged": {"value": sum(1 for e in current if e["flagged"])},
        },
        "mix": {
            "platform": _mix(Counter(e["platform"] or "Other" for e in current), len(current)),
            "format": _mix(Counter(e["format"] or "Other" for e in current), len(current)),
            "persona": _mix(Counter(e["persona"] or "No persona" for e in current), len(current)),
            "weekday": [{"label": d, "count": weekday_counts.get(d, 0)} for d in WEEKDAYS],
        },
        "campaigns": [{"name": c["name"], "status": c["status"],
                       "start_date": c["start_date"].isoformat() if c["start_date"] else None,
                       "end_date": c["end_date"].isoformat() if c["end_date"] else None,
                       "scheduled": c["scheduled"], "past": c["past"]} for c in active_campaigns],
        "flags": _flags(current, upcoming, empty_ahead, days, start, today),
        "performance": performance(metrics, start=start, previous_start=previous_start, today=today),
    }


def _flags(current, upcoming, empty_ahead, days, start, today):
    """Rule-based observations shown even before any written analysis exists."""
    flags = []
    if not current:
        flags.append({"level": "warn", "text": f"Nothing was scheduled in the last {days} days."})
    gap = _longest_gap({e["day"] for e in current}, start, today)
    if current and gap >= STALE_GAP_DAYS:
        flags.append({"level": "warn", "text": f"The longest stretch without a scheduled post was {gap} days."})
    if len(empty_ahead) >= UPCOMING_DAYS // 2:
        flags.append({"level": "warn", "text": f"{len(empty_ahead)} of the next {UPCOMING_DAYS} days have nothing scheduled."})
    platforms = Counter(e["platform"] or "Other" for e in current)
    if len(current) >= 4 and platforms and platforms.most_common(1)[0][1] / len(current) >= 0.75:
        name = platforms.most_common(1)[0][0]
        flags.append({"level": "info", "text": f"{name} carries most of the calendar. Other channels are quiet."})
    if upcoming and not empty_ahead:
        flags.append({"level": "good", "text": f"Every day in the next {UPCOMING_DAYS} days has something planned."})
    return flags


def _rate(rows):
    reached = sum(audience(r) for r in rows)
    return round(sum(engagement(r) for r in rows) / reached * 100, 2) if reached else None


def _group(rows, key):
    groups = defaultdict(list)
    for row in rows:
        groups[key(row)].append(row)
    return [{"label": label, "posts": len(items), "reach": sum(r["reach"] or 0 for r in items),
             "avg_reach": round(sum(audience(r) for r in items) / len(items)),
             "engagement": sum(engagement(r) for r in items), "engagement_rate": _rate(items)}
            for label, items in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0]))]


def _post(row):
    return {"platform": row["platform"], "day": row["day"].isoformat(), "caption": (row["caption"] or "")[:140],
            "permalink": row["permalink"], "reach": audience(row), "engagement": engagement(row),
            "engagement_rate": _rate([row]), "from_lucie": row["calendar_entry_id"] is not None}


def performance(metrics, *, start, previous_start, today):
    """KPIs from imported platform exports. Rows carry local ``day``, ``platform``, metric
    fields, ``caption``, ``permalink``, ``calendar_entry_id``, ``persona`` and ``imported_at``."""
    if metrics is None:
        return {"available": False, "reason": "not_installed"}
    if not metrics:
        return {"available": False, "reason": "no_imports"}
    current = [m for m in metrics if start <= m["day"] <= today]
    previous = [m for m in metrics if previous_start <= m["day"] < start]
    latest_post = max(m["day"] for m in metrics)
    lucie = [m for m in current if m["calendar_entry_id"] is not None]
    other = [m for m in current if m["calendar_entry_id"] is None]
    ranked = sorted((m for m in current if audience(m) >= 1), key=lambda m: _rate([m]), reverse=True)
    weekday = defaultdict(list)
    for m in current:
        weekday[WEEKDAYS[m["day"].weekday()]].append(m)
    return {
        "available": True,
        "latest_post_day": latest_post.isoformat(),
        "stale_days": (today - latest_post).days,
        "last_import": max(m["imported_at"] for m in metrics).isoformat(),
        "kpis": {
            "posts_measured": {"value": len(current), "previous": len(previous)},
            "reach": {"value": sum(m["reach"] or 0 for m in current),
                      "previous": sum(m["reach"] or 0 for m in previous),
                      "change_pct": _change(sum(m["reach"] or 0 for m in current),
                                            sum(m["reach"] or 0 for m in previous))},
            "engagement": {"value": sum(engagement(m) for m in current),
                           "previous": sum(engagement(m) for m in previous),
                           "change_pct": _change(sum(engagement(m) for m in current),
                                                 sum(engagement(m) for m in previous))},
            "engagement_rate": {"value": _rate(current), "previous": _rate(previous)},
            "clicks": {"value": sum(m["clicks"] or 0 for m in current)},
            "follows": {"value": sum(m["follows"] or 0 for m in current)},
            "matched_to_calendar": {"value": len(lucie), "of": len(current)},
        },
        "by_platform": _group(current, lambda m: m["platform"]),
        "by_persona": _group(lucie, lambda m: m["persona"] or "No persona"),
        "by_weekday": [{"label": d, "posts": len(weekday[d]), "engagement_rate": _rate(weekday[d])}
                       for d in WEEKDAYS],
        "lucie_vs_other": {"lucie": {"posts": len(lucie), "engagement_rate": _rate(lucie)},
                           "other": {"posts": len(other), "engagement_rate": _rate(other)}},
        "top_posts": [_post(m) for m in ranked[:3]],
        "bottom_posts": [_post(m) for m in ranked[-3:][::-1]] if len(ranked) > 5 else [],
    }
