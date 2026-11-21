# Persona folders

V2 organizes chats by persona. The Chat sidebar opens on **Persona folders**: one folder per active persona, showing how many chats it holds and when it was last used. Opening a folder lists only that persona's chats.

## How people use it

- **New Chat** (left navigation) opens the persona selector. Choosing a persona opens that persona's folder with a fresh chat inside it.
- **New chat in this folder** (inside a folder) starts a chat with the folder's persona straight away, without the selector.
- **← All persona folders** returns to the folder overview.
- **Archive** inside a folder shows that folder's archived chats. Archive from the overview shows every archived chat.
- Chats whose persona was deleted keep a read-only "Unavailable persona" folder. Chats saved without any persona (older imports) appear in **Unsorted chats**. Neither offers a new chat.
- Local history is unchanged.

## Data model

A folder is a persona. There is no folder table: every V2 chat already stores `chat_session.default_persona_id`, and the server refuses to change it after creation (`persona_locked`). Grouping by that column is therefore stable and needs no backfill.

Server additions (workspace-shared, `chat:read`, current membership checked as for every chat route):

- `GET /api/chat/sessions?version=2&persona=<persona uuid|none>` filters the existing list. Omitting `persona` keeps the old behavior.
- `GET /api/chat/folders?archived=false|true` returns `{folders: [{persona_id, persona_name, available, chat_count, last_updated_at}]}` for personas that have chats. The client merges it with the workspace persona list so personas without chats still show an empty folder.

## Database change

Optional index only: [`database/persona_folders.sql`](database/persona_folders.sql). The feature works without it. Per AGENTS.md, run it by hand only after approval: select the Neon branch in the SQL Editor, paste the file, run it, then run the commented verify query. Do development first, then production.

Sub-folders inside a persona (for example one per campaign) are not part of this change. They would need a real `chat_folder` table and are a possible follow-up.
