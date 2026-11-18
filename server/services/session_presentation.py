"""Read-only page-scoped presentation and full-history persona checks.

Call only after authorizing each session. No message bodies leave this helper
except a bounded first-request preview; history checks are never page-limited.
"""
from errors import ChatConflictError


PRESENTATION_SQL = """
SELECT s.id, p.name AS persona_name, p.id AS active_persona_id,
  ARRAY(SELECT DISTINCT m.persona_id::text FROM public.chat_message m
        WHERE m.session_id=s.id AND m.persona_id IS NOT NULL) AS persona_ids,
  EXISTS(SELECT 1 FROM public.chat_message m WHERE m.session_id=s.id
         AND m.role='assistant' AND m.persona_id IS NULL) AS unknown_persona,
  COALESCE((SELECT left(m.content,180) FROM public.chat_message m
    WHERE m.session_id=s.id AND m.role='user'
      AND (m.kind<>'operation' OR m.structured_data->'input'->>'action'='send')
    ORDER BY m.created_at,m.id LIMIT 1),'') AS preview,
  ARRAY(SELECT DISTINCT m.structured_data->>'type' FROM public.chat_message m
    WHERE m.session_id=s.id AND m.role='assistant'
      AND m.structured_data->>'schema_version'='1'
      AND m.structured_data->>'type' IN ('text','posts','campaign','video','social_image')
    ORDER BY 1) AS content_types
FROM public.chat_session s LEFT JOIN public.persona p
  ON p.id=s.default_persona_id AND p.workspace_id=s.workspace_id AND p.deleted_at IS NULL
WHERE s.id=ANY(%s::uuid[])
"""


def persona_state(session, data):
    selected = str(session.get('default_persona_id') or '')
    ids = set(data.get('persona_ids') or [])
    if len(ids) > 1 or (selected and ids - {selected}):
        return 'mixed'
    if not selected or data.get('unknown_persona'):
        return 'ambiguous'
    return 'available' if data.get('active_persona_id') else 'unavailable'


def enrich_sessions(cur, sessions):
    if not sessions:
        return sessions
    cur.execute(PRESENTATION_SQL, ([str(s['id']) for s in sessions],))
    data = {str(row['id']): row for row in cur.fetchall()}
    for session in sessions:
        row = data.get(str(session['id']), {})
        session.update(persona_name=row.get('persona_name'), preview=row.get('preview', ''),
                       content_types=row.get('content_types') or [], persona_state=persona_state(session, row))
    return sessions


def assert_persona(cur, session, fields, source=None):
    if fields['action'] == 'shorten':
        return
    if str(session.get('default_persona_id') or '') != fields['persona_id']:
        raise ChatConflictError('persona_locked', 'Start a new conversation to use another persona.')
    enrich_sessions(cur, [session])
    if session['persona_state'] in {'mixed', 'ambiguous'}:
        raise ChatConflictError('persona_history_conflict', 'This history has no single persona. Start a new conversation.')
    if source and str(source.get('persona_id') or '') != fields['persona_id']:
        raise ChatConflictError('persona_locked', 'The source belongs to a different or unknown persona.')
