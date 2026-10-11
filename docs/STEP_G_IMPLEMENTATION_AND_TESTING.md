# Step G implementation and testing

Status as of October 10, 2026: local implementation and synthetic tests passed; live
Neon Auth/database acceptance is incomplete. No migration, push, merge, deployment,
production change, or historical data deletion was performed.

Branch: `codex/step-g-workspace-authorization`, based on verified V2 baseline
`origin/luciev2_newteam` at `ba9f69599106599ebb945a38505a265f93302b1e`.

## Stage 1: identity, workspace selection, capabilities

Changed `server/auth/workspace_context.py`, added `server/auth/permissions.py` and
`server/validation.py`, and extended `server/errors.py` and `server/app.py`.
Existing Step F.10 JWT verification remains the identity authority. Every workspace
request reloads membership. Auth-only discovery returns an empty list for accounts with
no membership. One membership resolves automatically; multiple require an authorized
selection. Explicit Step C capabilities deny viewer writes and paid generation.

Local tests cover removed/revoked memberships, changed roles, foreign selections,
malformed identifiers, conflicting selectors, unknown roles, and zero memberships.
The full [authorization matrix](AUTHORIZATION_MATRIX.md) defines the route contracts.
Live Auth and current database schema still require verification.

## Stage 2: creator-private repositories

Changed `server/repositories/chat_repository.py` and
`server/scripts/manual_chat_persistence_check.py`. Session lists and message reads
require both workspace and creator membership. Owner/admin status grants no private
chat override. Creation validates workspace/member/persona relationships and derives
both session creator and first-message author from backend membership context.
Transactions keep session and first message atomic.

Unattributed or archived sessions remain stored but hidden. No ownership migration was
performed. The manual script now requires `--member-id`; create/delete additionally
require `--allow-write`. It was not executed during this implementation.
Synthetic tests verify private predicates, denied parent reads, relationship validation,
attribution, and failure propagation. Real SQL constraints and rollback await integration.

## Stage 3: authenticated generation and legacy retirement

Changed `server/app.py`. All three generation routes require verified authentication,
workspace membership, and `ai:generate`. Generation no longer reads or writes globally
shared SQLite history/preferences. The old history/preferences routes return 410 after
authorization. Existing SQLite files remain untouched; hosted main is unaffected.
Provider initialization is lazy, errors are sanitized, and existing generation response
shapes have mocked compatibility coverage. No paid provider requests were made.

**Functional tradeoff:** cross-chat duplicate-idea suppression is temporarily unavailable.
Restore equivalent behavior later using authorized, appropriately scoped persistent data.
Do not restore the globally shared history query. Normal React features use local
preferences and history rather than the retired endpoints.

## Stage 4: frontend compatibility and browser privacy

Added `client/src/lib/authenticatedApi.js`, `client/src/components/WorkspaceGate.jsx`,
and `client/src/context/BrowserScope.js`. Updated `client/src/lib/api.js`, `App.jsx`,
`ChatPage.jsx`, `CampaignResponse.jsx`, and `SocialImageGenerator.jsx` to send fresh
Neon Auth session tokens and selected workspace headers. Authentication/access errors
are surfaced without automatically retrying paid requests. Workspace discovery gates
the existing UI, with automatic single-workspace selection and a multi-workspace chooser.

Updated `client/src/utils/storage.js`, `PreferencesContext.jsx`, `CalendarContext.jsx`,
and `ChatPage.jsx` to scope browser records by user and workspace. Components remount
when that scope changes. Existing global browser chats/preferences/calendar entries are
preserved but are not assigned to the current user. Existing users may therefore see an
empty local history or need to complete preferences again. A deliberate migration is
future work. Browser scoping does not provide device-level confidentiality.
The chat UI is still local storage based; Neon chat persistence and cross-device sync
are not implemented by this stage. No broad UI redesign was made.

## Stage 5: isolated testing and handoff

Changed `server/db/connection.py` to initialize the pool lazily. Default backend tests
block real pool access. Changed `server/tests/conftest.py` and existing repository tests,
and added `test_step_g_authorization.py`, `test_step_g_routes.py`,
`test_step_g_private_chats.py`, and `test_step_g_integration.py`.
Added frontend `authenticatedApi.test.js`, `browserStorage.test.js`, and the npm test
script. Integration fixtures create synthetic workspaces and clean up only those records.

Run from repository root:

```powershell
python -m pytest server/tests -q
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
git diff --check
```

Latest local results: 89 backend tests passed; 20 integration tests skipped. Eleven
frontend tests passed. Lint passed with three existing fast-refresh warnings. Production
build passed with the existing large-chunk warning. These results do not include a
browser end-to-end run, live Auth sessions, live SQL, or real AI provider generation.

Integration tests require both `--run-integration` and `LUCIE_TEST_DATABASE_URL` pointing
to an explicitly approved disposable test database. They write and delete synthetic
fixtures, so do not run them against production or assume this guide authorizes writes.
Once that target and execution are authorized:

```powershell
python -m pytest server/tests --run-integration -m integration -q
```

A soft-revocation integration test skips if the optional column is absent; that skip
must not be interpreted as satisfying the revocation acceptance requirement.

## Outstanding live acceptance gates

1. Restore read-only Neon connectivity. Attempts during this work timed out. Configuration
   consistency checks are not proof of the actual connected branch or schema.
2. Inspect the intended database role, schema columns/constraints, inbound membership
   foreign keys, RLS, and any existing revocation mechanism. Validate repository assumptions.
3. Reuse an existing supported lifecycle mechanism if present. Otherwise prepare a concrete
   migration/backout proposal for the approved nullable `workspace_member.revoked_at`
   design. Obtain separate execution approval after live inspection; no migration runs
   at startup. See [revocation proposal](STEP_G_REVOCATION_PROPOSAL.md).
4. Run approved SQL integration fixtures and real Neon Auth multi-account checks: zero,
   one, and multiple memberships; viewer denial; foreign workspace/persona/session;
   creator privacy including admin; role changes; revocation; preserved historical rows.
5. Exercise React sign-in, workspace selection, account changes, preferences, calendar,
   and each generation mode with real tokens. Confirm stale selections are denied and
   the provider receives only authorized generation requests.

Do not mark Step G fully validated until these gates pass. No push, merge, deployment,
or production infrastructure change is authorized by the current implementation approval.
Step H brand-profile UI, Step I database-driven context, and Step J AI persistence remain
later integrations. Invitations/admin UI and historical ownership migration are deferred.

## Interruption recovery review

Reviewed route coverage, frontend call sites, browser scope providers, private SQL,
test isolation, and the saved diff after the token-limit interruption. No truncated
edits were found. Fixed a pending-request race: workspace selection changes or
cancellation during session lookup now prevent dispatch. Two regression tests cover
this boundary. Live validation limitations above remain unchanged.
