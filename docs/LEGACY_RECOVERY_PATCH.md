# Lucie legacy workflow recovery

> Access-policy update: [Workspace chat sharing](WORKSPACE_CHAT_SHARING.md) supersedes creator-private chat access and creator-only recent-idea retrieval described below. Existing same-workspace chats are shared; historical test results remain historical.

Baseline: Step J `290c636`, compared with presentation-era main `43162e2`.
This patch preserves the Steps G–J authorization, durable operation recovery,
immutable responses and existing generation policies. No migration is required.

For the current end-user walkthrough, see [UI and workflow](CURRENT_UI_GUIDE.md).
For fresh-checkout commands, use the [README](../README.md#clone-and-install).

## Screenshot-driven UI revision

The follow-up UI revision uses main's actual `PreferenceSetup.jsx`,
`DualRangeSlider.jsx` and sidebar markup as its reference. Setup now opens as a
standalone page with the original Lucie/Brand Setup header, navy active persona
cards, initials, edit pencil, compact name/description creation form, numbered
sections and a full-width Set Brand Guidelines action.

The tone dropdowns have been replaced with the original five numbered choices
in both setup and Settings. They also support keyboard arrow navigation and an
explicit clear action. The dual-handle age slider restores the original 1–100
range and clamps each handle at the other bound, with pointer capture, touch
support and keyboard access. Household income, education and pain points appear
in the original Target Audience arrangement. Additional audience/generation
settings remain accessible in an expandable section.

Brand values and tone still apply to the workspace and are labeled accordingly;
audience details belong to the selected persona. Age uses `audience_profile.ageRange`,
income uses `.income`, education uses `.education`, and pain points use the existing
`.pain_points` string array. These JSON fields already fit the current API/context
contract. Existing values and custom keys are preserved. Empty tone/demographic
fields remain unset until explicitly selected; 25–45 is only the slider preview
and its explicit “Use 25–45” action, not an automatic migration.

Set Brand Guidelines saves changed audience fields and then changed shared brand
fields through authorized APIs before opening the conversation. If the audience
save succeeds but the brand save fails, the form reports that partial outcome and
stays open for retry. Config readers can review guidelines and use a persona without
receiving configuration write controls. The persona remains locked once a chat is
persisted.

The sidebar restores vertically stacked Chat, Calendar and New Chat rows, active
view highlighting, the green persona chip and compact conversation entries. Settings
is available at the bottom. The existing Archive and Local history views remain
accessible. Setup offers Back to chats without creating or changing a conversation.


## Plain-language brand inputs

Keywords, catchphrases, banned words and values now use tag inputs. Enter or Add
commits a complete word/phrase to the draft; its remove button deletes that tag.
Commas stay part of a phrase. Duplicate additions are ignored without changing
existing saved entries. Limits remain 40 items and 200 Unicode characters per
item, with visible counts and plain-language errors. Core values use the same
control in the persona guidelines form.

Writing examples use separate editable sample cards and a New writing example
field. Enter adds a sample; Shift+Enter inserts a paragraph break. Additions are
serialized automatically. Existing arrays of text or objects and object-shaped
records retain their format and unrelated metadata. Unfamiliar saved structures
are displayed read-only as labeled content; no user needs to edit syntax to keep
or remove them. No automatic flattening or replacement occurs.

Enter never submits either configuration form. The existing Save brand profile /
Set Brand Guidelines action persists the draft, including any text still awaiting
Enter, so clicking Save cannot silently lose the last phrase/example. Failed saves
retain the draft. This changes no database schema or endpoint: word lists keep
string-array payloads and writing examples keep their existing JSON-compatible
payloads. No live SQL inspection or migration is needed.

## Feature parity and intentional differences

| Presentation-era behavior / source | Current implementation / storage | Patch outcome |
| --- | --- | --- |
| Persona cards and pick/review flow: `PreferenceSetup.jsx` | Existing setup + `PersonaManager.jsx`; Neon persona rows | Connected to first use and New Chat; named persona titles, cards, review, explicit confirmation |
| One audience per chat: old `ChatPage.jsx` | `chat_session.default_persona_id`; message persona IDs/snapshots | Enforced by metadata API and provider-operation preparation/claim; changing audience requires a new chat |
| Brand Summary: old `ChatPage.jsx` | `BrandSummary.jsx`; current brand/persona configuration | Restored from persistent header; explains current configuration versus historical labels |
| Core values and tone: old `PreferenceSetup.jsx` | `brand_profile.values` and `.tone` | Shared brand editor; four optional 1–5 controls, voice text and unknown tone keys preserved |
| Audience details / pain points: old `PreferenceSetup.jsx` | `persona.audience_profile`, `.prompt_guidance` | Named multiline fields for needs, pain points, questions and explanation preferences; advanced JSON remains available |
| Age/income/education: old `PreferenceSetup.jsx` | Optional `persona.audience_profile` JSON fields plus scoped legacy records | Slider and dropdowns restored; existing custom data and unset values preserved |
| Hardcoded brand prompt: old `server/app.py` | Step I database generation context | Empty-field notices and explicit reviewable drafts; no automatic configuration migration or identity substitution |
| Sidebar previews and tags: old `ChatPage.jsx`, `storage.js` | Read-only v2 session presentation fields derived from stored messages | Persona label, first-request preview, response-type badges; bounded session-page queries, no client history fan-out |
| Title and description editing | Existing metadata PATCH | Title retained; editable descriptions deferred because no corresponding current storage/API contract exists |
| Quick prompts / More: old `ChatPage.jsx` | `chatPrompts.js` and per-category offsets | Three stable suggestions; rotate on More or accepted request |
| Loading phrases / tips | Durable operation state UI | Gentle reduced-motion-aware animation; actual running/checking/unknown status stays authoritative |
| Posts, campaigns, clarifications, carousels, video and social image | Existing renderers and Step J message envelopes | Retained; regression/browser checks cover saved outputs and revisions |
| Calendar / Save to Calendar | Existing `CalendarContext`, browser storage | Retained; still browser-local |
| Cross-chat repeated-idea suppression: August session log / SQLite | `recent_ideas.py`; authorized workspace Neon sessions | Restored and extended by the sharing patch: all creators within the selected workspace; no other workspaces |
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
  `common_questions`, `explanation_preferences`. Legacy-style optional controls use
  `ageRange` (two numbers), `income` and `education` (text). Other keys survive. Existing
  incompatible field shapes use the advanced editor rather than silent conversion.
- JSON exports use `schema_version: 1`, `exported_at`, `source`, `session`,
  `messages`. Server messages use public serializers that strip claim tokens.
  All history pages must load successfully before any file is downloaded. Exports
  are backups for review; there is no new import endpoint or transactional snapshot
  guarantee when another browser is actively appending messages.
- Idea context reads the latest 12 completed text/post/campaign results, retaining
  only the latest revision per original request. It excludes the regenerated source,
  failed work and foreign workspaces; extracts at most 25 concepts within
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

1. Open New Chat. Choose a card, review/edit its guidelines and select Set Brand
   Guidelines (or Use this persona for a configuration reader). Confirm the composer
   opens with that persona and the header summary is readable. The edit pencil changes
   a card's name/description; selecting the card opens the full guidelines form.
2. Send a request; refresh and reopen it. Its persona stays fixed. Create another
   chat for a different audience; both chats remain distinguishable in the sidebar.
3. In Settings, edit audience needs, pain points and explanation preferences. Save,
   reload and check the summary. Existing custom JSON fields should remain intact.
4. Select numbered tone choices and move both age handles using mouse/touch or arrow
   keys. Set income and education, save and reload. Verify the values and clear/reset
   actions. Tone is shared across personas; audience controls are persona-specific.
   Review any empty brand voice/keywords/catchphrases in Settings.
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
| `npm --prefix client test` | 112 passed |
| `npm --prefix client run lint` | Passed; three existing Fast Refresh warnings in unchanged components |
| `npm --prefix client run build` | Passed; existing large-bundle advisory |
| `npm --prefix client run test:chat-browser` | Passed, including tag Enter/add/remove/deduplication/limits, pending-text saves, writing-sample editing, read-only controls, persona creation, numbered choices, slider bounds, partial-save recovery, stacked navigation, JSON export and 390px layout |
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
