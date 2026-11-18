# Step H hotfix finalization and Step G regression review

Date: October 13, 2026. Status: local changes and isolated tests complete; live browser/Auth/Neon acceptance pending.

## A. Executive summary

Step H connects Settings' business-name field to Flask and the workspace's Neon brand
profile. The developer had already verified real loading, saving, and persistence.
This hotfix restores Step G's permission boundaries, selects workspaces dynamically,
prevents false save success, sanitizes errors, and validates pooled connections before
use. It does not begin Step I, change the schema, provision memberships, or synchronize chats.

The working tree was clean on `feature/amogh-login-security-addon`, at reviewed commit
`080b9cde0cd31d577532bbea890acf7d9645ced3`. Changes are on local branch
`fix/step-h-finalization`. No new commit, push, merge, or deployment was performed.

## B. Original results (developer-reported, October 12)

- Flask on 5001 and React on 3000 started successfully; Auth login/logout and workspace discovery worked.
- Chats and personas survived refresh within the same browser; separate browsers retained separate local data.
- One authenticated real AI generation succeeded. This hotfix made no real AI requests.
- Settings loaded and saved the development business name with HTTP 200. Refresh,
  sign-out/sign-in, another browser, and Neon SQL Editor confirmed persistence.
- Blank business names were rejected.
- Backend baseline: **1 failed, 88 passed, 20 skipped**. The sole failure was
  `tests/test_step_g_routes.py::test_route_inventory`, missing the new PUT route.
- Intermittent connection errors returned 503 and later requests succeeded. An invalid
  token correctly returned 401. Some development GET requests appeared twice.
- No workspace creation/selection UI was seen with the single-workspace account;
  the welcome/preview experience appeared different.

Source inspection confirms the handoff's primary defects. Two clarifications:
the implementation uses UPDATE, not upsert; missing-profile GET already returns
200 with an empty name, contrary to the previous authorization matrix's 404 statement.
The development workspace happened to match Settings' hardcoded ID.

## C. Issues addressed

| Issue and root cause | Files changed | Fix and verification |
|---|---|---|
| Membership alone permitted profile writes; GET had lost its capability check | `server/app.py`, `docs/AUTHORIZATION_MATRIX.md` | GET checks `workspace:read`; PUT checks `config:write`, after authentication/membership. Existing policy stays unchanged: owner/admin may write; developer only in development/test; member/viewer denied. Route tests confirm denial before repository access. |
| Settings bypassed workspace selection and used direct fetch with a fixed UUID | `client/src/pages/SettingsPage.jsx`, new `client/src/components/BrandProfileEditor.jsx`, `client/src/components/WorkspaceGate.jsx`, `client/src/lib/api.js`, `client/src/lib/authenticatedApi.js`, new `client/src/lib/brandProfile.js` | Wrap only the editor in existing WorkspaceGate. One workspace auto-selects when there is no stored preference; multiple memberships show the existing selector. Stale stored selections require review. Account settings/sign-out remain accessible without membership. The editor remounts per account/workspace and aborts GET/PUT on cleanup. Expected identity/scope checks prevent dispatch under a changed session; late/aborted responses and old access errors cannot overwrite the new editor. Helper tests cover these races; actual React lifecycle/browser behavior still needs acceptance. |
| UPDATE returned no row, but route echoed input as save success | `server/app.py`, `server/repositories/brand_profile_repository.py` | No upsert or workspace creation. Missing-row PUT returns 404 `not_found`. Success uses only UPDATE RETURNING's record, after commit. Repository logs success only after commit, and logs missing rows as `not_found`. Mock tests cover SQL parameters, workspace predicate, missing rows, returned values, and commit failure. |
| PUT caught every exception and exposed its text, also turning availability failures into 500 | `server/app.py`, new editor/helper | Reuse Step F/G validators, domain errors and shared handlers. Invalid JSON objects/text return 400; unauthenticated 401; forbidden 403; selection required 409; missing profile PUT 404; unavailable database 503; unexpected errors sanitized 500. Shared logging records exception class/operation rather than raw exception text, SQL or credentials. UI displays safe error messages, with retry for failed loads. Tests check responses/logs and no save success on failures. |
| Idle connections were handed out without validation | `server/db/connection.py`, new `server/tests/test_step_h_database.py` | Add `check=ConnectionPool.check_connection`; preserve lazy creation, sizes and lifecycle defaults. Isolated tests verify configuration, lazy initialization, failure mapping and no replay. Live recovery remains unverified. |
| Route inventory rejected Step H's PUT; no dedicated Step H coverage | `server/tests/test_step_g_routes.py`, new `server/tests/test_step_h_routes.py`, new `server/tests/test_step_h_database.py`, new `client/src/lib/brandProfile.test.js` | Inventory now includes PUT; existing missing-token/no-membership route tests also exercise it. Added authorization, payload, length/trim, foreign/multiple membership, missing-row, availability, logging and stale-request coverage. Existing Step G tests remain intact. |

Missing-profile UX deliberately preserves GET's `{workspace_id, business_name: ""}`
with HTTP 200. The user sees an empty field, but saving returns an explicit missing-profile
error directing them to their administrator. No profile is silently created.
The UI permits a save attempt for read-only roles and displays the server's permission
error; server enforcement is authoritative.

### Connection investigation

Installed `psycopg_pool` is 3.3.3; requirements already specify >=3.2.0. The supported
checkout check is documented in [Psycopg connection quality](https://www.psycopg.org/psycopg3/docs/advanced/pool.html#connection-quality)
and the [pool API](https://www.psycopg.org/psycopg3/docs/api/pool.html).
Without a checkout check, an idle connection closed by the server or network can reach
application code. This is a plausible explanation for a failed request followed by
success, rather than a proven diagnosis of the reported logs.

Checkout validation costs a database round trip and lets the pool discard/replenish
broken connections before application SQL. It does not replay application writes.
Default max lifetime (3600s), max idle (600s for connections above min size), checkout
timeout (30s), and reconnect window (300s) remain unchanged. Shortening idle lifetime
alone would not validate the minimum retained connection.
Network outages, database wake-up/connect latency, pool exhaustion, and a disconnect
during SQL or commit can still produce 503. A failed commit can leave the client unsure
whether a write reached the database: read the current value before manually saving again.
No live idle failure was reproduced and no production settings were inspected or changed.

### New-chat review and expected behavior

Comparison of Step G (`1cb3c1a`) with its parent shows changes to storage scope,
authenticated requests, cancellation, and error messages, not the introductory layout
or preset controls. Step H did not change ChatPage. Current empty-message state still
shows “Start a conversation” and its caption. The three categories (Content Creation,
Strategy & Planning, Growth & Lead Generation) remain above the input, and start collapsed
with `activePromptCategory = null`. Opening a category shows three sampled prompts.
No demonstrable Step G/H welcome regression was found; no chat UI changes made.
An account/workspace with no scoped persona preferences first sees PreferenceSetup;
legacy unscoped records are intentionally hidden. Confirm the exact browser state if
the reported difference persists before expanding scope.

React StrictMode in `client/src/main.jsx` can run effects again in development; duplicated
GETs alone are expected, not proof of duplicate writes. Requests are canceled on cleanup.
Browser-local chat/persona preferences do not synchronize across browsers. The database
brand profile does. Login alone grants no membership; a selector is unnecessary with
one valid workspace. Workspace creation/invitations remain outside this task.

## D. Automated and local smoke results

Commands run in existing environments; no packages installed and no integration flag used.

| Working directory / command | Final result |
|---|---|
| `server`: `./venv/Scripts/python.exe -m pytest tests -q` | **147 passed, 20 skipped, 0 failed** (2.56s). Original inventory failure resolved. All skipped tests require separately approved isolated database integration. |
| `client`: `npm test` | **25 passed, 0 failed, 0 skipped**. Includes existing browser storage isolation and authenticated request tests. |
| `client`: `npm run lint` | Exit 0; three existing Fast Refresh warnings in unchanged `ContentBriefCard.jsx`, `socialImage/theme.jsx`, `socialImage/templates.jsx`. |
| `client`: `npm run build` | Exit 0; Vite 8.1.5 built 2208 modules. Large-chunk (>500kB) and plugin timing warnings remain; optimization is deferred. |
| `server`: `./venv/Scripts/python.exe -m py_compile app.py db/connection.py repositories/brand_profile_repository.py tests/test_step_h_routes.py tests/test_step_h_database.py` | Passed. |
| Repository: `git diff --check` | Passed. Tracked diff and all added source/test files inspected. |

An initial new-test collection run failed due to fixture import paths; package-qualified
imports corrected it. Final suite above supersedes that failed run.

Local startup smoke used subprocesses with Flask reloader disabled on 127.0.0.1:5001
and Vite strict port 3000. `GET /api/hello` and `GET /settings` each returned **200**.
Only processes started by that smoke were terminated. No authenticated database or AI
requests were issued. This checks serving/startup, not browser rendering or live Auth/Neon.
No services were left running.

## E. Manual acceptance checklist (pending)

Use only the existing Neon **development** branch and already provisioned accounts.
Do not create fixtures, change memberships/roles, or run `--run-integration` on it.
Live writes below are for the developer to approve and perform, not actions already taken.
Work through one check at a time; record PASS/FAIL, HTTP status, and safe observations.
Do not copy JWTs, request authorization headers, .env contents, or connection URLs into reports.

Start Flask from `server/` with `./venv/Scripts/python.exe app.py` and Vite from `client/`
with `npm run dev`, if those services are not already running. Open `http://localhost:3000/settings`.
Keep the browser Network panel open to inspect status codes without sharing credentials.

1. **Login/logout:** sign in, verify the account card, sign out, and confirm the brand
   editor disappears. Sign in again. Account settings and sign-out should stay available
   for an existing account without membership; that account should see the access message.
2. **Selection/load:** one workspace should select automatically (unless a stale stored
   selection requires review). For an existing multi-workspace account, choose each
   authorized workspace; verify the corresponding business name and workspace header.
   No profile write should occur during selection.
3. **Workspace/account races:** enable Network throttling, start a profile load, switch
   workspaces or sign out/sign into another existing account before it finishes.
   The previous name or success/error must not appear in the new editor. Repeat during
   a save only after approving that write. Cancellation cannot undo a save already dispatched.
4. **Authorized save (live write; approve first):** use an existing owner/admin or a
   developer in development/test. Save a recognizable temporary name with surrounding
   spaces; expect HTTP 200, trimmed persisted text, and “Business name saved.”
5. **Persistence:** refresh, sign out/in, and confirm the name. In a second browser,
   sign into the same account and select the same workspace; confirm the same name.
   Restore the original name if that restoration write is approved.
6. **Denied writes:** with an already provisioned member/viewer, attempt saving; expect
   403 and no changed value when reloading as an authorized reader. Existing developer
   production/staging behavior is covered by mocks; do not touch production for this test.
   For a direct API check, edit a copied request locally in DevTools to select a known
   foreign workspace; expect 403. Missing/invalid token should give 401. Never share tokens.
7. **Invalid input:** blank/whitespace should fail locally. A direct PUT with non-string,
   missing/malformed JSON, or 101 ASCII characters should return 400; 100 should be valid
   for an approved write. The normal input limits typing to 100 characters.
8. **Missing profile:** only if an already authorized development workspace lacks one,
   expect an empty field on GET and 404 on save, with administrator guidance. Do not
   delete an existing profile to create this scenario.
9. **Idle recovery:** load once, leave the app/backend idle for 10–15 minutes or longer
   than the previously observed failure interval, then refresh Settings (GET only).
   Repeat several times; note status and approximate latency. After any 503, use the
   load retry control. Report exception class and timestamp only from safe logs.
   Do not change pool settings or replay a failed write to simulate recovery.
10. **Chat regression without paid calls:** return to Lucie; select/set up the persona
    if required, open an empty chat slot, and check the introduction and category buttons.
    Expand Content Creation and Strategy & Planning to see post/campaign prompts;
    selecting a prompt may generate a paid request, so avoid that until explicitly approved.
    Check existing local chats/personas survive refresh and remain isolated by account/
    workspace; legacy records stay untouched. Cross-browser chat sync is not expected.

If no existing suitable account/workspace is available for a scenario, mark it unavailable;
mock coverage does not establish live acceptance. Do not grant roles to enable a test.

## F. Limitations and deferred work

- **Completed/tested locally:** capability guards, selected-workspace requests,
  stale/aborted response rejection, validation, missing-row failures, safe response/log
  handling, pool checkout configuration/failure mapping, route inventory, and Step G suites.
- **Awaiting manual verification:** React UI/lifecycle, real session changes, actual
  development memberships/permissions, Neon persistence, and idle connection recovery.
  Frontend tests exercise request helpers with mocked transports, not a rendered browser.
- **Intentionally deferred:** unrelated lint/build warnings, chat welcome changes without
  a demonstrated regression, automatic recovery/replay after database writes, legacy
  storage migration, workspace provisioning/invitations, and role changes.
- **Future Step I/persistence:** full database chat/persona synchronization and additional
  vertical slices remain separate work. Creator-private chat policy and AI behavior are unchanged.

## G. Final handoff

Branch: `fix/step-h-finalization`, based on `080b9cde0cd31d577532bbea890acf7d9645ced3`.
Changes remain uncommitted for review; no commit IDs created.

Changed/added files (15 total):

- `server/app.py`
- `server/db/connection.py`
- `server/repositories/brand_profile_repository.py`
- `server/tests/test_step_g_routes.py`
- `server/tests/test_step_h_routes.py` (new)
- `server/tests/test_step_h_database.py` (new)
- `client/src/pages/SettingsPage.jsx`
- `client/src/components/WorkspaceGate.jsx`
- `client/src/components/BrandProfileEditor.jsx` (new)
- `client/src/lib/api.js`
- `client/src/lib/authenticatedApi.js`
- `client/src/lib/brandProfile.js` (new)
- `client/src/lib/brandProfile.test.js` (new)
- `docs/AUTHORIZATION_MATRIX.md`
- `docs/STEP_H_HOTFIX_FINALIZATION.md` (new)

Approval is needed before agent-performed live writes/fixture integration tests, paid
API calls, destructive actions, push, merge, or deployment. No schema, data, role,
membership, production infrastructure, or credentials were modified or exposed.
Live acceptance and production readiness are not claimed.
