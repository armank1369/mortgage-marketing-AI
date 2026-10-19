# Step J frozen execution contract — STEP-J-v1

Status: plan approved by the owner's explicit implementation request on 2026-10-18
(America/Los_Angeles). Execution remains phase-gated. J.1 was completed and the
owner subsequently approved proceeding with J.2, including test guidance and
database preparation, followed by explicit approval to implement J.3 and J.4.
After J.4 acceptance, the owner explicitly combined J.5 implementation and J.7
verification in one run, preserving separate external-action approvals and deferring
J.6. Earlier DRAFT/UNAPPROVED labels in the quoted
proposal are superseded by that request, not by automatic approval of later gates.

Baseline: `0f59617be5b1eb1c7487f523a48ed78a4c58767c`.
Branch: `codex/step-j-chat-persistence`.
Progress and observed results: [implementation record](STEP_J_IMPLEMENTATION_AND_TESTING.md).
Synthetic contract examples: [fixture catalog](fixtures/step_j_v1.json).

## 1. Scope and decisions

Deliver creator-private durable chats, immutable output revisions, persisted video
briefs/social-image specifications, and bounded same-conversation context. Replace
the three-slot layout with a scrollable conversation list and Archive view.
An uncertain paid outcome requires a deliberate new attempt with acknowledgement;
never automatically repeat the provider call. Save Draft (J.6) is deferred.

Reuse Step I generation context, prompts, compliance, explicit active persona UUIDs,
and one-hour provider caching. Reuse Step G identity/membership/creator isolation.
No initial DDL, new Neon branch, RLS rollout, ownership backfill, seed, historical
import, SQLite revival, RAG, cross-chat memory, calendar synchronization, or hosting
change. No generic browser assistant-message insertion endpoint.

References: STEP_I_CONTEXT_CONTRACT.md, STEP_I_IMPLEMENTATION_AND_TESTING.md,
STEP_I_COMPLIANCE_PATCH.md, AUTHORIZATION_MATRIX.md,
STEP_G_IMPLEMENTATION_AND_TESTING.md, STEP_G_REVOCATION_PROPOSAL.md,
STEP_H_HOTFIX_FINALIZATION.md, STEP_F_DATA_LAYER_AND_TESTING.md and README.md.
The supplied Step J schema snapshot establishes metadata only, not runtime grants,
data, operational correctness or the configured database target.

## 2. HTTP contracts (to implement in later phases)

All routes retain verified JWT and selected-workspace resolution. Existing stateless
`/api/chat`, `/api/video-brief`, `/api/social-image` remain compatibility wrappers
around shared generation functions, with existing response shapes. Do not call
these HTTP routes internally or duplicate prompt/compliance code.

| Endpoint | Contract |
| --- | --- |
| PUT /api/chat/sessions/{client_uuid} | Idempotently create empty owned session with title/persona_id. Existing owned ID returns current row without overwriting. Foreign collision: generic 404. |
| POST /api/chat/sessions | Preserve legacy initial-message behavior and shared validation. New UI does not use this non-idempotent creation path. |
| GET /api/chat/sessions?version=2&archived=false&limit=30&cursor=... | `{sessions,next_cursor}`; descending `(updated_at,id)`; max 100. Unversioned list retains array shape. |
| GET /api/chat/sessions/{id}?version=2&limit=50&before=... | Session metadata, latest message page, older-history cursor, operation status. Display ascending `(created_at,id)`; max 100. |
| PATCH /api/chat/sessions/{id} | Only title/default_persona_id/archived; If-Match metadata ETag required; return metadata/new ETag. |
| POST /api/chat/sessions/{id}/operations | Submit typed operation with stable operation_key. |
| GET /api/chat/sessions/{id}/operations/{key} | Status and committed response; never invoke provider. |
| POST /api/chat/sessions/{id}/operations/{key}/abandon | Explicitly close uncertain operation with acknowledgement; no provider call. |

Metadata ETag: opaque hash of canonical title, selected persona and archive state,
evaluated under session lock. It is not a message-history version.

Operation request fields:

```text
operation_key: UUID
action: send | clarify | regenerate | shorten | video | social_image
persona_id: explicit UUID for provider-backed actions
message: required for send
source_message_id: required for source-based actions
target: optional {collection: posts | content_calendar, index: nonnegative integer}
answers: structured clarification selections/custom text
retry_of: optional prior operation key
acknowledge_uncertain_outcome: required for uncertain replacement
```

Load source content from the authorized session; never accept replacement assistant
payloads. Validate source type, index, current revision and same-session request/source
links. Server owns author, role, status, normalized output and compliance flags.
Titles: 1–200 characters; user/combined clarification input: 16,000 characters;
operation body: 128 KiB. Unknown fields/type mismatches: 400; foreign/missing records:
indistinguishable 404; stale revision/busy/key-body mismatch: 409 with stable code;
stale metadata: 412; missing precondition: 428; outages: sanitized 503.
Private conversation/status responses: `Cache-Control: no-store`.

Historical J.2 boundary: provider actions returned 501 without claiming/dispatching.
J.3 replaces that temporary boundary with actual durable provider orchestration.
Manual provider-backed POSTs now incur paid calls when configured; tests inject a
fake provider. GET history/status and deterministic shortening do not invoke AI.
Internal `original_request_id` provenance in v1 envelopes preserves the original
user task across revision chains; it is checked against the same session.
J.3 also stores server-derived `generation_input` in existing request JSONB so
regeneration preserves clarification answers and media uses its authorized stored
publication source. Historical persona snapshots reflect the resolved context used
for generation, while active-persona validation is repeated at claim time.

POST results: 200 succeeded; 202 running; 409 abandoned; 429 known rate limit;
502 other known generation failure; 503 uncertain outcome. The response contains
state, safe_error_code and Location for status reconciliation. GET status remains
read-only/200. Empty/truncated or empty-post output fails rather than becoming a
successful saved draft. Existing compliant text fallback remains for malformed
campaign JSON. Persistence may retry the same in-memory completion twice; it never
repeats the provider to repair a failed save.

## 3. Authorization and operation lifecycle

Add chat:write for owner/admin/developer/member; viewer retains chat:read only.
Creation needs chat:create; metadata/archive/restore/shorten/abandon need chat:write;
provider actions need chat:write AND ai:generate; reads/status need chat:read.
All require creator ownership in the selected workspace, including admins/owners.
Never assign unattributed historical sessions to the current member.

1. Authorize identity, membership, capability and ownership.
2. Check key/input hash for replay before resolving obsolete generation configuration.
3. Validate new action/source/answers and resolve explicit active persona/Step I context.
4. In a short transaction lock membership then session consistently; refresh role,
   ownership and state. Insert request/command plus operation metadata. Only one
   unresolved provider-backed operation per session.
5. Commit claim before dispatch. Uncertain claim commit must be positively reconciled
   before provider invocation; no transaction/connection stays open across the call.
6. Insert/commit ai_run before each invocation. SDK retries disabled; 120-second
   timeout per invocation. No SDK/model upgrade.
7. Apply existing output parsing, validation and deterministic compliance.
8. Recheck authorization and claim ownership; atomically insert assistant output,
   update run/operation metadata and touch parent. Report saved only after commit.

Recheck membership, role and claim before campaign's second call and before returning
newly completed content. Role downgrade/removal prevents subsequent dispatch/completion.
Retain optional revoked_at compatibility; the snapshot has no such physical column.

Recovery transitions:

| Condition | Result |
| --- | --- |
| Same key/body, succeeded | Return saved response; no provider/config rerun. |
| Same key, different body | 409; no call. |
| Same key, running | 202/status URL; another request owns work, not a background queue. |
| Known terminal failure | Stored safe error; new deliberate attempt needs new key. |
| Timeout/connection ambiguity/crash | Unknown outcome, never assert definitely unbilled. |
| Running without progress for 5 minutes | Present uncertain status; no automatic takeover. |
| Explicit acknowledged replacement | Atomically abandon old and claim new; fence old completion/token. |
| Browser abort | Stop local waiting; does not cancel server work. |
| Provider returned, save failed | Reconcile/retry save only while output is available; never regenerate. |

A post-provider/pre-commit crash may lose output. No exactly-once billing guarantee.
No background worker/queue/streaming in v1. Before live acceptance verify actual
server/proxy timeouts support synchronous execution; stop for review if incompatible.

## 4. Existing-schema mapping

No initial migration. Every writer must follow the session-lock protocol; real
PostgreSQL concurrency acceptance is mandatory before release.

- chat_session: verified created_by_member_id, explicit default_persona_id, title,
  archived_at and updated_at. Message inserts must also touch parent recency.
- Request chat_message: plain content/readable command; client_message_key
  `request:{operation_uuid}` uses existing partial unique index.
- Assistant chat_message: `response:{operation_uuid}` completion key;
  request_message_id links its request, source_message_id links immutable source.
- Text output: content_format=plain_text, actual text in content. Rich output:
  content_format=json, valid canonical JSON in content. structured_data is rendering
  authority; compliance_flags is a separate canonical array.
- All server message IDs/timestamps are server-generated. Session ID is the validated
  client UUID for idempotent creation, never proof of ownership.

Assistant structured_data v1:

```text
schema_version: 1
type: text | posts | clarification | campaign | video | social_image
payload: existing normalized response fields minus top-level compliance_flags
persona_snapshot: {id,name,slug}
target: optional immutable source-item locator
render_version: 1 for social-image specifications
```

User structured_data v1 records action, explicit input/answers, canonical input hash,
source/target and server-only operation metadata: state, claim_token, started_at,
last_progress_at, response_message_id, safe_error_code. Allowed operation states:
running/succeeded/failed/unknown/abandoned. Never expose claim_token as browser authority.
Do not reinterpret these as ai_run statuses.

Preserve whole payloads, flags, slides, hashtags, withholding and complete disclosures.
Publication-copy helpers are not serializers. Legacy rows without envelopes remain
readable as text; unknown future versions render unsupported-format state safely.

ai_run: one row per provider invocation, including preflight. Required model,
code-controlled prompt version and canonical system-block hash before insert;
prompt_cache_mode=explicit (not '1h'); actual available usage/latency; safe errors only.
Statuses stay started/succeeded/failed. Successful preflight that proceeds has no
response link; only the final producing invocation links the response (unique FK).
Unresolved attempts may remain started with operation-level uncertainty.
No raw prompt/provider error/credentials in logs. No content_item/campaign/calendar writes.

Stop and propose separate reviewed DDL if invariants or measured query performance
require it; include compatibility/backout. Do not add speculative columns/indexes.

## 5. UI and content semantics

- New chat stays unsaved until first send; persist stable session ID before operation.
- Regenerate uses stored original task and explicit current persona; immutable linked
  alternative, with old output under Previous versions. Reject stale source revisions.
- Shorten ports existing deterministic text operation server-side, preserves exact
  original disclosure/flags, creates revision without provider/ai_run; text only.
- Clarify stores structured selections/custom text linked to clarification; reload
  restores selections and derives submitted state. Server composes original/answers.
- Video/image becomes linked assistant artifact, immutable parent plus validated item
  index. Render attachment without changing parent payload. Image regeneration loads
  prior attempt from server. Persist image spec/render version, not fictitious PNG URL.
- Historical persona snapshots remain; future generation requires an explicit valid
  active selection. Reading never depends on current persona/brand availability.
- Clear archives then opens unsaved composer. Delete becomes Archive with restore.
  Block archive/clear while unresolved until completion or acknowledged abandonment.
- Calendar stays local; stable message IDs remain batch keys. No cross-device promise.
- Separate read-only Local history for scoped legacy chats; preserve scoped/unscoped
  storage keys byte-for-byte; no automatic import/reassignment/deletion.
- New scoped namespace stores pending IDs/input before dispatch. Surface storage
  failures. Reload reconciles GET status, never automatic regeneration.
- Distinct unsent/submitting/running/saved/failed/uncertain states. Provider failures
  are status, not assistant conversation text. No unsaved generation during DB outage.
- Abort/reset on account/workspace switch and reject stale scope/request responses.
  Refresh on focus/reconnect/operation completion. Poll unresolved operations every
  two seconds while visible; stop while hidden or terminal.

## 6. Bounded context (J.5)

Only authorized same-session completed conversation. At most six completed exchanges
and 16 KiB UTF-8 historical projection; max 4 KiB per projected artifact. These are
byte limits, not exact token estimates. Remove oldest complete exchanges first;
mark projection truncation but never change stored publication data. Exclude failed,
pending, system/tool, operational commands and superseded alternatives. Use provider
user/assistant roles, not trusted policy. Current request and explicit action source
remain separate from general history budget. Resolve current brand/persona each call;
persist historical message IDs/projection version for audit. Clarification routing
uses original task, regeneration avoids duplicate original task in history, and
video/image uses its explicit source rather than unrelated history.

## 7. Phase execution and expected files

One phase per run; stop for owner review. No auto-advance.

Owner-approved exception after J.4 acceptance: implement J.5, test it, then perform
J.7 verification/finalization in the same run. No intermediate J.5 approval is
required; this does not authorize DDL, paid calls or Git/deployment actions.

| Phase | Work and expected files | Exit gate |
| --- | --- | --- |
| J.1 | This plan, implementation record, synthetic JSON fixture catalog; full existing isolated regression baseline | Contracts/baseline reviewed before J.2; no application edits |
| J.2 | chat_repository.py, app.py, permissions.py, errors.py; chat contract/service helpers; test_step_j_repository.py and test_step_j_routes.py; authorization matrix | Creation, v2 reads/pagination, ETags, claim/replay/completion/abandonment, links, archive/shorten work with fake output; privacy/rollback reviewed |
| J.3a | app.py and shared generation services; existing Step I tests | Extraction parity without prompt/schema/model changes |
| J.3b | Operation service, ai_run repository, test_step_j_operations.py | Durable orchestration, retry fencing, two-call campaign accounting; no paid calls |
| J.4 | ChatPage; chat API/state/serialization helpers; clarification/campaign/posts/brief/image components; storage helpers; chatPersistence.test.js/chatSerialization.test.js/SSR tests | All typed outputs reload, revisions/archive/local history preserved; fake-provider browser review |
| J.5 | Conversation-context service, generation integration, test_step_j_context.py | Bounded authorized follow-ups; request fixtures reviewed without paid calls |
| J.6 | Deferred | Separate draft ownership/visibility approval required |
| J.7 | Integration/regression tests, implementation record, README/authorization docs | Full regression and separately approved live acceptance; documented remaining gates |

Dependencies: J.1 -> J.2 -> J.3 -> J.4 -> J.5 -> J.7, each reviewed.
The J.5/J.7 review checkpoints are combined by the later explicit owner instruction.

```powershell
# Baseline and final isolated regression (from repository root)
.\server\venv\Scripts\python.exe -m pytest server/tests -q
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
git diff --check
# Later phase-specific checks after files exist
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_repository.py server/tests/test_step_j_routes.py server/tests/test_step_g_private_chats.py server/tests/test_step_g_authorization.py -q
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_operations.py server/tests/test_step_i_routes.py server/tests/test_step_i_compliance.py -q
.\server\venv\Scripts\python.exe -m pytest server/tests/test_step_j_context.py server/tests/test_step_i_context.py server/tests/test_step_i_routes.py -q
```

## 8. Required acceptance and approval gates

Unit/mock and rendering coverage: viewer denies writes, admin cannot read another
creator, foreign workspace/persona/source denied, downgrade/removal during work,
duplicate key replay and changed-body conflict, distinct-key busy conflict, lost
response recovery, uncertain crash and late-worker fencing, two-run campaign,
typed payload fidelity, clarification restore, immutable revisions/shortening/media,
archive/clear/restore, stale scope rejection, legacy key preservation, pagination and
Unicode context budgets. Record exact commands, pass/fail/skip and limitations.

Separately approved synthetic DB acceptance: verified existing development target
and app grants; reviewed fixture creation/cleanup; two independent connections or
processes for claim/race/rollback tests; process interruption with fake provider.
Do not run broad manual persistence scripts or destructive fixtures on shared data.
Two-browser/account checks establish same-user durability and cross-user isolation.
Mock-only SQL assertions do not establish real locking or live Auth behavior.

Separately approve bounded paid smoke across text/posts/clarification/campaign/video/
image, record usage, and inspect full-size exported disclosures. Verify actual
server/proxy timeouts first. No production-readiness claim from mocks.
Track inherited soft-revocation, image advisory cleanup, Calendar copy completeness
and long-footer PNG layout limitations separately; persistence does not fix them.

Further approval is required for Neon writes/cleanup, any DDL, paid calls, commits,
pushes, merges, deployment or historical import. Stop for baseline drift, unexpected
worktree changes, unsafe fixture target, incompatible runtime or material contract
change. Finalization is Markdown; PDF only if separately requested.

Report at each checkpoint: diff summary, exact tests, deviations, unverified gates
and next requested approval. Keep one progress record; never include private content,
auth tokens, connection strings or secrets.
