# Workspace chat sharing

Requested October 19, 2026. Replaces the Step G/J creator-private chat policy.

## Behavior

All saved chats belong to their workspace and are accessible to its current recognized
members. This includes existing chats and chats whose original creator is null. A member
must select or resolve the correct workspace; knowing a session ID grants no access.
Accounts must already have workspace membership. This patch creates no invitations,
accounts, workspaces or membership management UI, and grants no automatic staff access
to a client's workspace.

| Role | Read/export history | Continue, rename, revise, archive/restore, recover |
|---|---|---|
| owner, admin, developer, member | Yes | Yes |
| viewer | Yes | No |

Brand/persona configuration permissions retain their existing role/environment rules.
Edits mean the existing rename and revision actions; saved messages remain immutable.
Each chat retains its locked persona. Mixed/ambiguous history or unavailable personas
keep their existing generation restrictions.

Archive/restore affects everyone in the workspace. The archive confirmation explains
this. Another member can inspect operation status, replay completed work, or explicitly
acknowledge an uncertain operation before abandoning/retrying it. A single unresolved
operation blocks competing generation in that chat; existing session locks, stale-source
checks and metadata ETags apply across accounts. Only the original worker, with its
original member's current permissions and private claim token, can complete its attempt.
A collaborator cannot take over a live provider call. No extra automatic provider calls
are introduced.

Session `created_by_member_id` remains its original creator; each new user message gets
the acting verified member's `author_member_id`. No authorship is rewritten or guessed.
The UI identifies shared conversations without resolving member display names.

The sidebar and active saved chat refresh on focus/reconnect/visibility return and
approximately every 15–16 seconds while visible and online. Unresolved operation polling
retains its faster cadence. Unsent composer text remains intact. This is polling, not
real-time co-editing. Browser-local drafts, pending request identifiers, legacy local
history and calendar remain scoped to the existing account/workspace browser records;
only database-backed chats are shared.

Recent-idea avoidance now covers completed outputs from all creators in the selected
workspace, matching their new visibility. It still uses the latest 12 completed outputs,
at most 25 concepts and 8 KiB, with no additional model call. Failed outputs, superseded
revisions, regeneration source and other workspaces remain excluded. Same-chat conversation
context keeps its existing limits and does not become full workspace history.

## Database and delivery

No schema change or migration is required: workspace IDs, member roles and author IDs
already exist. The change is in Lucie's repository authorization/query filters and UI
refresh/wording. No database writes, membership provisioning, RLS changes, provider calls,
commits, pushes or deployment were performed in preparing this patch. Live database/RLS
configuration and real multi-account Auth behavior still require verification. Previously
private saved chats become visible retroactively to members of their own workspace once
the updated backend is deployed.

## Local validation

| Check | Result |
|---|---|
| `server/venv/Scripts/python.exe -m pytest server/tests -q` | 532 passed, 37 opt-in integration checks skipped |
| `npm --prefix client test` | 113 passed |
| `npm --prefix client run lint` | Passed; 3 existing Fast Refresh warnings |
| `npm --prefix client run build` | Passed; existing large bundle advisory |
| `npm --prefix client run test:chat-browser` | Passed in a real browser with synthetic transport |
| `git diff --check` | Passed |

Backend checks cover same-workspace sharing for all writer roles, viewer write denial,
foreign workspace rejection, creator-null preservation, departed-creator history,
actual acting authorship, shared metadata conflicts/archive/restore, all six operation
actions across accounts, historical replay without redispatch, original-worker claim
binding and acknowledged collaborator recovery. Existing persona, source, scope,
revision and generation-context checks remain in the passing suite. Recent-idea tests
now include other creators while excluding other workspaces and failed outputs.

Browser checks include cross-account continuation/rename/attribution, shared archive
and restore, workspace switching and direct foreign-session denial, focus refresh and
unsent draft preservation, viewer controls, existing operation recovery and mobile
layout. Polling refresh also has a controller unit test. PostgreSQL concurrency tests
were updated for different members contending on one session, but remain opt-in and
unexecuted. Tests use synthetic SQL fixtures, fake providers and a browser transport;
no live database, Auth account or provider checks were performed.

## Return-to-computer checklist

1. Log into two accounts already belonging to the same test workspace. Create a chat
   with account A; confirm account B sees it, opens it, continues it and renames it.
2. Revise/shorten an output from the other account. Confirm original output/history
   remains available. Verify archive/restore is reflected in both accounts.
3. Keep an unsent draft in one browser; send a followup from the other. Refocus or wait
   about 16 seconds; confirm the new message appears and the draft remains.
4. Test a viewer: shared history/export works; generation, rename and archive do not.
5. Switch to another workspace. Its sidebar must exclude the first workspace's chats;
   direct requests for their IDs must fail. Verify a removed member loses access.
6. For a simultaneous submission test, confirm one request wins and the other reports
   the chat's active operation; do not retry uncertain provider work without reviewing
   the warning and explicitly acknowledging it.

These live checks are not represented by the local synthetic results.
