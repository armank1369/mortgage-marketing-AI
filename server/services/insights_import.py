"""Parse social platform analytics exports (CSV) into normalized post metric rows.

Supported without configuration:
- Meta Business Suite post exports for Instagram and Facebook ("Content" > "Export data" > CSV).
- LinkedIn Page analytics "Content" export, saved as CSV (LinkedIn downloads .xls/.xlsx; open it
  and save the "All posts" sheet as CSV). LinkedIn puts a description line above the header row,
  so the header is located by scanning the first few lines.

Pure functions only: no database, no network. Unknown columns are ignored.
"""
import csv
import hashlib
import io
import re
from datetime import datetime
from zoneinfo import ZoneInfo

PLATFORMS = ("Instagram", "Facebook", "LinkedIn")
MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
HEADER_SCAN_LINES = 6

METRICS = ("impressions", "reach", "views", "likes", "comments", "shares", "saves", "clicks", "follows")

# Normalized header -> field. Headers are lowercased with punctuation collapsed to single spaces.
ALIASES = {
    "post id": "external_id",
    "post link": "permalink", "permalink": "permalink",
    "publish time": "posted_at", "created date": "posted_at", "date posted": "posted_at",
    "description": "caption", "post title": "caption", "title": "title",
    "post type": "post_type", "content type": "post_type",
    "impressions": "impressions",
    "reach": "reach",
    "views": "views", "views excluding off site video views": "views", "plays": "views",
    "likes": "likes", "reactions": "likes",
    "comments": "comments",
    "shares": "shares", "reposts": "shares",
    "saves": "saves",
    "clicks": "clicks", "total clicks": "clicks", "link clicks": "link_clicks",
    "follows": "follows",
    "platform": "platform",
}
INSTAGRAM_MARKERS = {"account username", "saves"}
FACEBOOK_MARKERS = {"page id", "page name", "reactions comments and shares"}
LINKEDIN_MARKERS = {"post link", "reposts", "click through rate ctr", "posted by"}


class ImportFormatError(ValueError):
    pass


def _key(header):
    return re.sub(r"[^a-z0-9]+", " ", (header or "").lower()).strip()


def _number(value):
    text = (value or "").strip().replace(",", "")
    if not text or text in {"-", "--", "N/A"}:
        return None
    try:
        number = float(text.rstrip("%"))
    except ValueError:
        return None
    return int(round(number)) if number >= 0 else None


def _when(value, zone):
    text = (value or "").strip()
    if not text:
        return None
    for pattern in ("%m/%d/%Y %H:%M", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=zone)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.utcoffset() is not None else parsed.replace(tzinfo=zone)
    except ValueError:
        return None


def detect_platform(keys):
    keys = set(keys)
    if keys & LINKEDIN_MARKERS:
        return "LinkedIn"
    if keys & FACEBOOK_MARKERS:
        return "Facebook"
    if keys & INSTAGRAM_MARKERS:
        return "Instagram"
    return None


def _header_row(rows):
    for index, row in enumerate(rows[:HEADER_SCAN_LINES]):
        keys = [_key(cell) for cell in row]
        if sum(1 for k in keys if k in ALIASES) >= 3 and any(ALIASES.get(k) == "posted_at" for k in keys):
            return index, keys
    raise ImportFormatError("Could not find the column headers. Upload the post-level export "
                            "from Meta Business Suite or LinkedIn, saved as CSV.")


def parse(text, *, timezone, platform=None):
    """Return (platform, rows, skipped). Each row has posted_at, external_id and metric fields."""
    if not isinstance(text, str) or not text.strip():
        raise ImportFormatError("The file is empty.")
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ImportFormatError("The file is larger than 2 MB. Export a shorter date range.")
    if platform is not None and platform not in PLATFORMS:
        raise ImportFormatError("Unsupported platform.")
    zone = ZoneInfo(timezone)
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    start, keys = _header_row(rows)
    detected = platform or detect_platform(keys)
    columns = {}
    for position, key in enumerate(keys):
        field = ALIASES.get(key)
        if field and field not in columns:  # First matching column wins (e.g. "Reactions" vs "Likes").
            columns[field] = position
    body = rows[start + 1:]
    if len(body) > MAX_ROWS:
        raise ImportFormatError(f"The file has more than {MAX_ROWS} posts. Export a shorter date range.")
    parsed, skipped = [], 0
    for row in body:
        if not any(cell.strip() for cell in row):
            continue

        def cell(field):
            position = columns.get(field)
            return row[position] if position is not None and position < len(row) else ""

        row_platform = detected or _platform_name(cell("platform"))
        posted_at = _when(cell("posted_at"), zone)
        if not row_platform or not posted_at:
            skipped += 1
            continue
        metrics = {name: _number(cell(name)) for name in METRICS}
        if metrics["clicks"] is None:
            metrics["clicks"] = _number(cell("link_clicks"))
        if all(value is None for value in metrics.values()):
            skipped += 1
            continue
        caption = (cell("caption") or cell("title")).strip()[:500]
        permalink = cell("permalink").strip()[:1000]
        external = cell("external_id").strip() or permalink or _fingerprint(row_platform, posted_at, caption)
        parsed.append({"platform": row_platform, "external_id": external[:200], "posted_at": posted_at,
                       "permalink": permalink or None, "caption": caption or None,
                       "post_type": cell("post_type").strip()[:60] or None, **metrics})
    if not detected and not parsed:
        raise ImportFormatError("Could not tell which platform this export is from. Choose it and upload again.")
    return detected, parsed, skipped


def _platform_name(value):
    lowered = (value or "").strip().lower()
    return next((p for p in PLATFORMS if p.lower() == lowered), None)


def _fingerprint(platform, posted_at, caption):
    digest = hashlib.sha256(f"{platform}|{posted_at.isoformat()}|{caption}".encode()).hexdigest()
    return "fp-" + digest[:32]


def engagement(row):
    return sum(row.get(name) or 0 for name in ("likes", "comments", "shares", "saves"))


def audience(row):
    """Denominator for engagement rate: reach, else impressions, else views."""
    return row.get("reach") or row.get("impressions") or row.get("views") or 0
