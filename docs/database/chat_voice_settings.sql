-- Per-conversation tone settings (the four tone scales) for persona folders.
-- Adds one new table. No existing table or row changes. Chats keep working without it:
-- until it exists, conversations simply use the shared brand tone, and saving a
-- custom tone returns 409 voice_storage_missing.
--
-- Run once per Neon branch in the SQL Editor (development first, production after approval).
-- Safe to re-run.
BEGIN;
CREATE TABLE IF NOT EXISTS public.chat_session_voice (
    session_id           uuid PRIMARY KEY REFERENCES public.chat_session(id) ON DELETE CASCADE,
    workspace_id         uuid NOT NULL REFERENCES public.workspace(id) ON DELETE CASCADE,
    settings             jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by_member_id uuid REFERENCES public.workspace_member(id) ON DELETE SET NULL,
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chat_session_voice_settings_object CHECK (jsonb_typeof(settings) = 'object')
);
COMMIT;

-- The Flask database role needs SELECT, INSERT, UPDATE and DELETE on the new table, like the
-- other chat tables. Check it matches chat_session:
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name IN ('chat_session', 'chat_session_voice') ORDER BY 1, 2;

-- Roll back (conversations return to the shared brand tone):
-- DROP TABLE IF EXISTS public.chat_session_voice;
