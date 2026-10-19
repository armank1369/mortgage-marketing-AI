-- READ ONLY. Run on the existing Neon DEVELOPMENT branch, never production.
-- This script reads metadata only: no customer rows, connection URLs or tokens.
-- Confirm branch in Neon's UI and the Flask runtime's configured target privately;
-- current_database() alone cannot distinguish Neon branches.
BEGIN READ ONLY;

SELECT current_database() AS database_name, current_user AS sql_editor_role,
       current_setting('server_version') AS postgres_version,
       current_setting('default_transaction_isolation') AS default_isolation,
       current_setting('statement_timeout') AS sql_statement_timeout;

-- The SQL editor role may differ from Flask's database role. Replace the literal
-- below with the role name from the runtime configuration (not its password/URL).
-- Zero rows means the placeholder was not replaced or that role was not found.
WITH requested_role(name) AS (VALUES ('REPLACE_WITH_FLASK_DB_ROLE'))
SELECT r.rolname AS application_role, r.rolsuper, r.rolbypassrls,
       has_schema_privilege(r.oid, 'public', 'USAGE') AS public_schema_usage,
       t.table_name,
       has_table_privilege(r.oid, format('public.%I', t.table_name), 'SELECT') AS can_select,
       has_table_privilege(r.oid, format('public.%I', t.table_name), 'INSERT') AS can_insert,
       has_table_privilege(r.oid, format('public.%I', t.table_name), 'UPDATE') AS can_update,
       has_table_privilege(r.oid, format('public.%I', t.table_name), 'DELETE') AS can_delete
FROM requested_role wanted JOIN pg_roles r ON r.rolname=wanted.name
CROSS JOIN (VALUES ('workspace'), ('workspace_member'), ('persona'), ('brand_profile'),
                   ('chat_session'), ('chat_message'), ('ai_run')) AS t(table_name)
ORDER BY t.table_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
      ('chat_session','chat_message','ai_run','workspace_member')
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('chat_session','chat_message','ai_run')
ORDER BY tablename,indexname;

SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('chat_session','chat_message','ai_run')
ORDER BY c.relname,con.conname;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
      ('chat_session','chat_message','ai_run','workspace_member','persona','brand_profile')
ORDER BY c.relname;

SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='chat_session' AND NOT t.tgisinternal;

COMMIT;
