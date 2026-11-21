-- Persona folders (V2): optional supporting index. No tables, columns or rows change.
-- Folders are derived from chat_session.default_persona_id, which every V2 chat already
-- stores and which is locked after creation. The feature works without this index; it
-- keeps the per-folder chat list and the folder counts fast as chat volume grows.
--
-- Run once per Neon branch in the SQL Editor (development first, production after approval).
-- Safe to re-run. Takes a brief write lock on chat_session while it builds; the table is small.
CREATE INDEX IF NOT EXISTS ix_chat_session_workspace_persona_updated
    ON public.chat_session (workspace_id, default_persona_id, updated_at DESC, id DESC);

-- Verify:
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_chat_session_workspace_persona_updated';

-- Roll back (feature keeps working, only slower on large workspaces):
-- DROP INDEX IF EXISTS public.ix_chat_session_workspace_persona_updated;
