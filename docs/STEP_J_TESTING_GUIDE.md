# Step J.2 testing and preparation for J.3–J.7

J.2 is a backend/API phase. The normal Chat page still uses its existing local
history and generation routes until J.4. New persistence features cannot yet be
tested by clicking the normal chat buttons. No migration is required for J.2.

## 1. What you can prepare now

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
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_integration.py --run-integration -m integration -q
```

The five tests cover:

- Duplicate same-key claims from independent connections: one winner; saved replay.
- Different simultaneous operations: one winner and one busy conflict.
- Real transaction rollback after response insertion, followed by successful save
  and deterministic shortening that preserves the footer and flags.
- Explicit uncertain replacement fences an old completion, without any paid call.
- Metadata ETag conflict, archive/restore, and denial to another member with admin role.

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

Check the deliberate J.3 boundary using ONLY the new operation endpoint:

```javascript
try {
  await j2Api.send({method: 'POST', url: j2Path + '/operations', data: {
    operation_key: crypto.randomUUID(), action: 'send', persona_id: j2PersonaId,
    message: 'Synthetic education test'
  }})
} catch (error) { console.log(error.response?.status, error.response?.data.error) }
// 501 durable_generation_not_ready; no message/claim and no provider invocation.
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
| J.3 | ai_run required fields/checks; run insertion/completion; two-call campaigns; completion/failure rollback and fencing | Preflight role grants/metadata; approved synthetic fixture target. No run rows need manual pre-insertion. |
| J.4 | Same creator in two browsers reloads typed history; another creator/admin cannot read it; persona/history/archive remain consistent | Existing test accounts and explicit selected persona. UI does not support these flows until J.4. |
| J.5 | Only authorized same-session completed history enters bounded context | Reuse synthetic sessions and large Unicode fixtures; no embeddings, vector extension, summary table or migration. |
| J.7 | Independent-connection/process races, interruption recovery and live identity acceptance; optional paid output/export smoke | Reviewed fixture write/cleanup approval, test identities, runtime timeout settings, and separate paid-call approval/budget. |

Do not alter schema, seed real content, pre-create ai_run rows, add revoked_at,
change roles/grants, or run paid generation in advance. If the preflight shows a
permission/schema mismatch, share the metadata first so an exact fix can be reviewed.
Actual server/proxy timeouts must be confirmed from the runtime/hosting setup;
Neon queries cannot establish them.
