const PREFERENCES_KEY = 'lucent_preferences'
const CHATS_KEY = 'lucent_chats'
const CHAT_STORAGE_VERSION = 2

function createStorageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function validIsoTimestamp(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null
  return new Date(value).toISOString()
}

function clipSummaryText(value, maxLength = 150) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3).trimEnd()}...`
}

function summaryFromMessages(messages) {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.text)
  if (!firstUserMessage) return ''
  return `The chat began with the request: “${clipSummaryText(firstUserMessage.text)}”`
}

function deriveContentTypes(messages) {
  const types = new Set()

  messages.forEach((message) => {
    if (message.role !== 'assistant') return

    if (message.type === 'campaign') {
      types.add('campaign')
      if (message.campaign?.video_briefs?.length) types.add('video')
      return
    }

    if (message.type === 'posts') {
      const posts = message.posts?.posts || []
      if (posts.length === 0) {
        types.add('posts')
        return
      }
      posts.forEach((post) => {
        if (post.format) types.add(post.format)
      })
      return
    }

    if (message.type === 'text') types.add('text')
  })

  return [...types]
}

function normalizeMessage(message, fallbackTimestamp) {
  return {
    ...message,
    id: typeof message.id === 'string' && message.id ? message.id : createStorageId(),
    createdAt: validIsoTimestamp(message.createdAt) || fallbackTimestamp,
  }
}

function normalizeChat(chat, now) {
  const rawMessages = Array.isArray(chat.messages) ? chat.messages : []
  const persona = chat.persona || null
  const legacyCreatedAt = rawMessages.length > 0 || persona ? now : null
  const createdAt = validIsoTimestamp(chat.createdAt) || legacyCreatedAt
  const messageFallback = createdAt || now
  const messages = rawMessages.map((message) => normalizeMessage(message, messageFallback))
  const latestMessageTimestamp = messages.at(-1)?.createdAt || createdAt

  return {
    ...chat,
    id: typeof chat.id === 'string' && chat.id ? chat.id : createStorageId(),
    persona,
    personaId: chat.personaId || persona?.id || persona?.apiKey || null,
    title: chat.title || persona?.name || 'New Chat',
    summary: chat.summary || summaryFromMessages(messages),
    createdAt,
    updatedAt: validIsoTimestamp(chat.updatedAt) || latestMessageTimestamp,
    contentTypes:
      Array.isArray(chat.contentTypes) && chat.contentTypes.length > 0
        ? [...new Set(chat.contentTypes.filter(Boolean))]
        : deriveContentTypes(messages),
    messages,
  }
}

// Brand voice (core values, tone, target audience) now lives on the persona itself rather
// than as one global set shared by every persona, so the persona object is stored whole.
export function savePreferencesToStorage(preferences) {
  try {
    const payload = {
      persona: preferences.persona || null,
      nmls_number: preferences.nmls || '',
    }
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(payload))
  } catch {
    // silent
  }
}

export function loadPreferencesFromStorage() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    let persona = stored.persona || null
    // One-time migration: older saves kept brand-voice fields at the top level instead of on
    // the persona. If a loaded persona doesn't have its own copy yet, fold the old top-level
    // fields onto it so existing brand voice settings aren't lost.
    if (persona && persona.coreValues === undefined) {
      persona = {
        ...persona,
        coreValues: stored.core_values || '',
        tone: {
          professional: stored.professional ?? 3,
          authoritative: stored.authoritative ?? 3,
          serious: stored.serious ?? 3,
          matterOfFact: stored.matterOfFact ?? 3,
        },
        ageRange: [
          typeof stored.age_min === 'number' ? stored.age_min : 25,
          typeof stored.age_max === 'number' ? stored.age_max : 45,
        ],
        income: stored.income_range || '',
        education: stored.education_level || '',
        painPoints: stored.pain_points || '',
      }
    }
    return {
      name: 'Joseph',
      nmls: stored.nmls_number || '',
      persona,
    }
  } catch {
    return null
  }
}

export function saveChatsToStorage(chats, activeChatId) {
  try {
    localStorage.setItem(
      CHATS_KEY,
      JSON.stringify({ version: CHAT_STORAGE_VERSION, chats, activeChatId })
    )
  } catch {
    // silent
  }
}

export function loadChatsFromStorage() {
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    if (!raw) return null

    const stored = JSON.parse(raw)
    if (!Array.isArray(stored.chats)) return null

    const now = new Date().toISOString()
    const legacyIdMap = new Map()
    const chats = stored.chats.map((chat) => {
      const normalized = normalizeChat(chat, now)
      legacyIdMap.set(String(chat.id), normalized.id)
      return normalized
    })

    const activeChatId =
      legacyIdMap.get(String(stored.activeChatId)) ||
      chats.find((chat) => chat.persona)?.id ||
      chats[0]?.id ||
      null

    return {
      version: CHAT_STORAGE_VERSION,
      chats,
      activeChatId,
    }
  } catch {
    return null
  }
}
