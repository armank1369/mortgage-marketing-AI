-- Run on the selected development branch. Returns catalog metadata only.
BEGIN READ ONLY;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
('workspace_schedule_state','calendar_entry','campaign','campaign_persona','content_item')
ORDER BY table_name, ordinal_position;

SELECT rel.relname AS relation, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
WHERE rel.relnamespace='public'::regnamespace AND rel.relname IN
('workspace_schedule_state','calendar_entry','campaign','campaign_persona','content_item')
ORDER BY relation, con.conname;

SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('workspace_schedule_state','calendar_entry','campaign','campaign_persona','content_item')
ORDER BY tablename,indexname;

SELECT rel.relname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class rel ON rel.oid=t.tgrelid
WHERE NOT t.tgisinternal AND rel.relnamespace='public'::regnamespace AND rel.relname IN
('workspace_schedule_state','calendar_entry','campaign','campaign_persona','content_item')
ORDER BY rel.relname,t.tgname;
SELECT rel.relname, rel.relrowsecurity AS rls_enabled,
       has_table_privilege(current_user,rel.oid,'SELECT') AS can_read,
       has_table_privilege(current_user,rel.oid,'INSERT') AS can_insert,
       has_table_privilege(current_user,rel.oid,'UPDATE') AS can_update,
       has_table_privilege(current_user,rel.oid,'DELETE') AS can_delete
FROM pg_class rel WHERE rel.relnamespace='public'::regnamespace AND rel.relname IN
('workspace_schedule_state','calendar_entry','campaign','campaign_persona','content_item')
ORDER BY rel.relname;
COMMIT;
