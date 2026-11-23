// Decides how the chat view should scroll when the conversation changes.
//
// Long replies (several posts or scripts) used to drag the view to the very bottom, so people had
// to scroll back up to find where the answer began. Now a tall new reply is brought to its top,
// short replies still end up fully in view, and nothing moves if the person scrolled away.
export const NEAR_BOTTOM_PX = 150

export const isNearBottom = ({ scrollHeight, scrollTop, clientHeight }, threshold = NEAR_BOTTOM_PX) =>
  scrollHeight - scrollTop - clientHeight <= threshold

// prev/next: { chatId, lastId, lastRole, submitting }. Returns 'bottom', 'reply-start' or 'none'.
// nearBottom is the position BEFORE the update. replyHeight and viewportHeight are in pixels.
export function planScroll({ prev, next, nearBottom, replyHeight = 0, viewportHeight = 0 }) {
  if (!prev || prev.chatId !== next.chatId) return 'bottom' // opened or switched chat
  const newMessage = prev.lastId !== next.lastId
  if (!newMessage) return next.submitting && !prev.submitting && nearBottom ? 'bottom' : 'none'
  if (next.lastRole !== 'assistant') return 'bottom' // you just sent something: show it
  if (!nearBottom) return 'none' // do not yank someone who scrolled elsewhere
  return replyHeight > viewportHeight ? 'reply-start' : 'bottom'
}
