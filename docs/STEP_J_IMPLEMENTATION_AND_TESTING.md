# Step J implementation and testing record

> Access-policy update: [Workspace chat sharing](WORKSPACE_CHAT_SHARING.md) supersedes creator-private chat access and creator-only recent-idea retrieval described below. Existing same-workspace chats are shared; historical test results remain historical.

Updated: 2026-10-18 (America/Los_Angeles).
Contract: [STEP-J-v1](STEP_J_APPROVED_PLAN.md).
Current phase: **J.5 implementation and J.7 automated finalization complete;
remaining live acceptance gates open**.

Final sweep: the owner reported working behavior after J.5 and requested a last
code/documentation review, excluding UI redesign. The current reference is
[STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md](STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md).
Latest sweep results/fixes are recorded below; earlier counts remain historical.

Combined-run authorization: after reporting successful multiple-browser persistence
testing, the owner approved implementing J.5 and running J.7 in the same run, with
testing sequentially against the finished implementation. Save Draft (J.6) stays
deferred. The owner reported visual dissatisfaction; UI redesign remains separate.
Routine command/script tests are the agent's responsibility; manual UI review is
the owner's preference. Existing synthetic-development-fixture testing/cleanup
authorization persists; no paid calls, DDL, publishing or deployment is authorized.

Combined-run baseline: branch was clean at `d50a52303152b532d86f6df3f326c82dc1426dd4`
(local and remote); integration remains `0f59617be5b1eb1c7487f523a48ed78a4c58767c`.
J.5 captures context inside the claim/session lock through an internal callback,
stores versioned message projections/IDs in request generation_input, and passes
history only to durable chat generation (both campaign calls); stateless/media
paths remain separate. Focused tests, real scoped SQL/interruption checks,
frontend/browser regression and Markdown finalization have passed/completed.
Runtime/proxy timeout settings and real cross-account browser denial are still
unverified; do not silently claim these gates passed or make paid calls.

## Authorization and baseline

Owner explicitly requested implementation of the reviewed plan. That authorizes
J.1 and its feature branch/documentation/isolated tests; the plan explicitly requires
stopping at each phase boundary. No live writes, paid calls, DDL or Git publishing
were authorized by this phase.

Fresh `git ls-remote` verification against GitHub:

| Ref | SHA |
| --- | --- |
| Remote luciev2_newteam | 0f59617be5b1eb1c7487f523a48ed78a4c58767c |
| Remote codex/step-i-context-resolver | 0f59617be5b1eb1c7487f523a48ed78a4c58767c |
| Initial HEAD on codex/step-i-context-resolver | Same |

Initial working tree was clean. Created `codex/step-j-chat-persistence` from that
exact SHA; no merge, reset, commit or push. Used per-command Windows schannel TLS
backend for remote verification; did not disable certificate verification or change
global Git configuration. The stale local luciev2_newteam branch was not used.

## J.1 changes

- Saved the approved execution contracts, endpoint/schema mapping, operation state
  machine, security/product behavior, phase dependencies, acceptance and stop gates.
- Added a JSON catalog of six synthetic response families for future persistence
  tests: text, posts, clarification, campaign, video and social-image specification.
  These are illustrative contract fixtures, not seeded records, executable tests,
  comprehensive output validation, or legal/publication approval.
- Created this single ongoing evidence record. No application code, tests,
  requirements, lockfiles, environment configuration or migrations were changed.

## Fresh isolated regression baseline (observed, not historical)

Commands ran from repository root using existing installed dependencies.

| Command | Observed result |
| --- | --- |
| `.\server\venv\Scripts\python.exe -m pytest server/tests -q` | Exit 0: **363 passed, 20 skipped**, 31.53 seconds |
| `npm --prefix client test` | Exit 0: **69 passed**, 0 failed/skipped, about 27.18 seconds |
| `npm --prefix client run lint` | Exit 0: three existing Fast Refresh warnings |
| `npm --prefix client run build` | Exit 0: Vite 8.1.5, 2213 modules, 23.41 seconds; plugin timing and large-chunk warnings |
| `git diff --check` | Exit 0; tracked baseline unchanged |
| Read-only artifact validation with existing Python | Passed: JSON parse, exactly six response families, v1 envelopes, separate flags, linked artifact existence, final newline/trailing-whitespace checks on all three new files |

Final status contains only the three new documentation/fixture files. Because they
are untracked, the explicit artifact whitespace check supplements git diff --check.
Fixture validation did not exercise a future application serializer or live service.

Lint warning locations: ContentBriefCard.jsx:102, socialImage/templates.jsx:5,
socialImage/theme.jsx:2. Build's main JS bundle was 1,403.86 kB minified; no unrelated
bundle/lint cleanup was attempted. All baseline checks passed; no failures to fix.

These fresh counts supersede historical pre-hotfix counts for this local baseline.
The 20 integration skips are not passes. Default pytest fixtures forbid live pool
connections; live integration requires explicit opt-in and an approved target.
Generation route fixtures inject a mock provider; frontend SSR injects synthetic
transport and does not run an authenticated application. No paid calls or live
database writes occurred. Build/test caches and ignored build output may change.

## J.2 authorization, changes and verification

The owner reviewed J.1 and explicitly authorized J.2, requested feature-testing
instructions and asked for database preparation across later phases. At resumption
HEAD was `adb4bcb54922b82ab57781bce2c5a67245472432` ("Step J implementation 1").
That pre-existing commit contains only the three J.1 artifacts; application code
still matches the approved `0f59617` baseline. Both remote integration/Step I refs
remain at `0f59617`. Worktree was clean. No baseline/security divergence required
replanning; this session did not create that commit or publish anything.

Implemented:

- `services/chat_contract.py`: strict action/metadata validation, limits, canonical
  input hashes, metadata ETags, cursor encoding, UUID/time projection and private
  claim-token redaction. Stale running operations are presented as uncertain without
  modifying state or transferring dispatch rights.
- `repositories/chat_persistence_repository.py`: short creator-scoped transactions,
  refreshed member capability checks, idempotent session creation, paginated v2
  history, metadata preconditions, archive/restore, durable request claims, typed
  synthetic completion, safe failure/progress state, explicit abandonment/retry
  fencing and deterministic immutable shortening. Full disclosure suffix and flags
  survive shortening; provenance links must remain in the authorized session.
- `services/chat_http.py` and app route adapters: v2 reads, PUT/PATCH, shorten,
  operation status and explicit abandonment. Private responses/errors use no-store.
  Legacy session shapes remain available; rich fields and stable ordering are added.
- `chat:write` for owner/admin/developer/member, not viewer. Existing legacy initial
  creation now refreshes chat:create inside its transaction and enforces text/body
  limits. No role bypasses creator ownership.
- Provider-backed HTTP submissions validate guards/ownership then return
  **501 durable_generation_not_ready**, with no running claim or model invocation.
  J.3 supplies the real dispatcher. Completion remains internal; no public synthetic
  assistant insertion route was introduced. No ai_run/provider integration yet.
- Added original_request_id as internal same-session provenance across revision
  chains. This uses existing JSONB and requires no migration. Clarification stores
  structured answers; follow-up prompt composition belongs to J.3.
- Added real PostgreSQL integration tests, initially left opt-in and unexecuted. Concurrency
  cases hold two connections through a barrier, check distinct server PIDs and use
  local lock/statement timeouts. No mock claims of real SQL concurrency verification.
- Added [testing/advance preparation guide](STEP_J_TESTING_GUIDE.md) and
  [read-only Neon metadata script](STEP_J_DATABASE_PREFLIGHT.sql). No script was run
  against Neon. Authorization matrix and frozen plan record the J.2 API boundary.

Observed J.2 checks:

| Command/check | Result |
| --- | --- |
| Focused J.2 repository/routes/contracts plus Step G private/authorization tests | **114 passed**, 2.56 seconds |
| Full `python -m pytest server/tests -q` using server venv | **453 passed, 25 skipped**, final run 4.32 seconds |
| `git diff --check` and explicit untracked-source checks | Passed; only Git's existing CRLF normalization notices |
| Live PostgreSQL tests | Initially skipped; subsequent authorized targeted run: **5 passed**, 34.79 seconds (see below) |
| Frontend tests/lint/build in J.2 | Not rerun: no frontend/dependency change; J.1 observed results remain above |

An initial compatibility run found three old member mocks missing the newly queried
role/environment and the route inventory missing the new endpoints. Fixtures and
inventory were updated to the stronger contracts; final focused/full tests pass.
No capability fallback was added to make incomplete mocks authorize access.

New tests cover all six fixture types, source/provenance privacy, viewer and
admin-vs-creator policy, role/removal/revocation changes, input limits/injection,
claim/commit/response rollback, same-key replay/body conflict/busy status, uncertainty
acknowledgement, abandoned-worker fencing, failure status without assistant text,
ETag/archive/restore, pagination/ties, immutable shortening and clarification answers.
The in-memory SQL adapter verifies application invariants only; it does not execute
PostgreSQL or establish locking behavior.

At the initial J.2 checkpoint no live database tests had run. The follow-up below
records the subsequent synthetic SQL writes/cleanup explicitly. Normal ChatPage
remains local until J.4. No DDL, paid provider call, commit, push, merge, deployment,
environment-file or dependency change was performed.

### Follow-up: owner metadata and live PostgreSQL acceptance

The owner supplied Neon SQL Editor metadata plus successful local checks (114 focused
passes; full 453 passes / 25 skips). BEGIN and COMMIT correctly returned no result
rows. The SQL Editor reported PostgreSQL 18.6, neondb_owner, read committed and SQL
statement_timeout=0. This SQL timeout does not establish HTTP/proxy/provider timeouts.

Reviewed all 47 supplied column records and 49 constraints: column names, types and
nullability match the supplied snapshot; constraint names for the three queried
tables match. The expected client-key index, unique ai_run response index and parent
update trigger are present. The reported role has public schema usage and table
SELECT/INSERT/UPDATE/DELETE access. RLS remains disabled and the role has BYPASSRLS;
creator/workspace isolation continues to depend on the Flask/repository predicates.
The SQL metadata alone does not independently identify a Neon branch or certify all
future run/output behavior.

The owner's first targeted integration attempt stopped during fixture setup because
LUCIE_TEST_DATABASE_URL was absent; no database connection/write occurred in that
attempt. The owner asked the agent to handle self-contained tests after attempting
the documented synthetic suite. This was treated as authorization to rerun that
exact five-test suite, including its documented temporary records and cleanup, using
the existing configured development connection. No broader database activity was
inferred from that authorization.

Agent rerun: set LUCIE_TEST_DATABASE_URL and DATABASE_URL only in the pytest child
process from existing local configuration, without displaying credentials or editing
.env. Ran only:

```powershell
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_integration.py --run-integration -m integration -q
```

Observed: **5 passed in 34.79 seconds**, exit 0. Fixture teardown completed, deleting
only the newly generated synthetic test workspaces/dependent records. No AI provider
was invoked. Cases exercised duplicate and competing claims with distinct PostgreSQL
backend PIDs, real completion rollback, immutable shortening, uncertain replacement
fencing, ETag/archive/restore and another admin member's creator-private denial.

These five live checks establish the tested J.2 SQL paths, not full Neon Auth or
cross-device browser acceptance, production readiness, legal output, J.3 ai_run
integration, or complete Step G soft revocation. The earlier 25 skips remain an
accurate result of the default isolated command; they were not retrospectively
converted into passes. No application source changed during this follow-up.

Owner preference: perform self-contained local checks directly rather than asking
the owner to repeat them. Preserve phase gates and separately scoped live/paid actions.

## J.3 generation service and durable orchestration

The owner approved J.3 after J.2's passing SQL checks and asked the agent to perform
routine tests directly. Initial worktree was clean on codex/step-j-chat-persistence
at pre-existing commit `517cd3d7742dc40513fb15fb9643a2d67e35394c` ("J.2 implementation").
Remote Step J matched this commit; integration remained at `0f59617`. No commit or
push was made by this implementation session.

J.3a extraction:

- Moved 54 existing policy/helper definitions from app.py into
  `services/generation_policy.py`. AST comparison against `517cd3d` confirmed every
  moved definition exactly matches the baseline. app.py re-exports the historical
  helper names for existing tests/callers.
- Added `services/generation.py` with injectable chat/video/image generation and
  no Flask/database dependency. Legacy stateless routes are thin compatibility
  wrappers; the actual prompts, parsing, disclosure/compliance and output types
  are shared with durable generation. No model/SDK/dependency upgrade.
- Full existing backend suite after extraction: **453 passed, 25 skipped**, 9.85s.

J.3b implementation:

- `repositories/generation_operation_repository.py` provides authorized replay
  preflight before config lookup, stored-source task projection, per-invocation run
  insertion, atomic response/final-run completion and safe failure classification.
- `services/generation_operations.py` coordinates preflight, fresh Step I context,
  committed request claim, committed run, provider invocation outside transactions,
  post-compliance completion and bounded save-only retry. No queue/background job,
  browser-authoritative assistant insert, cross-chat context or implicit model retry.
- Each provider stage refreshes membership/role/creator/claim authorization. A stage
  cannot be claimed twice or advanced without the prior in-memory provider result.
  Campaign preflight gets its own run; only the final producing call links the
  assistant response. Runs store actual available model/usage/cache counts/latency,
  code-controlled prompt version and canonical system-block SHA-256, not raw prompts.
- Configured the shared lazy Anthropic client with max_retries=0 and timeout=120s.
  This affects both durable and compatibility endpoints. Tests mock the client;
  no actual Anthropic request was authorized or performed.
- Same-key replay returns stored running/completed/failed/uncertain status without
  re-reading obsolete persona/brand or invoking the provider. Claim/run commit
  uncertainty grants no dispatch rights. Save acknowledgement loss retries only
  persistence of the same in-memory output, at most twice; no regeneration.
- Provider timeouts/connection ambiguity/server ambiguity stay operation `unknown`;
  corresponding ai_run stays `started` with safe classification. Known rate limits,
  provider rejection and invalid output produce failed states. No non-schema run
  status was added. Failure text is limited to code-controlled classifications.
- Persona snapshots use the actual resolved generation context. Existing request
  JSONB stores server-derived generation_input, preserving clarification answers
  through regeneration. Media uses same-session stored publication fields and
  prior image specification; parent messages remain immutable.
- Added validation that rejects empty/truncated/empty-post outputs instead of saving
  false success. Existing compliant text fallback for malformed campaign JSON remains.
  This is a narrow output-validation refinement; no policy text was changed.
- The operation POST now performs durable generation, replacing J.2's temporary 501.
  Responses: success 200, running 202, known rate limit 429, other known failure 502,
  uncertainty 503, abandoned 409. Location identifies the read-only status endpoint.
  No claim tokens are returned. Step J.4 will implement the durable browser flows.

Verification:

| Check | Observed result |
| --- | --- |
| Full isolated backend suite after final behavior changes | **481 passed, 32 skipped**, 3.91s |
| Targeted J.3 unit cases (included above) | 28 cases covering actual service/policy with fake SQL/provider, including guarded route replay, error classification and stage fencing |
| Combined J.2/J.3 live PostgreSQL suite, synthetic provider | **12 passed**, 106.83s; five J.2 regressions plus seven J.3 cases; fixture cleanup passed |
| Final J.3 SQL rerun after snapshot/stage guard refinements | **7 passed**, 64.04s; fixture cleanup passed |
| Syntax, extracted-policy AST comparison, new-file whitespace, git diff --check | Passed; Git's existing CRLF normalization notices only |
| Frontend tests/lint/build | Not repeated: no frontend or dependency changes; J.1 evidence remains above |

The new SQL suite tests committed run visibility before dispatch, two-run campaign
accounting, empty/timeout outcomes without assistant insertion, atomic final-run link
rollback with save-only retry, real role downgrade before completion, and duplicate
replay while the first fake provider is waiting. All records belong to newly created
synthetic test workspaces, which the reviewed fixtures clean up. Existing development
brand/persona/customer records are not updated. Credentials were passed only through
the pytest subprocess environment and redacted from captured output.

No migrations, new Neon branch, paid calls, production writes, configuration-file
changes, commits, pushes, merges or deployment. Synthetic database fixture writes
and cleanup were performed within the previously approved testing workflow.

## J.4 durable conversation UI — implementation and verification

Owner explicitly requested: “Ok, proceed with J.4”. This phase preserves the existing
uncommitted J.3 backend changes. Local/remote `codex/step-j-chat-persistence` still
point to `517cd3d7742dc40513fb15fb9643a2d67e35394c`; integration remote
`luciev2_newteam` remains `0f59617be5b1eb1c7487f523a48ed78a4c58767c`.
Read-only remote ref verification used Windows schannel without disabling TLS checks.
No new commit, push, branch or integration merge was performed.

Changed behavior and files:

- Replaced ChatPage's three browser slots with scrollable server conversations,
  paginated history, New Chat, Rename, Archive/Restore and separate read-only Local
  history. Empty composers remain unsaved until first send. The UI no longer writes
  old chat storage keys or calls the stateless generation routes.
- Added `chatPersistence.js` and `useChatPersistence.js`: authenticated scoped API
  calls, ETag edits, stable request/session UUIDs, explicit status reconciliation,
  visibility-aware two-second unresolved-operation polling, focus/reconnect refresh,
  stale scope/selection guards and abort on unmount. Pending identifiers/input are
  saved before creation/dispatch in `lucie_chat_pending:v1:<encoded scope>`.
  Storage failure blocks dispatch. There is no automatic POST or provider retry.
- Added `chatSerialization.js` and `PersistedMessage.jsx`: immutable revision chains,
  previous versions, complete envelopes/flags/persona snapshots and linked nested
  image/video artifacts. Pagination can display an artifact on its own until its
  ancestor is loaded. Future formats have a safe unsupported state. All publication
  payloads remain intact; copy helpers are separate rendering/export projections.
- Adapted ClarificationResponse to submit structured selections/custom text and
  restore actual saved answers. Stable question content preserves unsent choices
  during polling. CampaignResponse/PostsResponse/SocialImageGenerator accept durable
  callbacks and saved artifacts; durable/read-only rendering never falls back to
  stateless generation. Images remain specifications rendered/downloaded locally.
- WorkspaceGate provides advisory role controls through WorkspaceAccess; server
  permissions remain authoritative. Removed the local-preference onboarding gate
  from normal chat so a second browser can read saved conversations immediately.
  Current active persona selection remains explicit; historical labels do not depend
  on current configuration. Existing conversations can shorten without a current
  persona or another session-creation request.
- Failures/unknown outcomes are operation panels rather than assistant messages.
  Unknown replacement/abandonment requires a checked acknowledgement; an unconfirmed
  request can only be deliberately resubmitted using its original key/input. A lost
  reply is reconciled with GET status. Late metadata GETs cannot overwrite saved
  edits, and status outside the latest history page cannot leave the UI busy forever.
- Calendar behavior remains local with stable message batch IDs. No Save Draft,
  historical import, bounded context, new DB contract, DDL, backend change or provider
  policy change was added during J.4. README/authorization/testing documentation now
  distinguish this feature-branch behavior from deployment/live acceptance.

Observed verification (final behavior):

| Command/check | Result |
| --- | --- |
| `npm --prefix client test` | **93 passed**, 0 failed/skipped; 24 new persistence/serialization/actual JSX-rendering cases |
| `npm --prefix client run test:chat-browser` | **Passed**, actual headless Chrome against isolated synthetic transport; no Flask/Auth/Neon/provider |
| `npm --prefix client run lint` | Exit 0; only the three existing Fast Refresh warnings |
| `npm --prefix client run build` | Exit 0; 2217 modules; existing large-chunk warning |
| `.\server\venv\Scripts\python.exe -m pytest server/tests -q` | **481 passed, 32 skipped**, 10.31s; live integration stays opt-in |
| `git diff --check` and untracked-file whitespace check | Passed; existing CRLF normalization notices only |

The synthetic Chrome test is reproducible via `client/scripts/test-chat-browser.mjs`
and `chatBrowserHarness.js`, using the frozen six-response fixture catalog and an
isolated temporary profile. It exercises actual React interactions for send/reload,
shortening/previous versions, archive/restore, nested image/video generation and
revisions/reload, clarification selections/reload, lost reply after synthetic commit,
uncertainty with no automatic redispatch, explicit close, byte-preserved scoped and
unscoped legacy storage, read-only history, >30 conversations, >50 history rows,
account switching, viewer controls and 390px layout. It also runs under React StrictMode.
Desktop/mobile screenshots were captured in the OS temp directory and inspected;
these are synthetic UI evidence, not paid PNG-export or full long-footer acceptance.
Edge's debugging endpoint did not initialize reliably on this machine; Chrome
completed the checks. The runner prefers Chrome and supports `STEP_J_BROWSER`.

No new dependency or lockfile change was required. Browser/network failures during
test-runner development were resolved before the final passing run; unit coverage
also caught/fixed preservation of out-of-page operation status, stale metadata reads,
persona-independent shortening and Unicode-safe automatic titles.

No Neon access/writes, migrations, paid calls, commits, pushes, merges or deployment
were performed during J.4. Existing J.2/J.3 synthetic SQL evidence remains above;
it was not rerun because this phase changed only frontend/docs and test harnesses.

## J.5 implementation / J.7 combined verification

Added `server/services/conversation_context.py`, integrated through an internal
claim callback after ownership/source authorization and under the existing session
lock. Latest completed responses are grouped by original user task, including
clarification/regeneration/shortening provenance. Historical provider messages use
the effective original task and current assistant result, never operational command
labels. Regenerating/clarifying an earlier task excludes that task and later tasks
from general history; the original task remains explicit current input.

At most six logical exchanges and 16 KiB canonical UTF-8 history JSON are retained.
Each historical user/assistant projection is capped at 4 KiB (a conservative user
cap in addition to the planned artifact cap). UTF-8 truncation preserves complete
code points and marks projections; oldest whole pairs are removed first. Saved
publication payloads/flags/disclosures remain untouched. Only allowlisted rich
content fields are projected, with no failed/pending/system/tool/media rows or
foreign conversations. Every SQL join repeats session equality.

The request stores `generation_input.conversation_context` with projection_version,
bounded messages, selected/provenance IDs, exchange links, truncation flag and byte
count. Both campaign calls consume that exact claimed snapshot. Current brand,
persona and compliance remain authoritative; history enters provider user/assistant
messages only. Media and old stateless routes stay separate. The ai_run prompt
version now reads `step-i-policy-step-j5-v1`. Context failures roll back the claim
before any provider invocation; completed replay performs no history/config reload.

Added `test_step_j_context.py` (19 synthetic cases), extended the in-memory SQL
adapter for relational context selection, and added three opt-in context/interruption
integration cases. Extended the Chrome runner to download a real native PNG through
the existing exporter. Updated plan, README, authorization/test guides and wrote
[STEP_J_FINALIZATION.md](STEP_J_FINALIZATION.md). No production UI redesign, schema,
API envelope, dependency, model or compliance-policy change occurred in this run.

Final observed results:

| Check | Result |
| --- | --- |
| `python -m pytest server/tests -q` using server venv | **500 passed, 35 skipped**, 5.58s |
| Focused context cases | **19 passed**, 4.07s; included in full suite |
| `npm --prefix client test` | **93 passed**, 0 failures/skips |
| `npm --prefix client run test:chat-browser` | **Passed**, including native PNG export and all prior J.4 flows |
| Three opt-in Step J SQL suites | **15 passed**, 174.50s; fixture cleanup passed |
| Lint / build | Exit 0; existing three Fast Refresh, bundle-size/plugin timing warnings |
| `git diff --check` / untracked whitespace | Passed; normal CRLF notices only |

The scoped SQL command selected only `test_step_j_integration.py`,
`test_step_j_generation_integration.py` and `test_step_j_context_integration.py`,
with `--run-integration -m integration -q`. It reused the previously approved
development connection only in subprocess environment variables; credentials and
host were redacted from captured output, with no persistent .env change.

New real SQL evidence covers snapshot IDs/projection fidelity, current revision and
original-task cutoffs, separate-conversation exclusion and denial to another creator
with admin role. A separate Windows-spawned worker is terminated after its fake
provider dispatch begins; the committed request/run survives, same-key running and
unknown replays do not invoke a provider, and only acknowledged replacement creates
new output. The test ages only its own fixture progress timestamp to avoid a
five-minute wait. Another real race abandons a campaign after preflight and fences
the second provider stage. All writes/cleanup remain inside new fixture workspaces;
existing customer/workspace configuration was not modified.

Visually inspected `step-j7-native-image.png` in the OS temporary directory at
1080×1080: the pull_quote image shows the full synthetic license/equal-housing footer
and supplemental disclosure line. No AI request was needed. This does not establish
all templates, maximum-length footer layout or actual provider output quality.

No paid calls, DDL, migrations, new Neon branch, historical import, commits, pushes,
merges or deployment. Development PostgreSQL fixture writes/cleanup occurred within
the existing approved workflow. Local HEAD and both remote refs remained at the
verified starting values; this run's changes remain uncommitted.

## Post-acceptance code/documentation sweep

Started from a clean tree on local/remote `codex/step-j-chat-persistence` at
`2984c1ce0220a4bc6c2ae13667a4d18b9cdd6314`; integration remote remained
`0f59617be5b1eb1c7487f523a48ed78a4c58767c`. The owner made that intervening
commit; this sweep did not commit, push, merge or deploy.

Review found and fixed:

1. An earlier reply cleared a newer draft typed during generation. ChatPage now
   clears only the submitted text. The real Chrome fixture holds a response while
   typing a different draft and verifies that draft survives.
2. A large offline backlog could merge disjoint history pages while retaining an
   old cursor, leaving intervening messages unreachable. Refresh now restarts at
   the latest page when fetched page IDs do not overlap prior fetched history.
   Ordinary overlapping refreshes retain loaded earlier history.
3. Late detail/status responses could regress a newer saved result to running.
   Detail reads are ordered/fenced, and terminal operation states cannot regress
   under delayed running/unknown replies. Added focused race regressions.
4. Frontend metadata/busy errors used labels different from backend codes. They now
   recognize precondition_failed and operation_in_progress.
5. A stale browser could generate a second initial artifact from the same parent
   and target, bypassing linked revision rendering. Repository source validation
   now returns stale_source before dispatch once the same media type/target exists.
   Types/items remain independent. Previously saved sibling attempts are exposed
   under previous versions without changing stored historical data.
6. Campaign carousel image input used only the caption. It now loads the stored
   slides, matching the original image flow; video caption behavior is preserved.
7. Valid shortening/image revision chains stopped after an arbitrary depth of 20.
   Iterative same-session provenance traversal now detects cycles rather than
   rejecting long valid chains. Tests exercise 25 shortened versions and 23 image
   attempts, with no real provider call.
8. Reading active work transferred all completed requests, including copied context
   projections. Unresolved-operation SQL now filters running/unknown rows before
   transfer; no new index/table/DDL. The in-memory adapter and real SQL both cover it.
9. Parallel SSR-only Vite tests could compete for a WebSocket port even with HMR off.
   Their installed-runtime-supported ws:false setting removes the unneeded listener.

Documentation: added the full feature/operations reference covering user behavior,
ownership/capabilities, every API/action/limit, metadata ETags, recovery/billing,
payload/database mapping, revision/media behavior, storage/context budgets, source
traversal, all approved decisions/deferred features, code map, testing and live gates.
README now starts with Step J, includes a current Step J status section, and labels
prototype PDFs/historical instructions. Plan, authorization matrix, testing guide
and finalization now acknowledge owner J.5 testing and the final review. No UI
appearance redesign was included.

Latest observed verification:

| Check | Result |
| --- | --- |
| Full backend isolated suite | **505 passed, 36 skipped**, 5.34s |
| Full frontend suite | **97 passed**, 0 failures/skips; no WebSocket-port conflict on final run |
| Synthetic Chrome browser/export | Passed, including newer draft preservation and all prior durable flows |
| Three approved opt-in SQL suites | **16 passed**, 185.90s; reviewed fixture cleanup passed |
| Focused current-code SQL media rerun | **1 passed, 3 deselected**, 24.70s; fixture cleanup passed |
| Lint/build | Exit 0; the same three Fast Refresh and large-bundle warnings |
| Whitespace/document links | Checked at completion; no new broken relative file references or whitespace issues |

Only fresh synthetic fixture workspaces were written/cleaned using the same approved
development target and secret-redacted subprocess environment. No existing customer
or configuration records were modified. No paid calls, migrations, new Neon branch,
dependency changes, Git publishing or deployment. No owner-run SQL or routine script
repetition is needed.

## Post-J.5 incident: history contamination and malformed output (2026-10-21/23)

**What happened.** In a shared conversation that already held an *unanswered* clarification, a second
workspace member sent "Give me a post idea for a first-time homebuyer tip". Instead of interactive
clarification cards, Lucie saved and showed an ordinary AI Response beginning `Saved clarification:`
followed by `question:` / `options:` / `type:` / `allow_custom:` lines, plus the normal compliance footer.
Repeating the request produced correct cards, and answering them produced a valid post.

**Why it was possible (two mechanisms, both confirmed with a mocked provider).**
1. *Context contamination.* `project_artifact()` replayed earlier clarifications to the model as
   assistant history in the form `Saved clarification:` + `key: value` lines. Only the latest result of
   each original task is replayed, so an **unanswered** clarification (e.g. the campaign questions) stays
   in history while an answered one is replaced by its final posts/campaign. The model copied that layout
   (even adding `type:` lines the projection never wrote) instead of returning the required JSON.
2. *Silent fallthrough.* `generate_chat()` tries clarification JSON, then posts JSON, then falls back to
   plain text. Malformed clarification-like text matched neither parser, so it was compliance-normalised
   and saved as a successful `text` message.

**Not a sharing/authorization defect.** The same history is built for the creator and for any authorized
member, and the tests below run both identities through identical assertions. Workspace chat sharing,
membership checks and role gates were not touched.

**Changes.**
- `server/services/conversation_context.py`: clarifications are now projected as a labelled prose summary
  ("Earlier assistant turn: Lucie asked ... which have not been answered. ... not an output format to
  copy.") that keeps each question, the choices offered, multiple-choice and custom-answer support, and
  carries no `key: value` lines. `Saved posts:` / `Saved campaign:` projections are unchanged (existing
  contracts). `looks_like_leaked_history()` is added beside the formatter that defines the labels.
  `PROJECTION_VERSION` stays 1; previously captured snapshots are immutable and are not rewritten.
- `server/services/generation.py`: before the plain-text fallback, output that opens with a
  `Saved posts|campaign|clarification:` label, or with a bare `question:` ... `options:` layout, raises the
  existing `InvalidGenerationOutputError`. The operation fails with `invalid_provider_output`, no assistant
  message or success run is stored, and there is no automatic retry. When history is replayed the system
  prompt also states that stored summaries are not an output format.

**Plain text is preserved.** Only output that *starts* with an internal label or the bare structured layout
is rejected. Ordinary answers, and educational replies that merely mention "Saved clarification:" or show
a question/options example after prose, still save as text (tests cover both).

**Regression tests.** `server/tests/test_history_contamination.py` (22 cases, run for the creator and a
second member where relevant): incident chat assembly (completed clarification, then unanswered campaign
clarification, then the repeated request); history shape and preservation of question/choice text;
non-mutation of stored rows; four malformed variants (exact incident text, unlabelled layout, `Saved posts:`,
case/whitespace) failing safely with one provider call and no saved assistant message; malformed campaign
output; valid clarification JSON; valid carousel posts with footer compliance; plain-text answers.
Before the fix 11 of these failed (malformed output saved as `succeeded`; clarification replayed in the
copyable layout); after the fix all pass.

**Results (2026-10-23, synthetic data only).** `pytest server/tests`: 554 passed, 37 skipped (opt-in live
database suites), 0 failed. `npm --prefix client test`: 113 passed. Lint clean; client build succeeds.

**Known limits / not verified.** No live Anthropic call and no Neon integration run were made, so the
real model's behaviour after the change is unobserved; the guarantee is only that malformed output is
rejected instead of misreported as success. A user who sees `invalid_provider_output` must retry
manually (one more paid call). A genuine plain-text answer that itself opens with `question:` +
`options:` lines would be rejected (judged unlikely). The earlier malformed message stays stored and
exportable exactly as saved. Strengthening non-campaign output with a provider `json_schema` was not done:
that path legitimately returns clarification JSON, posts JSON *or* prose, so a single schema would be a
larger redesign; treat it as follow-up.

## Remaining verification and approval gates

- J.4 was accepted after owner multiple-browser/UI testing. J.5 and J.7 automated
  work and the requested final sweep are complete; owner also reported positive
  J.5 testing. Live/release acceptance below is still open. J.6 stays deferred.
- Owner metadata supports current schema/grants and five targeted live SQL tests
  passed on the configured connection. Continue verifying the intended branch before
  future live writes; database name alone cannot identify a Neon branch.
- J.3 adds seven real SQL orchestration cases with a fake provider; these do not
  establish paid-provider timing, billing guarantees or all future recovery paths.
- Owner reported positive normal UI/multiple-browser persistence. The full live
  Auth/cross-account/viewer/workspace/revocation matrix remains unverified; SQL
  admin-denial and synthetic browser controls are separate evidence.
- Actual server/proxy timeout compatibility with synchronous calls is unverified.
- Paid provider usage/output/cache/export checks need separate explicit approval.
- Existing soft-revocation lifecycle, image advisory cleanup, Calendar copy and
  long-disclosure PNG layout limitations remain separate outstanding work.
- DDL, writes outside the approved synthetic fixture workflow, paid calls and
  commit/push/merge/deployment need separate authorization. No new Neon branch or import.

## Next checkpoint / resumption

Review [finalization](STEP_J_FINALIZATION.md) and the testing guide's short J.5 UI
checklist. No additional owner-run Neon SQL or repeated PowerShell checks are needed.
Before agent-run paid smoke, verify actual Render worker/start-command and proxy
timeout settings, then approve a bounded provider-call budget. Finish real identity
negative cases with existing synthetic/test accounts; do not provision memberships
implicitly. Track the owner's UI appearance feedback separately.

Do not restart J.5, implement Save Draft or auto-publish. Preserve this run's expected
uncommitted changes. Further work follows owner review of remaining acceptance or
a separately authorized UI refinement. Keep later observations in this same record.
