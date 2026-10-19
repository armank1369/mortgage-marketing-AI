# Step J implementation and testing record

Updated: 2026-10-18 (America/Los_Angeles).
Contract: [STEP-J-v1](STEP_J_APPROVED_PLAN.md).
Current phase: **J.2 implementation, isolated tests and five live PostgreSQL tests
complete; awaiting owner review before J.3**.

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

## Remaining verification and approval gates

- J.3-J.5/J.7 implementation has not started; J.6 Save Draft remains deferred.
- Owner metadata supports current schema/grants and five targeted live SQL tests
  passed on the configured connection. Continue verifying the intended branch before
  future live writes; database name alone cannot identify a Neon branch.
- Extend real SQL coverage for J.3 ai_run/provider orchestration and later recovery
  paths; J.2's five tested cases are not blanket acceptance of future implementations.
- Live Auth/multi-account/two-browser acceptance remains unverified.
- Actual server/proxy timeout compatibility with synchronous calls is unverified.
- Paid provider usage/output/cache/export checks need separate explicit approval.
- Existing soft-revocation lifecycle, image advisory cleanup, Calendar copy and
  long-disclosure PNG layout limitations remain separate outstanding work.
- Any DDL, fixture writes/cleanup, paid calls, commit/push/merge/deployment needs
  separate authorization. No new Neon branch or historical import.

## Next checkpoint / resumption

Review J.2 implementation, metadata results and the five passing live SQL checks.
No need to repeat the successful commands or set a persistent test URL just for
this completed run. No UI clicks or paid calls are needed to repeat J.2's SQL tests.

After owner approval, start J.3 only on this branch. Recheck refs/worktree; preserve
the expected J.2 changes. Review extraction parity before generation orchestration.
Do not begin frontend changes or paid smoke automatically. Keep subsequent phase
evidence here rather than scattering status across historical handoffs.
