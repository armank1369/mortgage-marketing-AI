# Shared workspace schedule

## Development migration status

The team’s post-migration Neon catalog check confirmed `workspace_schedule_state` and its workspace primary and foreign keys, `calendar_entry.display_data`, and four `schedule_revision` triggers alongside the three existing update-time triggers. RLS was disabled on the five checked tables. The SQL Editor role had read and write privileges on all five. Flask runtime-role privileges and deployed cross-browser acceptance require separate verification. [Schema reference](SCHEMA.md#6-marketing-content-calendar-crm) · [K2 implementation and tests](../STEP_K2_HOTFIX_CALENDAR_DATE_TIME.md)

## Rollout sequence

Steps 1 and 2 are complete for the inspected development branch. Development verification continues at step 3. For a fresh target, start at step 1.

1. Select the intended Neon branch in the SQL Editor. Run [calendar_preflight.sql](calendar_preflight.sql). It reads catalog metadata only. Compare the four existing marketing tables with [the documented baseline](SCHEMA.md#6-marketing-content-calendar-crm). Check for an existing revision table, display column, custom constraints, triggers, RLS and grants before applying DDL.
2. After review and explicit approval, run [calendar_sync.sql](calendar_sync.sql) once in that branch. It is a single transaction. PostgreSQL creates a workspace revision table, a JSON display column for calendar cards and four revision triggers. The application database role needs its usual scoped read/write privileges on the marketing tables and SELECT/INSERT/UPDATE on the revision table. Confirm grants for the actual role. A workspace with no recorded revision starts at zero.
3. Deploy matching Flask and client code to development. Use a synthetic workspace to save a three-post campaign twice, check one campaign and three scheduled content items, and open it in a second browser. Reschedule one post and ask chat about the new date. Test a viewer, a different workspace, concurrent writes, a stale revision, and a repeated legacy import. A failed save must remain visibly unconfirmed.
4. Review the production schema, role and grants separately before an approved production migration and deployment. Keep the existing browser data during rollout.

## Data and cache behavior

Flask authorizes GET /api/calendar with current membership and workspace:read. It returns a repeatable-read snapshot containing campaigns, entries and a revision, or HTTP 304 on a matching If-None-Match. The website caches one snapshot per account/workspace and rechecks it on startup, Calendar page entry and window focus. An offline or failed refresh displays a stale-data notice. Workspace switching remounts the provider.

POST /api/calendar requires chat:write and If-Match. The transaction locks the current membership and revision, checks the precondition and applies the change. A stale write returns 409. Every row change to campaign, campaign_persona, content_item or calendar_entry advances the affected workspace revision. Multiple increments in one transaction are expected. Normal row inserts, updates and deletes in SQL also invalidate caches. Administrative TRUNCATE and restore require separate coordinated cache invalidation.

Campaign saves use deterministic primary keys derived from workspace, source assistant revision and item index. Standalone posts share this content identity scheme. Source messages are resolved through their workspace session. The original chat and revisions remain intact. Campaign saves preview dated slots. Unchanged saved slots retain their original scheduling zone. The grid displays event-local dates. Removing a schedule entry preserves its generated content and campaign.

The Calendar page offers a preview before sharing legacy entries. Import preserves the original local data, excludes samples, links entries to recognized in-workspace messages, and uses stable identities for retries. Unlinked legacy entries become manual scheduled items. Generated schedules imported from older browsers use the importing device's timezone because the legacy record did not store a reliable zone.

Calendar-related chat requests use a server-side read with a revision-keyed, bounded process-local cache. Supported windows include explicit ISO dates, today/tomorrow/yesterday, previous/current/next week, and current/next month in the request timezone. Other questions get a labeled window from 30 days ago to 90 days ahead. Results include up to 40 entries and 20 recent campaign summaries with truncation indicators. Schedule reads never dispatch an additional model call. The schedule UI remains the write path.

