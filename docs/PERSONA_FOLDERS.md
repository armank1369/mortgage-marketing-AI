# Persona folders

V2 organizes chats like Finder. The sidebar lists one **persona folder** per active persona. Opening a folder shows its conversations as a list in the main pane (name, date modified, kind, preview). Opening a conversation shows the chat, with a **← {persona}** link back to the folder.

## How people use it

- **Sidebar:** pick a folder to see its conversations. The number beside it is how many chats it holds.
- **Folder view:** breadcrumb (`Persona folders › Persona`), sortable Name and Date modified columns, **New chat in this folder** (skips the persona selector), **Persona settings** (audience, guidance and shared brand fields for that persona) and **Load more conversations**.
- **Persona folders** breadcrumb: the overview of every folder.
- **New Chat** (left navigation): the persona selector. Choosing a persona opens that persona's folder with a fresh chat inside it.
- **Archive:** lists archived conversations in the main pane. Inside a folder it shows only that folder's archive.
- A chat's persona is the folder's persona and cannot change. Chats whose persona was deleted keep a read-only "Unavailable persona" folder, and chats saved without a persona (older imports) appear in "Unsorted chats". Neither offers a new chat. Local history is unchanged.

## Voice for this chat

The persona is bound to the folder, but tone and audience age are adjustable one conversation at a time. The chat header's **Voice** button opens a panel with the four tone scales and the audience age range, starting from the defaults (brand tone from Settings, age from the persona). **Save for this chat** stores only what differs from the defaults, so later changes to the defaults still flow into chats that did not override them. **Reset to defaults** removes the overrides. The button shows how many settings are customized.

At generation time the server layers the conversation's overrides over the brand tone and persona age before building the prompt, so they affect every reply in that chat (including rewrites and image or video briefs) and no other chat. Messages already generated are not rewritten.

## Data model

A folder is a persona: chats group by the locked `chat_session.default_persona_id`. There is no folder table and no backfill.

- `GET /api/chat/sessions?version=2&persona=<persona uuid|none>`: optional folder filter on the existing list.
- `GET /api/chat/folders?archived=false|true`: `{folders: [{persona_id, persona_name, available, chat_count, last_updated_at}]}` for personas that have chats. The client adds personas with no chats yet.
- `PUT /api/chat/sessions/<id>/voice` with `{voice_settings: {tone: {professional|authoritative|serious|matterOfFact: 1-5}, ageRange: [low, high]}}` replaces the conversation's overrides (`{}` clears them). Requires `chat:write` and current membership. The first `PUT /api/chat/sessions/<id>` (creation) also accepts `voice_settings`, so a voice chosen before the first message is saved with the chat. `GET /api/chat/sessions/<id>?version=2` returns `voice_settings`.

## Database changes (run by hand, after approval)

In the Neon SQL Editor, select the branch (development first), paste the file, run it, then run the commented checks. Both files are safe to re-run, include a rollback line and have not been run on any Neon branch.

1. [`database/persona_folders.sql`](database/persona_folders.sql): one optional index that keeps folder lists and counts fast. Folders work without it.
2. [`database/chat_voice_settings.sql`](database/chat_voice_settings.sql): the new `chat_session_voice` table. Everything else works without it. Until it exists, chats use the default voice and saving a custom voice returns 409 `voice_storage_missing`. The Flask database role needs read and write on the table.

Sub-folders inside a persona (for example one per campaign) are not part of this. They would need a `chat_folder` table.
