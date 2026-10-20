"""Bounded advisory ideas from this creator only. Caller holds authorization."""
import json

RECENT_IDEAS_SQL = """
WITH creator_ideas AS (
 SELECT DISTINCT ON (COALESCE(a.structured_data->>'original_request_id',a.request_message_id::text))
   a.id, a.created_at, a.structured_data
 FROM public.chat_session s JOIN public.chat_message a ON a.session_id=s.id
 JOIN public.chat_message q ON q.id=a.request_message_id AND q.session_id=s.id
 WHERE s.workspace_id=%s AND s.created_by_member_id=%s AND a.role='assistant'
   AND q.role='user' AND q.structured_data->'operation'->>'state'='succeeded'
   AND a.structured_data->>'schema_version'='1'
   AND a.structured_data->>'type' IN ('text','posts','campaign')
 ORDER BY COALESCE(a.structured_data->>'original_request_id',a.request_message_id::text), a.created_at DESC,a.id DESC
)
SELECT * FROM creator_ideas WHERE (%s::uuid IS NULL OR id<>%s::uuid)
ORDER BY created_at DESC,id DESC LIMIT 12
"""


def encode_ideas(ideas):
    return json.dumps(list(ideas), ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e')


def extract_ideas(rows):
    ideas = []
    for row in rows[:12]:
        envelope = row.get('structured_data') or {}
        kind, payload = envelope.get('type'), envelope.get('payload') or {}
        if kind == 'text':
            candidates = [line.strip() for line in str(payload.get('response', '')).splitlines() if line.strip()][:1]
        else:
            data = payload.get(kind) or {}
            items = data.get('posts' if kind == 'posts' else 'content_calendar') or []
            candidates = [item.get('title') or (item.get('script') or {}).get('hook') or item.get('category') or item.get('caption')
                          for item in items if isinstance(item, dict)]
        for candidate in candidates:
            if not isinstance(candidate, str) or not candidate.strip():
                continue
            candidate = candidate.strip()[:500]
            if candidate in ideas:
                continue
            proposed = [*ideas, candidate]
            if len(proposed) > 25 or len(encode_ideas(proposed).encode('utf-8')) > 8192:
                return ideas
            ideas = proposed
    return ideas


def capture_recent_ideas(cur, workspace_id, member_id, source_id=None):
    cur.execute(RECENT_IDEAS_SQL, (workspace_id, member_id, source_id, source_id))
    return extract_ideas(cur.fetchall())
