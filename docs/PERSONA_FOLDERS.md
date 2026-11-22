# Persona folders

V2 organizes chats by persona. The Chat sidebar lists one **collapsible folder** per active persona. Expanding a folder shows its conversations right there in the sidebar. The main pane stays the chat.

## How people use it

- **Sidebar:** click a folder to expand or collapse it. The number beside it is how many chats it holds. Each expanded folder has **＋ New chat** (skips the persona selector), **Persona settings** (that persona's audience, guidance and shared brand fields) and its conversations, newest first, with **Load more conversations**. Which folders are open is remembered in this browser, and the folder of the chat you are in is always open.
- **New Chat** (left navigation) opens the persona selector. Choosing a persona opens that persona's folder with a fresh chat inside it.
- **Archive** is a flat list of archived conversations across all folders. **Local history** is unchanged.
- A chat's persona is the folder's persona and cannot change. Chats whose persona was deleted keep a read-only "Unavailable persona" folder, and chats saved without a persona (older imports) appear in "Unsorted chats". Neither offers a new chat.

## Chat order and titles

Inside a folder the most recently active chat is on top, and each row shows the date and the time (the year is added for older chats).

Every chat gets a specific, unique title instead of the persona name:

- **Automatic:** after a new chat's first reply, the server writes a 3 to 7 word title from that first exchange (for example "Refinance Rate Drop Email"). It makes one short call to the configured model (`ANTHROPIC_MODEL`), never retries it, and falls back to a trimmed version of the first request if the call fails. A failure never affects the chat.
- **Unique:** titles are checked against the other chats in the same persona folder, case-insensitively, and numbered "(2)", "(3)" on a collision. The model is also shown the existing titles so it avoids them.
- **Never overwrites a person:** only titles Lucie assigned (the persona name, "New conversation", or the pasted first request) are replaced, and the write is skipped if someone renamed the chat in the meantime. Renaming a chat yourself always sticks.
- **Suggest a title:** the Rename dialog has a button that writes a new title from the conversation on demand (one short AI call). It is the way to name chats created before this feature.

`POST /api/chat/sessions/<id>/title` (optional `{"force": true}`) needs `chat:write` and `ai:generate`, returns `{changed, session}`, and is safe to repeat: after a title is set it changes nothing and makes no model call. No database change is needed.

## Tone for this chat

The persona (including audience age) belongs to the folder. Only the four tone scales (Professional to Casual, Authoritative to Conversational, Serious to Humorous, Matter of Fact to Enthusiastic) can differ from chat to chat. The chat header's **Voice** button opens them, starting from the shared brand tone in Settings. **Save for this chat** stores only the scales that differ, so later changes to the shared tone still flow into chats that did not override them. **Reset to defaults** removes the overrides. The button shows how many scales are customized.

At generation time the server layers the conversation's tone over the brand tone before building the prompt, so it affects every reply in that chat (including rewrites and image or video briefs) and no other chat. Messages already generated are not rewritten.

## Data model

A folder is a persona: chats group by the locked `chat_session.default_persona_id`. There is no folder table and no backfill.

- `GET /api/chat/sessions?version=2&persona=<persona uuid|none>`: optional folder filter on the existing list. The sidebar uses it for each expanded folder.
- `GET /api/chat/folders?archived=false|true`: `{folders: [{persona_id, persona_name, available, chat_count, last_updated_at}]}` for personas that have chats. The client adds personas with no chats yet.
- `PUT /api/chat/sessions/<id>/voice` with `{voice_settings: {tone: {professional|authoritative|serious|matterOfFact: 1-5}}}` replaces the conversation's tone overrides (`{}` clears them). Requires `chat:write` and current membership. The first `PUT /api/chat/sessions/<id>` (creation) also accepts `voice_settings`, so a tone chosen before the first message is saved with the chat. `GET /api/chat/sessions/<id>?version=2` returns `voice_settings`.

## Database changes (run by hand, after approval)

In the Neon SQL Editor, select the branch (development first), paste the file, run it, then run the commented checks. Both files are safe to re-run, include a rollback line and have not been run on any Neon branch.

1. [`database/persona_folders.sql`](database/persona_folders.sql): one optional index that keeps folder lists and counts fast. Folders work without it.
2. [`database/chat_voice_settings.sql`](database/chat_voice_settings.sql): the new `chat_session_voice` table. Everything else works without it. Until it exists, chats use the shared tone and saving a custom tone returns 409 `voice_storage_missing`. The Flask database role needs read and write on the table.

Sub-folders inside a persona (for example one per campaign) are not part of this. They would need a `chat_folder` table.
