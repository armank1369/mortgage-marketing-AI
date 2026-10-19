# Step J finalization — persistence and bounded conversation context

Date: 2026-10-18 (America/Los_Angeles).
Branch: `codex/step-j-chat-persistence`.
J.5/J.7 starting HEAD: `d50a52303152b532d86f6df3f326c82dc1426dd4`.

**Implementation and automated acceptance are complete for the approved scope.**
J.1–J.5 are implemented; J.6 Save Draft remains explicitly deferred. J.7 isolated,
synthetic-browser, development PostgreSQL and process-interruption checks passed.
Remaining live-provider, identity-matrix and deployment-runtime gates below are
not signed off. This document is not a production-readiness or deployment claim.

The owner accepted J.4 after normal UI/multiple-browser testing and explicitly
approved combining J.5 and J.7, with J.5 tested before final regression. The owner
also requested a future UI refinement; no redesign was included in this run.

## Delivered behavior

- Creator-private durable sessions/messages with pagination, ETag metadata edits,
  explicit persona selection, reversible archive/restore and an unsaved New Chat.
- Immutable regeneration/shortening revisions, durable clarification answers and
  linked image/video specifications; reloading reads saved output without generation.
- Stable operation keys, atomic claims, one unresolved operation per session,
  ai_run accounting, no automatic provider retries and explicit uncertain-outcome
  acknowledgement/replacement. No exactly-once billing guarantee is claimed.
- Separate read-only scoped local history; old scoped/unscoped storage bytes are
  retained. Calendar remains browser-local. No historical import or Save Draft.
- J.5 same-conversation context for durable send/clarify/regenerate operations.
  Media uses its explicit stored source. Compatibility stateless endpoints remain
  stateless; no browser history/assistant-payload insertion contract was added.

## J.5 implementation details

`server/services/conversation_context.py` selects the latest completed non-media
result per original user task, after membership/capability/creator/source checks
and inside the session claim lock. All query joins enforce the same session.
Only completed typed v1 responses participate; legacy local history is not imported.

Each logical exchange projects the effective original task (including structured
clarification answers) and its current assistant revision. Regenerate/shorten command
labels, failed/pending results, system/tool rows, obsolete alternatives and foreign
conversations are excluded. Regenerating or answering an earlier task uses preceding
exchanges only; the explicit original task is not duplicated in history. Media calls
do not receive unrelated conversation history.

Limits: at most six logical exchanges, 16 KiB of canonical UTF-8 history-message
JSON, and 4 KiB per historical user or assistant projection. The user cap is a
conservative refinement of the artifact cap. Rich projections allowlist publication
fields, including captions/slides/hashtags/disclosures where they fit. Projection
truncation is marked; oldest complete pairs are dropped first. Saved publication
content and disclosures are never shortened to satisfy context limits. These are
byte bounds, not exact provider-token counts or long-term memory.

Request `structured_data.generation_input.conversation_context` stores:

```text
projection_version: 1
messages: bounded [{role: user|assistant, content: text}, ...]
exchanges: [{user_message_id, request_message_id, assistant_message_id}, ...]
message_ids: deduplicated selected/provenance IDs
truncated: boolean
utf8_bytes: canonical UTF-8 size
```

The captured snapshot, rather than a second unguarded read, supplies both campaign
provider stages. Current brand/persona/compliance are resolved for each new
generation; historical text remains in user/assistant messages and never enters
the trusted policy blocks. A code-controlled instruction identifies historical
messages as untrusted, potentially abbreviated data. The ai_run prompt version is
`step-i-policy-step-j5-v1`; per-invocation system hashes/usage behavior is preserved.
Completed replay returns before configuration/history re-resolution and never
authorizes another provider call. Context-read failure prevents claim/dispatch.

Changed production files in this combined run: conversation_context.py (new),
chat_persistence_repository.py (internal snapshot callback under lock),
generation_operations.py (use snapshot), generation.py (optional history), and
generation_operation_repository.py (prompt-version marker). No database/API schema,
dependency, model-selection, output-envelope or compliance-policy rewrite occurred.

## Observed verification

| Check | Result | What it establishes |
| --- | --- | --- |
| Full isolated backend suite | **500 passed, 35 skipped**, 5.58s | Includes 19 new context cases; live DB is blocked in ordinary unit tests |
| Full frontend suite | **93 passed**, 0 skipped | Persistence, storage, scope races, serialization and actual JSX rendering |
| Synthetic Chrome browser runner | **Passed** | Actual React send/reload, revisions/media, clarification, recovery, pagination, account/viewer controls and narrow layout; synthetic transport |
| Three Step J opt-in PostgreSQL suites | **15 passed**, 174.50s | Existing five J.2/seven J.3 cases plus three J.5/J.7 cases; reviewed isolated fixture cleanup passed |
| Native PNG export | **1080×1080 pull_quote exported and visually inspected** | Complete synthetic license/equal-housing footer and supplemental line visible at native resolution; no paid call |
| Lint/build | Exit 0 | Three existing Fast Refresh warnings; existing large-bundle/plugin-timing notices |
| Whitespace checks | Passed | No whitespace defects; normal repository CRLF notices only |

All PostgreSQL writes belonged to fresh synthetic fixture workspaces, including
their synthetic brand/persona/member/session records; reviewed fixture teardown
deleted those workspaces. No existing customer/configuration rows were edited.
The previously approved development connection was passed only to the pytest
subprocess environment, without changing .env or printing connection credentials.

The real SQL checks verify context snapshot IDs and task/revision boundaries,
same-owner separate-conversation exclusion, denial to another creator even with
admin role, committed invocation visibility, duplicate claims, rollback, campaign
accounting, role downgrade and late-worker fencing. The new interruption case
starts a separate worker process with a fake provider, observes a committed run,
terminates that worker, verifies running/unknown replays do not dispatch, then
requires an acknowledged new operation to obtain a replacement output. Only that
fixture's progress timestamp is aged to exercise the five-minute boundary quickly.
Another case abandons a campaign during preflight and proves stage two is fenced.

The owner reported successful normal UI/multiple-browser persistence after J.4.
This is useful positive live evidence; it does not establish every response type,
foreign-account denial or actual model follow-up quality. Unit request fixtures
prove bounded history reaches the provider boundary; actual provider behavior has
not been smoke-tested by the agent in this run.

## Remaining owner/release gates

1. **Normal UI context review:** optionally ask for a checklist, then “Explain your
   second point” in the same conversation, including after reopening in another
   browser. A separate conversation must not receive that history. Normal generation
   uses the configured paid provider; routine PowerShell checks need no repetition.
2. **Live identity matrix:** verify denial from a different existing test account,
   including admin, and relevant workspace/viewer/revocation cases through real Auth.
   Repository tests and synthetic browser identities do not establish all live Auth
   behavior. No new membership provisioning is implied.
3. **Actual runtime/proxy timeouts:** confirm the deployed Render start command,
   worker timeout and Vercel/proxy request limits before controlled paid smoke.
   Repository evidence includes a frontend Render rewrite and pinned Gunicorn,
   but not the actual deployed worker configuration. Each provider invocation has
   a 120-second timeout, and a campaign can invoke twice; hosting must accommodate
   the synchronous path and database overhead. No hosting settings were changed.
4. **Agent-run paid smoke:** requires separate explicit approval and a bounded call
   budget, after runtime verification. Cover all response families and the two-call
   campaign path, usage/cache observations and actual output/export behavior.
5. **Git publishing/deployment:** commit, push, merge and deployment remain separate
   actions; none was performed by the agent during this combined run.

No additional Neon metadata query, schema change, manual fixture preparation,
ai_run pre-insertion, new branch or migration is needed now. If a later gate reveals
an incompatible runtime or a need for DDL, stop for a focused design decision.

Separate outstanding items: the owner's UI appearance feedback, soft-revocation
lifecycle, image advisory cleanup, Calendar copy completeness and extreme/long
footer PNG layout. One synthetic native export is not exhaustive layout acceptance
for all templates or maximum-length disclosures. Save Draft ownership/visibility,
historical migration, calendar synchronization and cross-chat/RAG memory remain
outside this Step J implementation.

Evidence and commands: [implementation record](STEP_J_IMPLEMENTATION_AND_TESTING.md).
Owner UI checks and reproducible free scripts: [testing guide](STEP_J_TESTING_GUIDE.md).
