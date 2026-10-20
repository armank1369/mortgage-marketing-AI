# Lucie legacy workflow recovery

Baseline: Step J `290c636`, compared with presentation-era main `43162e2`.
This patch preserves the Steps G–J authorization, durable operation recovery,
immutable responses and existing generation policies. No migration is required.

## Feature parity and intentional differences

| Presentation-era behavior / source | Current implementation / storage | Patch outcome |
| --- | --- | --- |
| Persona cards and pick/review flow: `PreferenceSetup.jsx` | Existing setup + `PersonaManager.jsx`; Neon persona rows | Connected to first use and New Chat; named persona titles, cards, review, explicit confirmation |
| One audience per chat: old `ChatPage.jsx` | `chat_session.default_persona_id`; message persona IDs/snapshots | Enforced by metadata API and provider-operation preparation/claim; changing audience requires a new chat |
| Brand Summary: old `ChatPage.jsx` | `BrandSummary.jsx`; current brand/persona configuration | Restored from persistent header; explains current configuration versus historical labels |
| Core values and tone: old `PreferenceSetup.jsx` | `brand_profile.values` and `.tone` | Shared brand editor; four optional 1–5 controls, voice text and unknown tone keys preserved |
| Audience details / pain points: old `PreferenceSetup.jsx` | `persona.audience_profile`, `.prompt_guidance` | Named multiline fields for needs, pain points, questions and explanation preferences; advanced JSON remains available |
| Age/income/education local preferences | Scoped legacy preferences and local history | Preserved as reference/export; new targeting controls deferred |
| Hardcoded brand prompt: old `server/app.py` | Step I database generation context | Empty-field notices and explicit reviewable drafts; no automatic configuration migration or identity substitution |
| Sidebar previews and tags: old `ChatPage.jsx`, `storage.js` | Read-only v2 session presentation fields derived from stored messages | Persona label, first-request preview, response-type badges; bounded session-page queries, no client history fan-out |
| Title and description editing | Existing metadata PATCH | Title retained; editable descriptions deferred because no corresponding current storage/API contract exists |
| Quick prompts / More: old `ChatPage.jsx` | `chatPrompts.js` and per-category offsets | Three stable suggestions; rotate on More or accepted request |
| Loading phrases / tips | Durable operation state UI | Gentle reduced-motion-aware animation; actual running/checking/unknown status stays authoritative |
| Posts, campaigns, clarifications, carousels, video and social image | Existing renderers and Step J message envelopes | Retained; regression/browser checks cover saved outputs and revisions |
| Calendar / Save to Calendar | Existing `CalendarContext`, browser storage | Retained; still browser-local |
| Cross-chat repeated-idea suppression: August session log / SQLite | `recent_ideas.py`; authorized creator-owned Neon sessions | Restored with narrower visibility: same creator and workspace only; never other creators' chats |
| Experimental history download: `chat-memory-save-button` | Paginated authorized v2 reads / scoped local history | Selected-chat JSON export; includes structured outputs, revisions, flags and historical persona snapshots |
| Delete / Clear | Step J Archive and Restore | Retained; no destructive delete or history reassignment |

## Contracts and data semantics

- Persisted session persona UUIDs cannot change or clear. Same-value PATCH is
  accepted; title/archive edits retain ETags. A change returns `409 persona_locked`.
- Provider actions must match the session and source persona. Replay of an existing
  operation key/body still happens before current configuration checks. Preparation
  and claim both validate the selection; claim holds the session lock.
- V2 session lists/details add `persona_name`, `preview`, `content_types`, and
  `persona_state`: `available`, `unavailable`, `mixed` or `ambiguous`. State checks
  inspect all message persona IDs, regardless of the displayed history page.
  An absent session persona or an assistant message without a persona is ambiguous;
  conflicting IDs are mixed. These histories remain readable/exportable/archivable,
  but new provider work requires a new conversation. No historical data is rewritten.
- Shared tone keys are `professional`, `authoritative`, `serious`, `matterOfFact`.
  Values 1/5 mean the left/right labels; 3 is balanced. Unset remains unset. Numeric
  meanings are included in prompt construction. Persona identity is locked, while
  edits to its definition and shared brand apply to future generations.
- Named audience fields map to string arrays at `needs`, `pain_points`,
  `common_questions`, `explanation_preferences`. Other keys survive. Existing
  incompatible field shapes use the advanced editor rather than silent conversion.
- JSON exports use `schema_version: 1`, `exported_at`, `source`, `session`,
  `messages`. Server messages use public serializers that strip claim tokens.
  All history pages must load successfully before any file is downloaded. Exports
  are backups for review; there is no new import endpoint or transactional snapshot
  guarantee when another browser is actively appending messages.
- Idea context reads the latest 12 completed text/post/campaign results, retaining
  only the latest revision per original request. It excludes the regenerated source,
  failed work and foreign owners/workspaces; extracts at most 25 concepts within
  8 KiB of UTF-8 JSON; and supplies them as untrusted advisory context. It makes no
  extra model call and does not replace or enlarge the Step J same-chat history
  budget. It guides generation, rather than guaranteeing semantic uniqueness.

## Configuration reconciliation

The supplied query results show empty audience profiles and minimal guidance for
two test personas. They do not establish which workspace the app is using or the
quality of its voice text. This patch does not claim that production values were
migrated.

The optional voice draft was compared with main's original `BASE_PROMPT`: its
professional/authoritative/serious/matter-of-fact direction and emphasis on clarity
and transparency are preserved. It is a shortened, reviewable proposal, not a full
copy of old platform policy, keywords, catchphrases or licensing. The review action
only fills an empty draft voice; Save still uses the existing authorized endpoint.
Persona starters and local-persona copies also require explicit review and Save.

## Return-to-computer checks

1. Open New Chat. Choose a card, review the persona and shared brand, then confirm.
   Confirm the composer opens with that persona and the header summary is readable.
2. Send a request; refresh and reopen it. Its persona stays fixed. Create another
   chat for a different audience; both chats remain distinguishable in the sidebar.
3. In Settings, edit audience needs, pain points and explanation preferences. Save,
   reload and check the summary. Existing custom JSON fields should remain intact.
4. Set a shared tone scale, save and reload. Check its summary visualization. Clear
   a scale to return it to unset. Review any empty brand voice/keywords/catchphrases.
5. Open a prompt category, use More, and confirm suggestions stay stable while
   typing. Check the running/unknown operation UI still describes real state.
6. Generate and reopen posts/campaigns, clarification answers, carousel slides and
   linked video/image artifacts. Review previous versions and full disclosures.
7. Export a long conversation and inspect the JSON's complete message list,
   structured payloads and flags. Local-history export should preserve legacy fields.
8. Archive and restore a chat; check mobile navigation and keyboard Escape/focus in
   dialogs. Existing mixed-persona history should explain why a new chat is needed.
9. When intentionally testing live generation, check that a changed audience/tone
   influences new content and that recent ideas from your own other chats discourage
   repeats. These checks incur normal provider usage and were not run by this patch.

## Automated validation

Final local checks:

| Command | Result |
| --- | --- |
| `.\server\venv\Scripts\python.exe -m pytest server/tests -q` | 521 passed, 36 skipped (opt-in integration cases) |
| `npm --prefix client test` | 101 passed |
| `npm --prefix client run lint` | Passed; three existing Fast Refresh warnings in unchanged components |
| `npm --prefix client run build` | Passed; existing large-bundle advisory |
| `npm --prefix client run test:chat-browser` | Passed, including configuration round trips, custom-key preservation, JSON export and 390px layout |
| `git diff --check` | Passed |

Backend tests
block live PostgreSQL access; browser tests serve a synthetic in-browser repository
and fake provider outcomes, including configuration save/reload and JSON downloads.
The fixtures test behavior but cannot prove PostgreSQL locking/query performance,
live Auth isolation, actual workspace configuration or model output quality.

Deferred work: workspace-wide shared-content retrieval; editable descriptions;
automatic import/backfill; cross-device calendar synchronization; Save Draft ownership
and visibility; additional persona-specific tone contracts. No live database changes,
paid provider calls, commit, push, merge or deployment were performed.
