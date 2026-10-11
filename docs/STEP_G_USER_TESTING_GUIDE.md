# Step G: step-by-step testing guide

For a teammate starting on another computer without Codex, begin with [the teammate guide](STEP_G_TEAMMATE_TESTING_GUIDE.md). This document supplies the advanced API and database checks.

This guide tests the local `codex/step-g-workspace-authorization` branch. It does not
require a push, merge, deployment, or changes to hosted main.

## What changed

- Flask verifies authentication, current workspace membership, and explicit capabilities
  before protected operations. Viewers cannot create backend chats or generate AI content.
- Single-workspace users enter automatically; multi-workspace users select an authorized
  workspace. Accounts with no memberships get a clear access message.
- Backend conversations are creator-private, including against owners/admins. New creator
  and author IDs come from verified membership. Old unattributed conversations stay hidden.
- React sends session tokens with chat, video-brief, and social-image requests.
- Global SQLite history/preferences endpoints are retired. Existing data is preserved.
  Cross-chat duplicate-idea suppression is temporarily unavailable.
- Browser chats, preferences, and calendar data are scoped to the account and workspace.
  Old unscoped browser records stay stored but hidden. This may trigger preferences setup
  again. The normal chat UI still does not save conversations to Neon or sync devices.
- Pending requests stop before dispatch if workspace selection changes while a token is
  loading. Default tests do not connect to PostgreSQL.

Use synthetic content only. Do not clear browser storage to prepare these tests: preserving
old records is one of the checks. Do not share session tokens, credentials, or unredacted
Network exports in a test report.

## 1. Confirm the checkout

Open PowerShell:

```powershell
Set-Location D:\ZeTechProjects\arman\mortgage-marketing-AI
git branch --show-current
git status --short
```

Expected branch: `codex/step-g-workspace-authorization`. Modified and untracked Step G
files are expected because the work is local. Do not reset, clean, or switch branches
with these changes present.

## 2. Run the safe automated checks first

From the repository root, use the Python interpreter with the backend dependencies:

```powershell
python -m pytest server/tests -q
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
git diff --check
```

Run each command separately and check its result. If `python` lacks dependencies, use
your existing virtual environment interpreter, for example
`.\server\.venv\Scripts\python.exe -m pytest server/tests -q` if that environment exists.
Do not change dependencies merely to resolve the interpreter selection.

Expected at this revision:

| Check | Expected result |
|---|---|
| Backend | 89 passed, 20 skipped |
| Frontend | 11 passed |
| Lint | No errors; three existing fast-refresh warnings |
| Build | Success; existing warning about a large JavaScript chunk |
| Diff check | No output; exit code 0 |

The 20 skips are live database tests, not completed checks. These default tests use local
JWT keys, mocked providers, and synthetic fixtures. They do not validate real Neon Auth,
SQL schema, or actual AI generation. A failure is a reason to investigate before proceeding.

The automated suite covers invalid/expired JWTs, role/environment capabilities, foreign
references, attribution spoofing, private queries, generation response formats, browser
storage isolation, and cancellation/selection changes while session lookup is pending.
There is no configuration-write UI to manually test in Step G.

## 3. Check development configuration and start both servers

Keep existing working `.env` files. Verify locally:

- `server/.env`: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, optional `NEON_AUTH_JWKS_URL`,
  `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL`.
- `client/.env`: `VITE_NEON_AUTH_URL` points to the matching development Auth service.
- Confirm the database endpoint/role belongs to the intended development/test branch.
  Similar URL names alone do not prove that the live schema is correct.

In terminal A, from the repository root:

```powershell
python server/app.py
```

Use the same virtual environment interpreter as in step 2 if needed. Flask should listen
on port 5001. In terminal B:

```powershell
npm --prefix client run dev
```

Open the localhost URL printed by Vite, normally `http://localhost:3000`.
For browser tests open Developer Tools (F12), then Network, and filter requests by `/api/`.

## 4. Separate Auth failures from database failures

1. Sign in with an approved development account.
2. Open `/settings`; verify it shows the intended account.
3. Click **Test Backend Identity**, or open `/debug/auth` in the local development server.
4. Expect **JWT verified by Flask** and the correct user ID. Email/name may be absent
   from token claims; the verified user ID is the key check.
5. Return to `/` and inspect `GET /api/workspaces` in Network.

Expected: 200 with a `workspaces` array. `[]` is a valid result for an unprovisioned account.
401 indicates authentication rejection; 503 `database_unavailable` indicates database
access failed. A successful Auth check does not imply a successful database connection.

The previous database attempts timed out. If this still happens, mark dependent live
checks BLOCKED, preserve the status/error code, and resolve connectivity before continuing.
Do not treat repeated timeouts as passing security tests or add a migration to fix them.
Live read-only schema inspection must establish columns, constraints, database role/RLS,
and any existing revocation mechanism before authorizing database-write tests.

## 5. Prepare the account/workspace test matrix

Use approved synthetic development accounts. Existing accounts may be reused if their
roles and workspace memberships are known. Do not automatically provision real users.
Any missing fixture setup must be coordinated for the verified test environment.

| Account | Memberships | Purpose |
|---|---|---|
| A | Member in W1 and W2 | Selection and cross-workspace isolation |
| B | Member in W1 | Same-workspace private chat isolation |
| C | Owner or admin in W1 | Confirm no ownership override |
| V | Viewer in W1 | Read allowed, generation/create denied |
| N | No memberships | Empty discovery and denied resources |

B also covers the single-workspace experience. Use separate browser profiles for concurrent
accounts; use sequential sign-out/sign-in in the same profile for browser-storage isolation.
Keep a private record of synthetic workspace/member IDs needed for API comparisons.

## 6. Test workspace access in the UI

1. Sign in as B: expect automatic W1 entry without a chooser on a fresh selection.
2. Sign in as A: with no stored selection, expect a chooser before the main application.
3. Choose W1, then W2. Confirm subsequent generation requests carry the selected
   `X-Workspace-Id` and an `Authorization: Bearer ...` header. Do not copy the token into notes.
4. Refresh: expect the previously selected authorized workspace to remain selected.
5. Sign in as N: expect the no-workspace message, **Check again**, and account settings.
   Discovery should return 200 with `{"workspaces": []}`; protected resources return 403.
6. Test a stale selection by changing only the test account's sessionStorage entry
   `lucie_workspace:<user ID>` to a different synthetic, unauthorized workspace UUID,
   then reload. Expect the stale choice to be discarded and an authorized selection
   requested. No unauthorized workspace data should appear.

Server authorization is tested separately below; changing the selector alone is not proof.

## 7. Test browser data isolation and preservation

1. In DevTools Application > Local Storage, note whether legacy keys `lucent_chats`,
   `lucent_preferences`, and `lucent_calendar_entries` already exist. Do not edit/remove them.
2. As A in W1, complete preferences if prompted. Create a synthetic chat and calendar
   item with recognizable labels such as `STEP-G-A-W1`. Refresh; they should remain.
3. Switch to W2. W1's private local items must not appear. Create a W2 test item.
4. Switch back to W1; W1 items should return, without W2 items.
5. Sign out through `/settings`, then sign in as B in the same browser. A's items and
   preferences must not appear. Sign back in as A to confirm its items are preserved.
6. Inspect storage: new keys have a `:v2:` suffix containing encoded account/workspace
   scope. Existing legacy key values must remain unchanged and hidden from the new UI.

An empty initial history or repeated preferences setup is expected for previously unscoped
records. Do not manually assign old records to the signed-in account. Another browser or
device will not automatically see these local chats. Local namespaces are not encryption.

## 8. Test normal AI features

These calls use the configured provider and can incur normal generation charges. Proceed
with approved development usage after workspace access works.

As a member with generation permission:

1. Ask for a short synthetic educational social post. Expect a rendered response without
   authentication errors, and one authorized `/api/chat` request.
2. Request a campaign with a clear time period, platforms, and posting frequency. Expect
   either a valid clarification or campaign response, as appropriate for the existing flow.
3. From a campaign entry, generate a video brief. Check `/api/video-brief` succeeds and
   its output renders in the existing component.
4. Generate a social image from an applicable post. Check `/api/social-image` succeeds
   and the existing image layout renders.
5. Verify all three requests include bearer and selected-workspace headers. Confirm the
   UI is not making `/api/history` or `/api/preferences` calls.
6. Repeat generation as V: expect 403 `permission_denied` and a friendly error. The UI
   may still display a generation control; backend denial is the required boundary.

Exact AI wording is nondeterministic. Check response usability and existing formats,
not identical text. Similar ideas across separate chats are possible because cross-chat
SQLite duplicate suppression was intentionally removed. API errors must not expose raw
provider responses or database details. Automatic retry in another workspace is a failure.

## 9. Check the backend directly

This verifies that protections do not depend on UI visibility. On the local Vite page,
you can run the following helper in DevTools Console. It obtains the current session
without printing its token and prints only each request's status and response body.
Use it only on your local development app; it is not a production console procedure.

```javascript
var stepGAuth = (await import('/src/lib/neon/neon.js')).authClient;
var stepGCall = async (path, { workspace, method = 'GET', body, authenticated = true } = {}) => {
  var headers = {};
  if (authenticated) {
    var result = await stepGAuth.getSession();
    if (result.error || !result.data?.session?.token) throw new Error('Sign in first');
    headers.Authorization = `Bearer ${result.data.session.token}`;
  }
  if (workspace) headers['X-Workspace-Id'] = workspace;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  var response = await fetch(path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  var payload = await response.json();
  console.log(response.status, payload);
  return { status: response.status, body: payload };
};
```

Start with read-only calls:

```javascript
await stepGCall('/api/workspaces');
await stepGCall('/api/chat/sessions', { authenticated: false });
await stepGCall('/api/chat/sessions', { workspace: 'not-a-uuid' });
```

Expected: 200 discovery, 401 missing token, 400 malformed workspace. Then use actual
synthetic UUIDs in place of W1/W2 in the following matrix:

| Test | Expected |
|---|---|
| A lists sessions without workspace header | 409 selection required |
| A lists sessions with W1 header | 200, only A's own unarchived sessions |
| B requests W2 through a header | 403 |
| N requests any protected workspace resource | 403 |
| Authorized account reads brand profile | 200, or 404 if no profile exists |
| Authorized account GETs history or preferences | 410 retired |
| Authorized account POSTs preferences with `{}` | 410, no preferences write |
| V POSTs `/api/chat/sessions` or any generation route with `{}` | 403 before body/provider processing |
| Header W1 plus query `?workspace_id=W2` | 400 conflicting selections |
| Duplicate `?workspace_id=W1&workspace_id=W1` | 400 duplicate selection |

Example read: `await stepGCall('/api/chat/sessions', {workspace: 'ACTUAL-W1-UUID'});`
The helper deliberately sends no stored workspace automatically, allowing the 409 test.
For other invalid-token variants and header spoofing, use the automated route tests;
do not copy real JWTs into tickets or shared scripts.

## 10. Test persisted chat privacy after approval for synthetic writes

The following creates records in the configured database. Proceed only after live schema
verification and approval for synthetic writes in the named development/test environment.
It is distinct from normal localStorage chat testing.

As A with W1 selected in the helper:

```javascript
var stepGCreated = await stepGCall('/api/chat/sessions', {
  workspace: 'ACTUAL-W1-UUID', method: 'POST',
  body: { title: 'STEP G synthetic private chat', content: 'Synthetic test only.' }
});
```

Expect 201. Record the returned session ID, then:

1. As A, GET `/api/chat/sessions/<ID>` with W1: 200 and the initial message.
2. As B, repeat against the same W1/session: 404; its list must omit A's session.
3. As C (owner/admin), repeat: still 404 and absent from its list.
4. As A, request that session under W2: 404.
5. Create another synthetic session while supplying B's member UUID in extra JSON
   `created_by_member_id` and `author_member_id` fields. Read it back as A. Both stored
   creator and message author must be A's verified membership, never B's supplied ID.
6. Supply a persona UUID belonging to W2 while creating under W1: expect 404 and no
   newly created session. A nonexistent valid persona UUID should also fail.
7. Existing unattributed/archived synthetic sessions must remain hidden but stored.
   Verify preservation through approved read-only inspection; do not alter real chats.

A profile/owner UUID is not an Auth user ID or membership UUID; compare the correct fields.
The API has no Step G delete route. Keep an inventory of created synthetic IDs and coordinate
cleanup in the approved test environment rather than deleting arbitrary records.

## 11. Test role changes and revocation after schema verification

Use approved administration of synthetic memberships only; do not delete real memberships.
Hard deletion may erase attribution or trigger foreign-key effects.

1. Keep a synthetic member signed in with workspace selection stored.
2. Have authorized test administration change its role to viewer. Its next generation
   or create request must return 403 without requiring a new sign-in; reads still work.
3. Revoke a synthetic membership using the verified lifecycle mechanism. Its next new
   protected request must fail with 403; discovery must omit that workspace.
4. Reload the UI: it should show no access or require selection from remaining memberships.
5. Check its private conversations still exist and have retained attribution.

The nullable `revoked_at` design is approved, but migration execution is not. If no supported
revocation mechanism exists, mark this test BLOCKED pending separate migration approval.
Do not execute an ALTER TABLE from this guide. Already-authorized requests in progress are
not automatically canceled by revocation; test a newly issued request afterward.

## 12. Run live SQL integration tests only on an approved disposable target

These tests INSERT, UPDATE, and DELETE synthetic records. They are not read-only tests.
After target/schema verification and explicit test-write approval, set
`LUCIE_TEST_DATABASE_URL` privately to that target, then run from the root:

```powershell
python -m pytest server/tests --run-integration -m integration -q
```

Expect the 20 currently skipped SQL tests to execute. A soft-revocation test may skip if
`revoked_at` is absent; record that as incomplete acceptance. Any failure or unexpected
skip needs investigation. Do not point this variable at production or assume that naming
a workspace `test` makes the underlying database disposable.

These SQL tests cover transactions and isolation but do not replace real Auth/browser
checks. Likewise, a frontend build does not replace exercising the UI.

## 13. Record results and decide whether acceptance is complete

For each step record: PASS / FAIL / BLOCKED / NOT RUN, account alias, workspace alias,
expected result, actual HTTP status/error code, and a redacted screenshot if useful.
Include the branch and test counts. Never include passwords, tokens, or client data.

Step G is ready for final review only when local tests, live schema checks, real Auth,
workspace/role/privacy tests, frontend generation, and revocation acceptance all pass.
The prior timeout means live checks are still outstanding today. Passing local tests alone
is not full Step G acceptance. Publishing, merging, deploying, migration execution, and
production changes remain separate decisions.
