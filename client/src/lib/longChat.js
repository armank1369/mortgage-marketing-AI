// Long-chat guidance. Lucie's server only sends the most recent exchanges to the model
// (see server/services/conversation_context.py: MAX_EXCHANGES = 6 and a 16 KB cap), so the
// start of a long conversation silently drops out of Lucie's context. Past this many
// requests we suggest starting a fresh chat with the same persona.
//
// Unit: user requests ("send" actions). Rewrites, shortens, clarification answers and media
// follow-ups do not count, matching how the server counts exchanges.
export const LONG_CHAT_REQUEST_THRESHOLD = 10

const isRequest = (row) => row?.role === 'user' && (row.structured_data?.input?.action ?? 'send') === 'send'

export function countChatRequests(rows = []) {
  return rows.reduce((total, row) => total + (isRequest(row) ? 1 : 0), 0)
}

// `hasOlder` is true when earlier messages exist but have not been loaded yet. A chat page
// holds 50 rows, so an unloaded older page always means the chat is already long.
export function isLongChat(rows = [], { hasOlder = false, threshold = LONG_CHAT_REQUEST_THRESHOLD } = {}) {
  return hasOlder || countChatRequests(rows) >= threshold
}
