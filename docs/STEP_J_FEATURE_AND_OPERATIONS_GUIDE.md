# Step J — current feature, contract and decision reference

> Current access policy: [Workspace chat sharing](WORKSPACE_CHAT_SHARING.md). UI controls and user-facing steps are in the [UI guide](CURRENT_UI_GUIDE.md); older plans and acceptance records remain historical.

This is the current Step J reference for users, maintainers and future executors,
including the UI hotfixes and workspace sharing. See the [UI guide](CURRENT_UI_GUIDE.md)
for setup controls and the [README](../README.md) for current clone/install commands.
The [approved plan](STEP_J_APPROVED_PLAN.md) records the agreed scope;
the [implementation record](STEP_J_IMPLEMENTATION_AND_TESTING.md) preserves
chronological evidence; [finalization](STEP_J_FINALIZATION.md) records current
acceptance and release limits. Earlier Step F/G/H/I documents and prototype PDFs
are historical context, not instructions to repeat migrations, preflight or seeds.

## 1. Features and user-visible behavior

| Feature | Current behavior |
| --- | --- |
| New Chat | Persona cards → guideline review → explicit confirmation → unsaved local composer. No remote session is created until first Send. A UUID and pending request are stored before dispatch. |
| Conversation list | Scrollable active/archive views; initial 30 sessions, Load more with a cursor. Refresh can return the first page again. There is no three-slot limit. |
| History | Latest 50 messages first, displayed in chronological order; Load earlier retrieves older pages. Read/reopen never generates output. |
| Rename/persona | Title edits use If-Match. Saved persona UUID is immutable; changing/clearing returns 409 persona_locked, same-value patches are harmless. Use a new chat for another audience. |
| Archive / Clear | Workspace-wide reversible archive followed by persona selection for a new unsaved chat. Archive view supports Restore. No hard-delete API. Unresolved work blocks archive. |
| Regenerate | New linked alternative using the stored original task and the chat’s locked persona with current configuration. Old output remains under Previous versions. |
| Make it shorter | Deterministic server operation for plain text, preserving the complete original disclosure and flags. No provider call or ai_run. |
| Clarification | Selected options/custom text become a linked user record. Reload restores choices and submitted state; the server composes original task plus answers. |
| Campaign video | Saved linked assistant artifact for a validated calendar item. Generation/regeneration preserves the original campaign payload. |
| Social image | Saved template/slots/business identity/disclosure/render-version specification. The browser renders and exports PNG locally; Step J does not store binary images or invent uploaded URLs. |
| Media versions | Regeneration uses the saved artifact as source. A stale browser using the parent again receives stale_source before any provider call. Older independently saved sibling attempts remain visible as previous versions. |
| Local history | Read-only scoped legacy browser chats. Existing scoped/unscoped keys remain unchanged; unscoped legacy records stay hidden. No automatic upload, reassignment, merge or deletion. |
| Brand setup | Legacy persona cards/review, four numbered tone rows, optional age slider/income/education, tag inputs and writing-example cards. Brand values/tone are shared; audience guidance belongs to the selected persona. |
| Brand Summary | Header dialog shows current persona/audience/brand configuration; saved message labels retain historical snapshots. |
| Sidebar and suggestions | Stacked Chat/Calendar/New Chat, persona/preview/type labels, and three suggestions per category with More. |
| Export chat | Versioned JSON with every history page, structured outputs, revisions, snapshots and flags; failures do not create partial downloads. No import endpoint. |
| Calendar | Existing browser-local scheduling remains, using durable message IDs as batch keys. It does not synchronize across devices. Saving another revision uses that revision's distinct ID. |

Text, posts, clarification, campaign, video and social-image outputs retain their
normalized payloads, full disclosures, slides, hashtags, withheld content, compliance
flags and historical persona labels. Publication-copy helpers intentionally select
publication fields; they are never persistence serializers. Changing brand/persona
configuration does not rewrite historical output. New generation uses current
configuration; shortening preserves the historical output's identity/disclosure.

Campaign carousel image generation uses its saved slides; other campaign graphics
use the saved caption. Post graphics use the saved script. Image regeneration loads
the prior specification on the server; the browser cannot submit a replacement
assistant payload or trusted previous_attempt through the durable API.

An unsent draft typed while an earlier request runs remains intact when the reply
arrives. Offline users can compose locally; generation cannot bypass durable storage.
Input is not promised to survive a full reload until it has been recorded as a
pending submitted request. Resolve browser storage errors and reload before retrying;
do not delete old history keys to resolve an operation.

## 2. Privacy and authority

Every request verifies JWT identity, selected-workspace membership and capabilities.
Every conversation read/write/source/status checks the selected authorized workspace.
Its members can access each other's saved chats; creator identity is attribution.
Null historical creators are visible in their workspace but never backfilled.

| Capability | Owner/admin/developer/member | Viewer |
| --- | --- | --- |
| chat:read | Workspace conversations | Workspace conversations |
| chat:create | Yes | No |
| chat:write | Workspace metadata/revisions/archive/recovery | No |
| ai:generate | Yes, also chat:write for durable generation | No |

This does not change configuration-edit policy: member cannot edit brand/personas,
and developer configuration writes remain restricted by environment. UI role controls
are advisory; the repository refreshes role/membership under a short lock. All
mutations lock membership before session. Workspace scope/capabilities/fencing are checked
again before provider stages and completion. No DB connection is held during AI calls.
RLS was not added; application predicates remain mandatory. Optional revoked_at
compatibility does not implement the absent soft-revocation lifecycle.

Source messages and request links must belong to the same authorized session.
Foreign/missing records are indistinguishable 404s. Browser fields cannot establish
author, role, ownership, normalized output, claim state, flags or trusted history.
Authenticated chat/status responses, including errors, use Cache-Control: no-store.
Account/workspace changes abort waiting and reject stale responses; aborting the
browser does not cancel a server/provider attempt already running.

## 3. API reference

All endpoints use verified authentication and existing selected-workspace transport.
UUIDs are server-validated; timestamps are server-generated. Limits are server limits.

| Method/path | Request/response |
| --- | --- |
| PUT /api/chat/sessions/{client_uuid} | Body `{title,persona_id}`. 201 new / 200 existing same-workspace ID. Replay returns current metadata without overwriting it. Foreign collision: 404. |
| POST /api/chat/sessions | Legacy initial-message creation retained for compatibility. The durable UI uses idempotent PUT instead. |
| GET /api/chat/sessions?version=2&archived=false&limit=30&cursor=... | `{sessions,next_cursor}`; archived true selects Archive. Sort updated_at DESC, id DESC; max 100. Unversioned list retains its old array shape. |
| GET /api/chat/sessions/{id}?version=2&limit=50&before=... | Metadata/etag, ascending `(created_at,id)` messages, before_cursor and unresolved operation statuses. Max 100. Workspace archived history is readable. |
| PATCH /api/chat/sessions/{id} | Body may contain only title/default_persona_id/archived. Require If-Match metadata ETag. Return updated metadata/etag. |
| POST /api/chat/sessions/{id}/operations | Submit the typed action below. Provider operations remain synchronous. No generic assistant/system/tool-message insertion endpoint. |
| GET /api/chat/sessions/{id}/operations/{key} | Read operation state and committed response; never call the provider. |
| POST /api/chat/sessions/{id}/operations/{key}/abandon | Body `{acknowledge_uncertain_outcome:true}`. Close an uncertain operation and fence late work. No provider call. |

Metadata ETag hashes canonical title/default persona/archive state under the session
lock. It is not a history version; adding messages alone does not invalidate it.
Missing If-Match returns 428; stale metadata returns 412. Session metadata includes
id, workspace_id, created_by_member_id, default_persona_id, title, summary_status,
started_at, updated_at, archived_at and etag. V2 list/detail reads also expose
read-only persona_name, preview, content_types and persona_state derived server-side
through page-scoped queries; full-history persona checks are not page-limited.
summary_status is an existing field,
not evidence of a new background summarization job.

Operation request:

```json
{
  "operation_key": "<new UUID, retained for this exact logical attempt>",
  "action": "send",
  "persona_id": "<explicit active workspace persona UUID>",
  "message": "Write an educational checklist."
}
```

| Action | Additional rules |
| --- | --- |
| send | message required; no source_message_id, target or answers |
| clarify | source_message_id of stored clarification; answers array with every question_index exactly once, selected string array and custom text |
| regenerate | source_message_id of current text/posts/campaign revision; original task is loaded by the server |
| shorten | source_message_id of current text revision; omit persona_id (historical persona is retained) |
| video / social_image | source_message_id of stored parent or current artifact; target `{collection:"posts" or "content_calendar",index:nonnegative integer}` identifies a validated item. Media regeneration must retain its target. |

All provider actions require persona_id matching the locked session and any source.
Mixed/ambiguous histories and unavailable personas block new provider work; historical
reads/export/archive remain available. Existing replay still precedes current configuration
and selection checks. Source actions reject browser message text.
Unknown fields/type mismatches return 400. Server title length: 1–200 characters;
prompt/combined clarification: at most 16,000 characters; operation JSON: at most
128 KiB. Canonical validated input is hashed; same key with different input returns
409 operation_key_reused. Other 409 codes include operation_in_progress, stale_source,
clarification_already_submitted and uncertainty/retry conflicts. Outages return a
sanitized 503; there is no fallback to an unsaved generation.

POST result fields are operation_key, action, state, request_message_id, response
(saved message DTO or null), and safe_error_code. Location points to status. Status
HTTP mapping: succeeded 200, running 202, abandoned 409, known rate-limit failure
429, other known generation failure 502, unknown 503. GET status returns 200 for a
found operation regardless of its state. A 202 replay means another request owns
the synchronous work; it does not imply a queued background job.

Existing /api/chat, /api/video-brief and /api/social-image remain stateless
compatibility wrappers with prior response shapes and Step I safeguards. The normal
durable UI does not call them. They do not gain implicit conversation context.

## 4. Operation recovery and billing limits

1. Authorize and inspect stable key/hash for replay before resolving old configuration.
2. Resolve current context/source, then lock and recheck role/workspace/idle state.
3. Capture bounded history and persist request/claim; positively establish commit
   before dispatch. Commit an ai_run before each actual provider invocation.
4. Call the provider with SDK retries disabled and a 120-second per-invocation timeout.
5. Normalize, validate and apply existing compliance rules. Recheck authority/fence,
   atomically save assistant output plus final run/operation and parent recency.
6. Return saved success only after commit. Database-unavailable completion errors
   permit one save-only retry (two completion attempts total) of the same in-memory
   output; the provider is never called again to repair storage.

| Situation | Recovery |
| --- | --- |
| Same key/input completed | Return saved result; no provider/config/history rerun |
| Same key/input running | Status only; no second dispatch |
| Known failed attempt | Show operation error, not assistant text. Deliberate new attempt uses a new key. |
| Lost reply | Read status/history; a committed response survives client disconnection. |
| Request not found after an ambiguous connection | Show unconfirmed. Only explicit Resubmit the same request reuses the original key/input; no automatic POST. |
| Timeout/crash/connection ambiguity | Show outcome unknown. Five minutes without progress also presents uncertainty, without authorizing takeover. |
| Explicit unknown replacement | Require acknowledgement of possible prior billing, abandon/fence old claim and atomically claim new key with retry_of. |
| Explicit close | Acknowledge and abandon uncertain attempt so another task can proceed; this cannot undo provider charges. |

The browser stores pending identifiers/input under
`lucie_chat_pending:v1:<encoded account/workspace scope>` before dispatch. Storage
failure is surfaced and blocks generation. Unresolved status is polled every two
seconds while visible; focus/reconnect refreshes the active conversation and sidebar.
Idle shared chats/list refresh approximately every 15–16 seconds while visible/online. No automatic
regeneration occurs. Server status is authoritative; local storage is not an authority
or an encrypted backup. A full reload can recover claimed work on another browser
from server history/status even though that browser has no local pending record.

Late history GETs cannot overwrite newer operation status or committed metadata;
delayed running/unknown status replies cannot resurrect a known terminal attempt.
If an offline backlog exceeds the latest page with no overlap, refresh restarts at
that page/cursor so intervening history stays reachable instead of creating a gap.

Campaign preflight and generation can require two invocations. One ai_run exists
per invocation, with allowed statuses only started/succeeded/failed, explicit cache
mode, model, prompt version/hash, available usage/latency and safe errors. Only the
final producing invocation links the assistant message. An uncertain/abandoned
attempt may retain a started run; it is not falsely labeled a confirmed failure.
No exactly-once billing guarantee is claimed: a crash after provider success but
before durable completion can lose output. No queue, worker takeover or streaming
protocol was introduced.

## 5. Storage and versioning

No migration, new Neon branch, ownership backfill, operation table or speculative
index was needed. The existing partial unique `(session_id,client_message_key)`
index protects request/response keys; the session lock protects logical operations.
Every new writer must follow that lock protocol. Unresolved-operation SQL filters
running/unknown rows rather than transferring every completed history snapshot.

- Request chat_message: role user, readable content, action/input/hash and server
  operation metadata in structured_data. Key `request:{operation_uuid}`.
- Assistant chat_message: key `response:{operation_uuid}`, actual request_message_id,
  immutable source_message_id for revisions/media and separate compliance_flags.
- Assistant envelope schema_version 1: type, complete normalized payload,
  persona_snapshot `{id,name,slug}`, original_request_id, optional target;
  render_version 1 for image specifications. Plain text uses content_format plain_text;
  rich content uses canonical JSON, with structured_data authoritative for rendering.
- Operation JSON: running/succeeded/failed/unknown/abandoned, claim_token,
  started_at/last_progress_at, response_message_id and safe_error_code. Tokens are
  server-only and redacted from public DTOs. These are not ai_run status values.
- Legacy server rows without envelopes remain readable as text. Unsupported future
  envelope/image-render versions show a safe unsupported state, not an exception.

No new writes to content_item, campaign or calendar_entry are part of Step J.
Calendar continues in its existing scoped browser namespace. Historical PDFs and
old unscoped browser data are not imported or rewritten.

Provenance walks validate same-session nodes and detect cycles. Long valid
shortening/image revision chains do not stop at an arbitrary 20-version ceiling.
An older release's independently saved media attempts are grouped for display
without rewriting their stored source links or publication payloads.

## 6. Bounded same-conversation context

Capture happens inside the authorized claim/session lock. Each logical exchange is
the effective original task plus its latest completed non-media result; clarification
answers and revision provenance are respected. Regenerate/shorten command labels,
failed/pending work, system/tool rows, superseded alternatives, other conversations
and unrelated media are excluded. Only completed typed v1 responses participate.
Regeneration/clarification of an earlier task uses preceding exchanges and keeps
the original task distinct, avoiding duplicate insertion or later-task contamination.

Limits: six completed logical exchanges, 16 KiB of canonical UTF-8 history JSON and
4 KiB per historical user/assistant projection. Whole oldest pairs are removed
first; truncated projection text is marked without splitting UTF-8 code points.
Rich projection allowlists content fields, including captions/slides/hashtags and
disclosures where they fit. Stored publication output is never truncated for context.
These are byte limits, not exact token counts or long-term memory.

Request generation_input.conversation_context records projection_version 1, bounded
messages, exchange/provenance IDs, message_ids, truncated and utf8_bytes. Both
campaign stages use this captured snapshot. Historical content enters provider
user/assistant messages, never trusted policy. Current brand/persona/licensing and
compliance remain authoritative; ai_run prompt version is step-i-policy-step-j5-v1.
Media uses its explicit saved source without unrelated history. Bounded recent-idea avoidance separately reads up to 12 completed outputs across this
workspace, extracts at most 25 concepts within 8 KiB and passes them as untrusted advisory
context, without an extra model call. This is not full cross-chat memory, RAG, embeddings,
a vector extension or a summary job.

Format safety (post-J.5 fix): earlier clarifications are replayed as a labelled prose summary of what was
asked (questions, choices, whether multiple/custom answers were allowed, and that they remain unanswered),
never as `key: value` lines the model could imitate. If the provider nevertheless returns text that opens
with a `Saved posts|campaign|clarification:` label or a bare question/options layout, generation fails with
`invalid_provider_output` instead of saving it as a reply; ordinary plain-text answers are unaffected. See
the incident record in STEP_J_IMPLEMENTATION_AND_TESTING.md.

## 7. Decisions and boundaries

| Decision | Reason / consequence |
| --- | --- |
| Persistence first, retain Step I generation | Avoid rebuilding prompts/compliance; shared callable services preserve old stateless response shapes. |
| Existing schema, application authorization | Existing fields/indexes support required invariants with locking; no speculative DDL or RLS rollout. |
| Workspace-shared chats | Members can read and writers can continue/edit the workspace’s saved chats; creator/authors remain attribution. No cross-workspace access. |
| Scrollable list with Archive | Replaces fixed three-slot reconciliation; keeps history and reversible clearing. |
| Immutable revisions and media links | Historical publication content/identity remains auditable and reloadable. |
| Client UUID plus idempotent create | Reload/retry does not create duplicate placeholder sessions or overwrite metadata. |
| Synchronous operations | Fits current architecture; 202 is replay/status, not background execution. Actual hosting timeouts still need verification. |
| Explicit unknown retry, SDK retries off | Avoid automatic repeat paid requests; acknowledge possible prior billing and fence late workers. |
| Bounded context after durability | Server-owned same-conversation history, bounded cost/input and auditable selection, without cross-chat memory. |
| Defer Save Draft (J.6) | content_item lacks the approved creator ownership/visibility contract; do not invent draft privacy or migration. |
| Preserve local history/calendar | Avoid unintended historical upload or a false cross-device calendar promise. |
| Legacy UI recovery | Explicitly requested hotfixes restore persona cards/review, numbered tone choices, optional demographic controls, tag/sample inputs and stacked sidebar navigation. See the UI guide and recovery report. |
| Agent runs routine scripts | Owner focuses on normal UI review; no repeated PowerShell/Neon preflight is needed absent a relevant change. |
| J.5/J.7 combined | Explicit owner approval replaced the intermediate J.5 checkpoint, with tests still sequential. |

## 8. Testing, handoff and release status

The owner reported working normal UI/multiple-browser persistence after J.4 and
working behavior after J.5. This is qualitative acceptance, not a claim that every
role/output/provider/cache/runtime combination was manually exercised. Latest exact
counts for the UI/sharing patch are in [workspace sharing](WORKSPACE_CHAT_SHARING.md);
fresh-install verification is in the [documentation sweep](DOCUMENTATION_SETUP_SWEEP.md).
Earlier finalization/implementation results remain historical evidence.

Routine isolated tests and the Chrome fixture/export script need no live database
or paid calls. Opt-in PostgreSQL tests use only approved fresh synthetic workspaces
and reviewed cleanup; default pytest blocks DB access. Live tests do not construct
an Anthropic client. No owner-run SQL, migration or manual seed is needed now.

Remaining release gates: actual deployed worker/proxy timeout settings, full live
Auth cross-account/workspace/role/revocation matrix, and separately approved bounded
agent-run paid output/usage/cache smoke. One native synthetic PNG is not exhaustive
maximum-footer/all-template acceptance. Existing soft-revocation lifecycle, image
advisory cleanup and Calendar copy limitations remain separate. Git publishing,
deployment, historical import and any DDL require separate authorization.

Source map: ChatPage / PersistedMessage and chatPersistence/chatSerialization for UI
state/rendering; chat_http/chat_contract for HTTP validation; chat persistence and
generation operation repositories for authorization/locking; generation_operations
for orchestration; generation/generation_policy/prompt_builder for shared generation
and compliance; conversation_context for bounded projection. Tests are the Step J
backend suites, frontend persistence/serialization/component cases and
`client/scripts/test-chat-browser.mjs`. See [testing guide](STEP_J_TESTING_GUIDE.md).
