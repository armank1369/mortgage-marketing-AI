# Prototype UI Cleanup and Database-Ready Chat Metadata

## Overview

This document describes the prototype cleanup work introduced on the `jaime-bug-fix-todo-list` branch and explains why the implementation is structured the way it is.

The goals of this change are:

- remove the unused Settings placeholder from the final prototype;
- make saved chats easier to identify than `Chat 1`, `Chat 2`, and `Chat 3`;
- add a persona-based title, creation timestamp, content-type tags, and a short summary to each visible chat;
- rename the user-facing `Carousel` label to `Multi Image Carousel`;
- keep the current prototype lightweight while making the chat-session model easier to move into a database later.

This change does **not** introduce a new database dependency. Frontend chat sessions remain in browser `localStorage`, and the existing backend SQLite `chat_history` behavior remains unchanged.

## UI Changes

### Settings removed

The Settings item in the sidebar previously opened only a `Settings coming soon` placeholder. It did not expose working settings behavior.

The navigation item and placeholder view are removed for the presentation build. `PreferenceSetup.jsx` is intentionally preserved because it is still used for the initial brand/persona setup and the New Chat flow.

### Chat identification

Visible chats now show:

- the selected persona name as the main title;
- the chat creation timestamp;
- up to two content-type tags, with a `+N` indicator if more types exist;
- a short summary based on the first user request.

Example:

```text
The Business Owner
Aug 15, 2026, 8:05 PM
Campaign   Video

The chat began with the request: “Create a two-week social media campaign for my mortgage brand”
```

The summary is deterministic and local. It does not make an extra Claude request, which avoids additional latency, API cost, and failure points for a presentation-focused feature.

### Multi Image Carousel wording

The internal format value remains:

```text
carousel
```

The user-facing wording is changed to:

```text
Multi Image Carousel
```

Keeping the internal value stable is important because existing rendering and backend formatting logic already depends on `carousel`.

### Current rates and promo fields

The reviewed branch does not currently expose dedicated Current Rates or Promo fields in the working UI, so there is no settings field to remove in this patch.

The backend's no-fabrication safeguards remain in place. If generated marketing content needs a rate, promotion, fee, or similar fact that was not supplied, the AI should continue asking for it or using a clearly marked placeholder rather than inventing a value.

## Chat Session Data Model

The frontend chat object now intentionally resembles a future database-backed session record:

```js
{
  id: "uuid",
  persona: {
    id: "business-owner",
    name: "The Business Owner",
    apiKey: "self-employed"
  },
  personaId: "business-owner",
  title: "The Business Owner",
  summary: "The chat began with the request: “...”",
  createdAt: "2026-08-16T03:05:00.000Z",
  updatedAt: "2026-08-16T03:08:00.000Z",
  contentTypes: ["campaign", "video"],
  messages: [...]
}
```

Messages also keep their own UUID and ISO timestamp:

```js
{
  id: "uuid",
  role: "user",
  type: "text",
  text: "Create a two-week campaign",
  createdAt: "2026-08-16T03:06:00.000Z"
}
```

### Why UUIDs are used

The old prototype used numeric local slot IDs such as `1`, `2`, and `3`.

New and migrated chats use UUIDs so chat identity is not tied to display order. This is much closer to how a future `chat_sessions` table should identify records.

Deleting a chat also creates a fresh UUID-backed empty prototype slot instead of reusing the deleted session identity.

### Why timestamps are stored as ISO values

The stored value is machine-friendly:

```text
2026-08-16T03:05:00.000Z
```

React formats it for display based on the user's environment.

This avoids storing presentation strings such as `Aug 15 at 8:05 PM` as database data and makes future sorting, filtering, and timezone handling easier.

### Why content types use normalized values

Stored values remain stable identifiers:

```js
["campaign", "carousel", "video"]
```

The UI translates them into labels:

```text
Campaign
Multi Image Carousel
Video
```

This prevents display wording from becoming part of the storage contract.

## localStorage Versioning and Legacy Migration

Chat storage now writes a small schema version:

```js
{
  version: 2,
  chats: [...],
  activeChatId: "uuid"
}
```

`loadChatsFromStorage()` normalizes older saved chats so existing browser data does not need to be manually cleared.

Legacy migration handles:

- numeric chat IDs -> UUIDs;
- messages without UUIDs -> UUIDs;
- missing chat/message timestamps -> ISO timestamps;
- missing titles -> persona name or `New Chat`;
- missing summaries -> summary derived from the first user message;
- missing content types -> values derived from stored assistant messages;
- numeric legacy `activeChatId` -> the corresponding migrated UUID.

After the app loads, the existing save effect writes the normalized shape back to `localStorage`.

## Future Database Migration

The intended future mapping is straightforward:

| Current frontend field | Future database field |
| --- | --- |
| `chat.id` | `chat_sessions.id` |
| `chat.personaId` | `chat_sessions.persona_id` |
| `chat.title` | `chat_sessions.title` |
| `chat.summary` | `chat_sessions.summary` |
| `chat.createdAt` | `chat_sessions.created_at` |
| `chat.updatedAt` | `chat_sessions.updated_at` |
| `chat.contentTypes` | session metadata or related content records |
| `message.id` | `chat_messages.id` |
| `message.role` | `chat_messages.role` |
| `message.type` | `chat_messages.message_type` |
| `message.createdAt` | `chat_messages.created_at` |
| parent `chat.id` | `chat_messages.chat_session_id` |

A future API could expose routes such as:

```text
GET    /api/chat-sessions
POST   /api/chat-sessions
GET    /api/chat-sessions/{id}
POST   /api/chat-sessions/{id}/messages
DELETE /api/chat-sessions/{id}
```

At that point, the main frontend change should be replacing the current `storage.js` persistence layer with API calls while keeping the UI-facing chat object shape largely the same.

### Prototype-only empty slots

The current UI still preserves the prototype's three-chat-slot behavior. Empty slots are a local UI convenience and should **not** become database rows in a future implementation.

A future database-backed version should store only real chat sessions and enforce any chat-count limits at the UI/business-logic level.

## Existing Backend History Is Separate

The Flask backend currently has its own SQLite `chat_history` table containing generated messages and timestamps. That table is used by current backend behavior such as recent-idea deduplication.

This cleanup does not attempt to turn that table into full chat-session persistence.

When database integration resumes, the recommended direction is to introduce explicit `chat_sessions` and `chat_messages` relationships rather than trying to infer sessions from the current `chat_history` rows.

## Files Changed

- `client/src/pages/ChatPage.jsx`
  - removes Settings;
  - introduces database-ready chat metadata;
  - adds timestamp/content-type/summary UI;
  - preserves metadata when messages are modified;
  - gives deleted sessions fresh identities.

- `client/src/utils/storage.js`
  - adds chat storage schema version 2;
  - normalizes legacy localStorage data;
  - migrates numeric IDs to UUIDs;
  - derives missing summaries/content types.

- `client/src/components/ContentBriefCard.jsx`
  - displays `Multi Image Carousel` while keeping `carousel` internally.

- `server/app.py`
  - changes the clarification option shown to users from `Carousel` to `Multi Image Carousel`;
  - keeps the structured output format value `carousel`.

- `README.md`
  - updates the setup instructions from the obsolete Ollama workflow to the current Anthropic backend;
  - documents current storage boundaries and links to this file.

## Manual Test Checklist

After applying the patch:

1. Run `npm run lint`.
2. Run `npm run build`.
3. Start the Flask backend and Vite frontend normally.
4. Confirm the sidebar contains Chat, Calendar, and New Chat, with no Settings entry.
5. Confirm an existing legacy chat still loads after the localStorage migration.
6. Create/send a message and verify:
   - persona name appears as the chat title;
   - timestamp appears;
   - summary is populated;
   - the chat remains available after refresh.
7. Generate different output types and verify content-type tags update.
8. Request a post without specifying format and confirm the clarification UI offers `Multi Image Carousel`.
9. Generate a carousel and confirm the content card says `Multi Image Carousel` while the multi-slide viewer still works.
10. Delete a chat, create/use another chat, refresh, and verify chat identity/selection remains stable.
11. Clear a chat and verify its messages, summary, and content-type tags clear without breaking the persona/title.
