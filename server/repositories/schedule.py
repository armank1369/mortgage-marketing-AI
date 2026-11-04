"""Workspace calendar snapshots and atomic, revision-checked mutations."""
import re
from datetime import datetime
from uuid import UUID, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from psycopg.types.json import Jsonb

from db.connection import get_db_transaction
from errors import ConflictError, NotFoundError, ValidationError
from validation import uuid_string
from repositories.chat_persistence_repository import lock_member


def revision(cur, workspace):
    cur.execute("SELECT revision FROM public.workspace_schedule_state WHERE workspace_id=%s", (workspace,))
    row = cur.fetchone()
    return str(row["revision"] if row else 0)


def snapshot(workspace, known=None):
    with get_db_transaction() as cur:
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        version = revision(cur, workspace)
        if version == known:
            return version, None
        cur.execute("""SELECT e.id::text,e.title AS topic,e.scheduled_for,e.timezone,e.status,
                       e.display_data,i.platform,i.content_type AS format,i.campaign_id
                       FROM public.calendar_entry e LEFT JOIN public.content_item i
                       ON i.id=e.content_item_id AND i.workspace_id=e.workspace_id
                       WHERE e.workspace_id=%s ORDER BY e.scheduled_for,e.id""", (workspace,))
        entries = []
        for row in cur.fetchall():
            display = row.pop("display_data")
            scheduled = row.pop("scheduled_for")
            row["scheduled_for"] = scheduled.isoformat()
            entries.append({**display, **row, "platform": row["platform"] or display.get("platform"),
                            "format": row["format"] or display.get("format")})
        cur.execute("""SELECT id,name,objective,status,start_date::text,end_date::text
                       FROM public.campaign WHERE workspace_id=%s ORDER BY name,id""", (workspace,))
        return version, {"revision": version, "entries": entries, "campaigns": cur.fetchall()}


def _key(workspace, label):
    return str(uuid5(UUID(str(workspace)), "lucie-schedule-v1/" + label))


def _text(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or "\x00" in value:
        raise ValidationError("Invalid calendar field.")
    return value.strip()


def _when(entry):
    try:
        zone = ZoneInfo(_text(entry.get("timezone"), 100))
        instant = datetime.fromisoformat(_text(entry.get("scheduled_for"), 64))
        if instant.utcoffset() is None:
            raise ValueError()
        return instant.astimezone(zone)
    except (ValueError, ZoneInfoNotFoundError):
        raise ValidationError("Use an explicit date, time and timezone.") from None


def _source(cur, workspace, batch):
    match = re.fullmatch(r"([0-9a-fA-F-]{36})(?:-(\d{1,5}))?", batch)
    if not match:
        raise ValidationError("Invalid calendar source.")
    message = uuid_string(match[1])
    cur.execute("""SELECT m.structured_data,m.persona_id,m.compliance_flags,s.title FROM public.chat_message m
                   JOIN public.chat_session s ON s.id=m.session_id
                   WHERE m.id=%s AND s.workspace_id=%s AND m.role='assistant'""", (message, workspace))
    row = cur.fetchone()
    if not row:
        raise NotFoundError()
    kind = "posts" if match[2] else "campaign"
    data = row["structured_data"]
    if data.get("type") != kind:
        raise ValidationError("The source must be a saved post or campaign.")
    payload = data["payload"][kind]
    items = payload["posts" if kind == "posts" else "content_calendar"]
    return message, row, items, int(match[2]) if match[2] else None


def _details(value):
    if not isinstance(value, dict):
        raise ValidationError("Invalid calendar details.")

    def strings(items):
        if not isinstance(items, list) or any(not isinstance(item, str) for item in items):
            raise ValidationError("Invalid calendar text list.")
        return items

    def fields(obj, names):
        if not isinstance(obj, dict):
            raise ValidationError()
        result = {}
        for name in names:
            item = obj.get(name)
            if item is None:
                continue
            if name in {"slides", "platforms"}:
                result[name] = strings(item)
            elif isinstance(item, str):
                result[name] = item
            else:
                raise ValidationError("Invalid calendar detail field.")
        return result

    result = {}
    for name in ("hashtags", "compliance_flags"):
        if name in value:
            result[name] = strings(value[name])
    for name, keys in (("direction", ("setting","camera","lighting","energy","background","clothing")),
                       ("quickDetails", ("duration","tone","call_to_action","platforms"))):
        if value.get(name):
            result[name] = fields(value[name], keys)
    if "script" in value:
        if not isinstance(value["script"], list):
            raise ValidationError()
        result["script"] = [fields(line, ("label","text","time","slides")) for line in value["script"]]
    return result


def _save(cur, workspace, entry, identity, *, source=None, campaign=None, index=0, importing=False):
    if not isinstance(entry, dict):
        raise ValidationError()
    instant = _when(entry)
    title = _text(entry.get("topic"), 8000)
    platform = _text(entry.get("platform") or "Other", 100)
    fmt = _text(entry.get("format") or "text-only", 100)
    display = {"platform": platform, "format": fmt, "untimed": bool(entry.get("untimed"))}
    details = entry.get("details")
    if details is not None:
        if not isinstance(details, dict):
            raise ValidationError()
        display["details"] = _details(details)
    if source:
        message, row, items, _ = source
        original = items[index]
        content = _key(workspace, "content/" + identity)
        script = original.get("script") or {}
        lines = script.get("body") or []
        if isinstance(lines, str):
            lines = [lines]
        body = original.get("caption") or "\n\n".join(filter(None, [script.get("hook"), *lines, script.get("cta")])) or title
        details = display.setdefault("details", {})
        details["compliance_flags"] = sorted(set(row["compliance_flags"] or []) | set(details.get("compliance_flags", [])))
        cur.execute("""INSERT INTO public.content_item(id,workspace_id,campaign_id,source_message_id,persona_id,
                       title,content_type,platform,body_markdown,structured_data)
                       VALUES (%s,%s,%s,%s,(SELECT id FROM public.persona WHERE id=%s AND workspace_id=%s),
                               %s,%s,%s,%s,%s)
                       ON CONFLICT(id) DO UPDATE SET structured_data=excluded.structured_data,
                       body_markdown=excluded.body_markdown,title=excluded.title
                       WHERE content_item.workspace_id=excluded.workspace_id""",
                    (content,workspace,campaign,message,row["persona_id"],workspace,title,fmt,platform,body,Jsonb(original)))
        display["sourceIndex"] = index
        display["batchId"] = message if campaign else f"{message}-{index}"
    else:
        content = None
    conflict = ("DO NOTHING" if importing else """DO UPDATE SET scheduled_for=excluded.scheduled_for,
                timezone=excluded.timezone,title=excluded.title,display_data=excluded.display_data
                WHERE calendar_entry.workspace_id=excluded.workspace_id""")
    cur.execute("""INSERT INTO public.calendar_entry(id,workspace_id,content_item_id,title,scheduled_for,
                   timezone,display_data,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) """ + conflict,
                (_key(workspace,"entry/"+identity),workspace,content,title,instant,str(instant.tzinfo),Jsonb(display),
                 "published" if importing and entry.get("status") == "Completed" else "planned"))


def mutate(workspace, member, expected, data):
    with get_db_transaction() as cur:
        lock_member(cur, workspace, member, "chat:write")
        cur.execute("""INSERT INTO public.workspace_schedule_state(workspace_id) VALUES (%s)
                       ON CONFLICT DO NOTHING""", (workspace,))
        cur.execute("SELECT revision FROM public.workspace_schedule_state WHERE workspace_id=%s FOR UPDATE", (workspace,))
        if str(cur.fetchone()["revision"]) != expected:
            raise ConflictError("The workspace schedule changed. Review it before saving.")
        action = data.get("action")
        if action == "move":
            entry = data.get("entry")
            if not isinstance(entry, dict):
                raise ValidationError()
            instant = _when(entry)
            cur.execute("""UPDATE public.calendar_entry SET scheduled_for=%s,timezone=%s,
                        display_data=display_data || %s WHERE workspace_id=%s AND id=%s""",
                        (instant,str(instant.tzinfo),Jsonb({"untimed": bool(entry.get("untimed"))}),
                         workspace,uuid_string(data.get("id"))))
            if not cur.rowcount:
                raise NotFoundError()
            return
        if action == "remove":
            ids = data.get("ids")
            if not isinstance(ids, list) or len(ids) > 10000:
                raise ValidationError()
            cur.execute("DELETE FROM public.calendar_entry WHERE workspace_id=%s AND id=ANY(%s::uuid[])",
                        (workspace,[uuid_string(i) for i in ids]))
            return
        entries = data.get("entries")
        if not isinstance(entries, list) or not 1 <= len(entries) <= 500:
            raise ValidationError("Save between one and 500 entries at a time.")
        if action == "save":
            source = _source(cur, workspace, _text(data.get("batch"), 60))
            message, row, items, selected = source
            campaign = None
            if selected is None:
                if len(items) != len(entries):
                    raise ValidationError("Campaign dates must match every source post.")
                campaign = _key(workspace, "campaign/"+message)
                days = [_when(e).date() for e in entries if isinstance(e, dict)]
                if len(days) != len(entries):
                    raise ValidationError()
                goal = row["structured_data"]["payload"]["campaign"]["content_strategy"].get("goal")
                cur.execute("""INSERT INTO public.campaign(id,workspace_id,name,objective,start_date,end_date)
                            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET
                            start_date=excluded.start_date,end_date=excluded.end_date
                            WHERE campaign.workspace_id=excluded.workspace_id""",
                            (campaign,workspace,row["title"] or "Campaign",goal,min(days),max(days)))
                cur.execute("""INSERT INTO public.campaign_persona(campaign_id,persona_id)
                            SELECT %s,id FROM public.persona WHERE id=%s AND workspace_id=%s ON CONFLICT DO NOTHING""",
                            (campaign,row["persona_id"],workspace))
            elif selected >= len(items) or len(entries) != 1:
                raise ValidationError("Invalid post selection.")
            for n, entry in enumerate(entries):
                i = n if selected is None else selected
                _save(cur, workspace, entry, f"{message}/{i}", source=source, campaign=campaign, index=i)
        elif action in {"manual", "import"}:
            for entry in entries:
                if not isinstance(entry, dict):
                    raise ValidationError()
                key = _text(entry.get("localId"), 180)
                if key.startswith("seed-"):
                    raise ValidationError("Sample entries cannot be imported.")
                batch = entry.get("batchId")
                source = None
                if action == "import" and isinstance(batch,str):
                    try:
                        source = _source(cur, workspace, batch)
                    except (NotFoundError, ValidationError):
                        pass  # A browser-only artifact can still become a manual entry.
                if not source:
                    _save(cur, workspace, entry, f"{member}/{key}", importing=True)
                    continue
                message, row, items, selected = source
                suffix = re.fullmatch(re.escape(batch) + r"-(\d{1,5})", key)
                index = selected if selected is not None else int(suffix[1]) if suffix else -1
                if not 0 <= index < len(items):
                    raise ValidationError("Unrecognized legacy post position.")
                identity = f"{message}/{index}"
                cur.execute("SELECT 1 FROM public.calendar_entry WHERE workspace_id=%s AND id=%s",
                            (workspace,_key(workspace,"entry/"+identity)))
                if cur.fetchone():
                    continue
                campaign = None
                if selected is None:
                    campaign = _key(workspace,"campaign/"+message)
                    cur.execute("""INSERT INTO public.campaign(id,workspace_id,name,objective)
                                VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                                (campaign, workspace,row["title"] or "Campaign",
                                 row["structured_data"]["payload"]["campaign"]["content_strategy"].get("goal")))
                _save(cur,workspace,entry,identity,source=source,campaign=campaign,index=index,importing=True)
        else:
            raise ValidationError("Unknown calendar action.")
