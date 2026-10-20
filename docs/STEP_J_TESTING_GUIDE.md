# Step J testing and final acceptance

> Access-policy update: [Workspace chat sharing](WORKSPACE_CHAT_SHARING.md) supersedes creator-private chat access and creator-only recent-idea retrieval described below. Existing same-workspace chats are shared; historical test results remain historical.

J.2/J.3 implement backend APIs; J.4 connects the normal Chat page to durable sessions
and operations. J.5 now adds bounded same-conversation context. No migration or
additional owner-run Neon query is required. The agent completed J.7 automated
checks and scoped SQL fixtures; remaining live gates are in STEP_J_FINALIZATION.md.
The complete feature/decision reference is STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md.
J.3 provider-backed POSTs now perform actual paid generation when configured. The
automated tests below use fake provider responses and incur no AI charges. Do not
run manual send/clarify/regenerate/video/social_image operations without paid-call
approval. Creation/metadata/read/archive examples below remain model-free.

## J.4 UI checks — safe to run without a database or paid calls

From repository root:

```powershell
npm --prefix client test
npm --prefix client run test:chat-browser
npm --prefix client run lint
npm --prefix client run build
```

The browser command uses installed Chrome (or Edge), an isolated temporary browser
profile, and a loopback Vite harness with synthetic transport. It never starts Flask,
uses your signed-in browser, connects to Neon or invokes an AI provider. Override
`STEP_J_BROWSER` with an installed Chrome/Edge executable if automatic discovery fails.
It exercises send/reload, immutable shortening, archive/restore, persisted image/video
specifications and their revisions, clarification selections, lost responses, explicit
uncertainty acknowledgement/abandonment, unchanged legacy keys/read-only history,
conversation/history pagination, account switching, viewer controls and narrow layout.
It also downloads a real 1080×1080 synthetic PNG through the local exporter.
Screenshots go to the OS temporary directory (or `STEP_J_SCREENSHOT_DIR`).

For an optional normal-app review, open an existing saved conversation and refresh it:
reads do not regenerate. Check Previous versions, Archive/Restore, Rename, explicit
Generation persona selection, Load earlier messages and Local history. Verify old
local chats are read-only and Calendar remains local. New Chat creates no remote
placeholder until Send. Send, Continue, Regenerate and media generation in the normal
app can make paid calls; use the synthetic browser command for free functional checks.

The owner reported successful normal UI/multiple-browser persistence after J.4.
The remaining live cross-account/workspace/role matrix still needs controlled
acceptance with existing test identities. Browser fixture identities do not prove
Neon Auth behavior. No memberships, grants, schema, test rows or ai_run rows need
to be pre-created now.

## J.5 manual UI review

The owner reported successful testing after J.5. The checklist below remains a
reference for future regression or focused review; routine repeat testing is not required.

Routine PowerShell scripts are the agent's responsibility; no need to repeat them.
For the owner's optional normal-app review (normal generation uses the configured
paid provider):

1. In one conversation, ask for a short checklist, then ask “Explain your second point.”
   The follow-up should use that conversation's earlier content.
2. Reopen that saved conversation in another browser and ask a related follow-up.
   Reads themselves must not regenerate; new generation loads history from Neon.
3. Start a separate conversation and verify it does not know the first one's details.
4. Regenerate an earlier result: its original task and preceding context should be
   used, with previous versions preserved. Clarification should retain its answers.

Context is deliberately bounded: up to six completed logical exchanges, at most
16 KiB of canonical UTF-8 history JSON, and 4 KiB per historical user/assistant
projection. Older complete exchanges are removed first. Truncated projections are
marked, while saved output/disclosures remain unmodified. Failed/pending requests,
operational command labels and unrelated media are excluded. This is not long-term
memory or knowledge of other conversations.

## 1. Historical J.2/J.3 preflight — already completed

The following preparation/checklist is retained for reference. Do not rerun its SQL
or create fixtures now unless the target/configuration changes or a new check is
explicitly requested. No additional Neon query is needed for J.5/J.7.

1. In Neon's UI, select the existing development branch and confirm privately that
   Flask's DATABASE_URL targets it. Do not paste the URL, password or tokens.
2. Run [the read-only metadata preflight](STEP_J_DATABASE_PREFLIGHT.sql), replacing
   only the application-role placeholder. The SQL editor role can be different
   from the Flask role. This reads no chat/customer records and changes no schema.
3. Share metadata results/errors if something differs from the supplied snapshot.
   Confirm the message key unique index, JSONB fields, parent updated_at trigger,
   ai_run required columns/checks and app-role access. No revoked_at column is
   expected; do not add one as part of J.2.
4. Choose whether to authorize the five J.2 synthetic SQL tests below. They need
   permission to create an isolated temporary workspace on the verified development
   branch and to delete only that fixture workspace on completion. They do not
   require another Neon branch or any paid generation.
5. For later J.4/J.7 browser acceptance, prepare two existing test accounts: one
   creator in two browsers and another member/admin in the same development
   workspace. A viewer identity and a second already-authorized test workspace
   improve negative coverage. Do not create/change real memberships just for tests.
   If these do not exist, provisioning is a separate approved data operation.

Schema metadata and unit tests alone do not establish live concurrency or identity
isolation. No Neon query is necessary before coding can continue; preflight/live
acceptance is needed before declaring the database path verified.

## 2. Isolated checks you can run immediately

From repository root:

```powershell
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_repository.py server/tests/test_step_j_routes.py server/tests/test_step_j_contract.py server/tests/test_step_g_private_chats.py server/tests/test_step_g_authorization.py -q
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_operations.py server/tests/test_step_i_routes.py server/tests/test_step_i_compliance.py -q
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_context.py server/tests/test_step_i_context.py server/tests/test_step_i_routes.py -q
.\server\venv\Scripts\python.exe -m pytest server/tests -q
git diff --check
```

Default pytest blocks real database pool access. The new repository state machine
uses a transactional in-memory adapter; routes use signed synthetic JWTs and mocked
repositories/provider. The full run skips all opt-in integration tests. Passing
these tests does not mean real SQL or a live browser was tested.

## 3. Optional approved real PostgreSQL tests

Run only after confirming the development target AND approving fixture writes and
cleanup. Set LUCIE_TEST_DATABASE_URL privately through your local environment. It
must be an explicitly approved test connection; never paste it into the chat or a
committed file. This variable is deliberately separate from the application's URL.
The tests will not silently fall back to DATABASE_URL.

If all five cases error at setup with `Set LUCIE_TEST_DATABASE_URL...`, no database
test has run: the test connection was not supplied. This is independent of passing
unit tests or the SQL Editor connection. An approved runner can copy the existing
verified development connection into this variable only for the pytest subprocess;
there is no need to edit .env, create a Neon branch, or paste credentials into chat.
The owner follow-up run used this process-only setup and all five live tests passed;
see the implementation record. No need to rerun them unless code/target changes.

```powershell
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_integration.py server/tests/test_step_j_generation_integration.py server/tests/test_step_j_context_integration.py --run-integration -m integration -q
```

The five tests cover:

- Duplicate same-key claims from independent connections: one winner; saved replay.
- Different simultaneous operations: one winner and one busy conflict.
- Real transaction rollback after response insertion, followed by successful save
  and deterministic shortening that preserves the footer and flags.
- Explicit uncertain replacement fences an old completion, without any paid call.
- Metadata ETag conflict, archive/restore, and denial to another member with admin role.

The seven additional J.3 cases cover committed ai_run records before dispatch,
two-call campaign accounting with one response link, failed/uncertain operation
states, atomic response/run rollback with save-only retry, role downgrade before
completion, and an in-flight duplicate that returns while the first fake provider
call is waiting. They configure brand/licensing only inside newly created synthetic
test workspaces. No test constructs an Anthropic client or makes a paid call.

The four J.5/final-review SQL cases cover captured history/revision boundaries,
same-owner conversation isolation and foreign-admin denial, real process interruption
with explicit retry only, abandoned campaign-stage fencing, and stale parent-media
rejection followed by a linked artifact revision. The selected suites total 16 cases.

Fixtures create random synthetic workspace/member/persona/session/message records.
They use the existing conftest fixture's cleanup:
`DELETE FROM public.workspace WHERE id=<that exact generated UUID> AND environment='test'`.
The workspace's foreign keys cascade only its synthetic records. Review conftest.py
and test_step_j_integration.py before authorizing execution. Do not run the older
manual_chat_persistence_check.py or the entire historical integration suite for this
check. Never delete or rename an existing workspace to prepare fixtures.

If a test/process is forcibly stopped, cleanup may not finish. Keep the generated
fixture workspace UUID from the failure report and request a targeted cleanup review;
do not bulk-delete by name, slug prefix, environment or date. No cleanup DDL is needed.

## 4. Optional manual API smoke in the signed-in development browser

This section writes ONE synthetic conversation to your selected development
workspace. Run only if you choose to authorize that write. It makes no AI calls.
Start Flask/Vite using the existing project setup, sign into the local development
app and select the intended workspace. Use the browser's developer console on that
local Vite page. Do not share session-token values or screenshots containing them.

List saved personas using the application's authenticated transport:

```javascript
var j2Api = (await import('/src/lib/api.js')).workspaceApi
var j2Personas = (await j2Api.send({method: 'GET', url: '/api/personas'})).data.personas
console.table(j2Personas.map(({id, name}) => ({id, name})))
```

Explicitly choose a persona UUID from that list, then create a synthetic session:

```javascript
var j2PersonaId = 'REPLACE_WITH_CHOSEN_PERSONA_UUID'
var j2SessionId = crypto.randomUUID()
var j2Path = '/api/chat/sessions/' + j2SessionId
var j2Created = await j2Api.send({method: 'PUT', url: j2Path,
  data: {title: 'STEP J.2 MANUAL SYNTHETIC', persona_id: j2PersonaId}})
console.log(j2Created.status, j2Created.data.id) // 201
var j2Replay = await j2Api.send({method: 'PUT', url: j2Path,
  data: {title: 'Must not overwrite', persona_id: j2PersonaId}})
console.log(j2Replay.status, j2Replay.data.title) // 200, original title
var j2Detail = await j2Api.send({method: 'GET', url: j2Path + '?version=2'})
console.log(j2Detail.data.messages.length) // 0
```

Rename with an ETag, then deliberately retry with the stale one:

```javascript
var j2OldTag = j2Detail.data.etag
var j2Renamed = await j2Api.send({method: 'PATCH', url: j2Path,
  headers: {'If-Match': j2OldTag}, data: {title: 'STEP J.2 RENAMED SYNTHETIC'}})
try {
  await j2Api.send({method: 'PATCH', url: j2Path,
    headers: {'If-Match': j2OldTag}, data: {title: 'Stale overwrite'}})
} catch (error) { console.log(error.response?.status) } // 412
```

Archive, verify the archived list, and restore:

```javascript
var j2Archived = await j2Api.send({method: 'PATCH', url: j2Path,
  headers: {'If-Match': j2Renamed.data.etag}, data: {archived: true}})
var j2ArchiveList = await j2Api.send({method: 'GET',
  url: '/api/chat/sessions?version=2&archived=true&limit=100'})
console.log(j2ArchiveList.data.sessions.some(s => s.id === j2SessionId)) // true
var j2Restored = await j2Api.send({method: 'PATCH', url: j2Path,
  headers: {'If-Match': j2Archived.data.etag}, data: {archived: false}})
```

The list is paginated; if your workspace has over 100 archived sessions, follow
next_cursor or verify the session by its direct detail endpoint.

Check a nonexistent operation using GET, which never invokes AI:

```javascript
try {
  await j2Api.send({method: 'GET', url: j2Path + '/operations/' + crypto.randomUUID()})
} catch (error) { console.log(error.response?.status, error.response?.data.error) }
// 404 not_found; no message/claim and no provider invocation.
console.log((await j2Api.send({method: 'GET', url: j2Path + '?version=2'})).data.messages.length) // 0
```

For privacy, sign into the second test account in another browser and request the
same session UUID using that browser's authenticated transport: expect 404 even
if that member is an admin. A viewer may read only conversations that it already
owns, and receives 403 for PUT/PATCH/POST operations. Do not change real roles to
manufacture this check.

Finish by archiving the synthetic session with the latest ETag:

```javascript
await j2Api.send({method: 'PATCH', url: j2Path,
  headers: {'If-Match': j2Restored.data.etag}, data: {archived: true}})
console.log('Archived synthetic session:', j2SessionId)
```

There is deliberately no hard-delete API. Keep its UUID if you later want separately reviewed exact-row
cleanup. Shortening and operation recovery are exercised through the tests; there
is no public assistant-seeding endpoint for preparing a manual shortening example.

## 5. Database work for later phases — prepare, do not execute early

| Phase | What will need verification | What to prepare now |
| --- | --- | --- |
| J.3 | Implemented and tested with synthetic provider/real SQL. Paid-provider behavior still needs separately approved smoke. | No ai_run pre-insertion or schema change. Reuse existing synthetic test target if code changes. |
| J.4 | Implemented; synthetic Chrome UI checks pass and owner reported positive multiple-browser use. Full live foreign-creator/admin/workspace/role denial remains a separate gate. | Existing test accounts and explicit selected persona. No extra SQL or migration. |
| J.5 | Implemented; scoped real SQL and synthetic provider request tests pass, including revisions, original-task boundaries, Unicode limits and foreign-session exclusion | Optional owner UI follow-up review; no embeddings, vector extension, summary table or migration. |
| J.7 | Automated regressions, real independent-connection/process interruption tests and synthetic PNG export passed. Remaining live identity/provider/runtime gates are recorded separately. | Existing test identities, actual Render worker/start-command and proxy timeout settings, and separate paid-call approval/budget before agent-run paid smoke. |

Do not alter schema, seed real content, pre-create ai_run rows, add revoked_at,
change roles/grants, or run paid generation in advance. If the preflight shows a
permission/schema mismatch, share the metadata first so an exact fix can be reviewed.
Actual server/proxy timeouts must be confirmed from the runtime/hosting setup;
Neon queries cannot establish them.
