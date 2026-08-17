import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import CalendarPage from './CalendarPage'
import PreferenceSetup from './PreferenceSetup'
import CampaignResponse from '../components/CampaignResponse'
import ClarificationResponse from '../components/ClarificationResponse'
import PostsResponse from '../components/PostsResponse'
import Section from '../components/Section'
import { usePreferences } from '../context/PreferencesContext'
import { loadChatsFromStorage, saveChatsToStorage } from '../utils/storage'
import { NMLS_NUMBER } from '../constants'

// crypto.randomUUID() only exists in a secure context (HTTPS, or the special-cased
// "localhost") — it throws on plain http://<lan-ip>, which is exactly how this app gets
// opened from a phone during local dev testing, crashing the whole page on the first
// message. This falls back to a good-enough unique id everywhere else.
function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const PROMPT_CATEGORIES = [
  {
    category: 'Content Creation',
    emoji: '💡',
    prompts: [
      'Give me a post idea for a first-time homebuyer tip',
      'Write an engaging caption for a recent client success story',
      'Turn a complex market update into a simple, educational post',
    ],
  },
  {
    category: 'Strategy & Planning',
    emoji: '🗓️',
    prompts: [
      'What should I post this week?',
      'Create a content strategy and 2-week social media calendar for my mortgage brand',
      'Outline a multi-post campaign for a new service launch',
    ],
  },
  {
    category: 'Growth & Lead Generation',
    emoji: '🚀',
    prompts: [
      'How do I get more leads from my current audience?',
      'Write a strong call-to-action that drives profile link clicks',
      'What are some ways to improve my local community engagement?',
    ],
  },
]

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
]

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  )
}

function EditIcon({ done = false }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {done ? (
        <path d="M20 6L9 17l-5-5" />
      ) : (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
      )}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

const PERSONA_DESCRIPTIONS = {
  'self-employed':
    'Age 35-60, self-employed or entrepreneur with complex finances and significant tax write-offs. Traditional banks have turned them away. Non-QM borrower with good to excellent credit and 2 or more years of business ownership. Core message: Find a solution without cutting corners.',
}

const TONE_SCALES = [
  { key: 'professional', low: 'Professional', high: 'Casual' },
  { key: 'authoritative', low: 'Authoritative', high: 'Conversational' },
  { key: 'serious', low: 'Serious', high: 'Humorous' },
  { key: 'matterOfFact', low: 'Matter of Fact', high: 'Enthusiastic' },
]

const CHAT_SLOT_COUNT = 3

const CONTENT_TYPE_LABELS = {
  campaign: 'Campaign',
  posts: 'Posts',
  text: 'Text',
  'text-only': 'Text',
  'single-image': 'Image',
  carousel: 'Multi Image Carousel',
  video: 'Video',
}

function createChatSession(persona = null) {
  const now = persona ? new Date().toISOString() : null
  return {
    id: makeId(),
    persona,
    personaId: persona?.id || persona?.apiKey || null,
    title: persona?.name || 'New Chat',
    summary: '',
    createdAt: now,
    updatedAt: now,
    contentTypes: [],
    messages: [],
  }
}

function createInitialChats(persona) {
  return Array.from({ length: CHAT_SLOT_COUNT }, (_, index) =>
    createChatSession(index === 0 ? persona || null : null)
  )
}

function formatChatTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function buildChatSummary(message) {
  const clean = String(message || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const clipped = clean.length > 150 ? `${clean.slice(0, 147).trimEnd()}...` : clean
  return `The chat began with the request: “${clipped}”`
}

function getResponseContentTypes(data) {
  if (data.type === 'campaign') {
    const types = ['campaign']
    const calendar = data.campaign?.content_calendar || []
    const formats = calendar.map((entry) => entry.format).filter(Boolean)
    types.push(...new Set(formats))
    // Video scripts are generated on-demand per calendar entry (see the "Generate video
    // script" button) rather than upfront, so this only adds 'video' from entries that
    // actually have a generated script yet — the "video" format above already covers entries
    // that are merely slotted for one.
    if (calendar.some((entry) => entry.video) && !types.includes('video')) types.push('video')
    return types
  }

  if (data.type === 'posts') {
    const formats = (data.posts?.posts || []).map((post) => post.format).filter(Boolean)
    return formats.length > 0 ? [...new Set(formats)] : ['posts']
  }

  if (data.type === 'text') return ['text']
  return []
}

function mergeContentTypes(current = [], incoming = []) {
  return [...new Set([...current, ...incoming].filter(Boolean))]
}

function contentTypeLabel(type) {
  return CONTENT_TYPE_LABELS[type] || type
}

export default function ChatPage() {
  const { preferences } = usePreferences()
  const [activeNav, setActiveNav] = useState('chat')
  const storedChats = useRef(loadChatsFromStorage()).current
  const initialChats = useRef(null)
  if (!initialChats.current) {
    initialChats.current =
      storedChats?.chats?.length === CHAT_SLOT_COUNT
        ? storedChats.chats
        : createInitialChats(preferences.persona)
  }

  const [chats, setChats] = useState(initialChats.current)
  const [activeChatId, setActiveChatId] = useState(() => {
    const candidates = initialChats.current
    if (storedChats?.activeChatId && candidates.some((chat) => chat.id === storedChats.activeChatId)) {
      return storedChats.activeChatId
    }
    return candidates.find((chat) => chat.persona)?.id || candidates[0]?.id || null
  })
  const [showSetup, setShowSetup] = useState(false)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [activePromptCategory, setActivePromptCategory] = useState(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [chatToDelete, setChatToDelete] = useState(null)
  const [showPersonaModal, setShowPersonaModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingChatId, setEditingChatId] = useState(null)
  const [draftChatTitle, setDraftChatTitle] = useState('')
  const [draftChatSummary, setDraftChatSummary] = useState('')
  const endRef = useRef(null)
  const abortControllerRef = useRef(null)

  const nmls = NMLS_NUMBER

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0]
  const messages = activeChat?.messages || []

  const activePersona = activeChat?.persona || preferences.persona
  const persona = activePersona?.apiKey || 'self-employed'
  const isDefaultPersona = persona === 'self-employed'

  const personaLabel = activePersona?.name || 'No persona'

  const personaColor = isDefaultPersona
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
    : 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'

  const actionBtnClass = 'text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-md hover:bg-slate-100'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages, isTyping])

  useEffect(() => {
    saveChatsToStorage(chats, activeChatId)
  }, [chats, activeChatId])

  const updateActiveChatMessages = (updater, metadataUpdater = null) => {
    const now = new Date().toISOString()
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== activeChatId) return chat
        const nextMessages = updater(chat.messages)
        const metadata =
          typeof metadataUpdater === 'function'
            ? metadataUpdater(chat, nextMessages)
            : metadataUpdater || {}
        return { ...chat, ...metadata, messages: nextMessages, updatedAt: now }
      })
    )
  }

  const handleSetupComplete = (persona) => {
    setShowSetup(false)
    if (!persona) return

    const now = new Date().toISOString()
    const emptyChat =
      chats.find((chat) => !chat.persona && chat.messages.length === 0) ||
      chats.find((chat) => chat.messages.length === 0)

    if (emptyChat) {
      setActiveChatId(emptyChat.id)
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === emptyChat.id
            ? {
                ...chat,
                persona,
                personaId: persona.id || persona.apiKey || null,
                title: persona.name || 'New Chat',
                summary: '',
                createdAt: chat.createdAt || now,
                updatedAt: now,
                contentTypes: [],
              }
            : chat
        )
      )
    } else {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChatId
            ? {
                ...chat,
                persona,
                personaId: persona.id || persona.apiKey || null,
                title: persona.name || chat.title,
                updatedAt: now,
              }
            : chat
        )
      )
    }
  }

  const sendMessage = async (message) => {
    setIsTyping(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const { data } = await axios.post(
        '/api/chat',
        { message, persona, nmls_number: nmls },
        { signal: controller.signal }
      )
      const createdAt = new Date().toISOString()
      const contentTypes = getResponseContentTypes(data)
      let assistantMessage

      if (data.type === 'campaign') {
        assistantMessage = {
          id: makeId(),
          role: 'assistant',
          type: 'campaign',
          campaign: data.campaign,
          prompt: message,
          createdAt,
        }
      } else if (data.type === 'clarification') {
        assistantMessage = {
          id: makeId(),
          role: 'assistant',
          type: 'clarification',
          clarification: data.clarification,
          prompt: message,
          createdAt,
        }
      } else if (data.type === 'posts') {
        assistantMessage = {
          id: makeId(),
          role: 'assistant',
          type: 'posts',
          posts: data.posts,
          prompt: message,
          createdAt,
        }
      } else {
        assistantMessage = {
          id: makeId(),
          role: 'assistant',
          type: 'text',
          text: data.response,
          prompt: message,
          createdAt,
        }
      }

      updateActiveChatMessages(
        (msgs) => [...msgs, assistantMessage],
        (chat) => ({
          contentTypes: mergeContentTypes(chat.contentTypes, contentTypes),
        })
      )
    } catch (err) {
      // Cancelled by clearChat (or a superseded request) — the chat that would have
      // received this response may no longer exist in its old form, so there's nothing
      // to report back for it.
      if (axios.isCancel(err)) return
      updateActiveChatMessages((msgs) => [
        ...msgs,
        {
          id: makeId(),
          role: 'assistant',
          type: 'text',
          text: 'Sorry, I could not generate a response. Please check that the server is running and try again.',
          prompt: message,
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      // Only clear isTyping/abortControllerRef if a newer request hasn't already
      // taken over — otherwise a slow-to-settle cancelled request could clobber it.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
        setIsTyping(false)
      }
    }
  }

  const handleSend = (text) => {
    const msg = (text ?? input).trim()
    if (!msg || isTyping) return

    const now = new Date().toISOString()
    const personaObj = activeChat.persona || preferences.persona

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId
          ? {
              ...chat,
              persona: chat.persona || personaObj,
              personaId: chat.personaId || personaObj?.id || personaObj?.apiKey || null,
              title:
                chat.title && chat.title !== 'New Chat'
                  ? chat.title
                  : personaObj?.name || 'New Chat',
              summary: chat.summary || buildChatSummary(msg),
              createdAt: chat.createdAt || now,
              updatedAt: now,
              messages: [
                ...chat.messages,
                {
                  id: makeId(),
                  role: 'user',
                  type: 'text',
                  text: msg,
                  createdAt: now,
                },
              ],
            }
          : chat
      )
    )

    setInput('')
    sendMessage(msg)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const regenerate = (index) => {
    const msg = messages[index]
    setIsTyping(true)
    updateActiveChatMessages((msgs) => msgs.filter((_, i) => i !== index))
    sendMessage(msg.prompt)
  }

  const setCalendarEntryVideo = (msgIndex, entryIndex, video) => {
    updateActiveChatMessages((msgs) => {
      const updated = [...msgs]
      const msg = updated[msgIndex]
      if (!msg || msg.type !== 'campaign') return msgs
      const content_calendar = msg.campaign.content_calendar.map((entry, i) =>
        i === entryIndex ? { ...entry, video } : entry
      )
      updated[msgIndex] = { ...msg, campaign: { ...msg.campaign, content_calendar } }
      return updated
    })
  }

  const submitClarificationAnswers = (index, answersText) => {
    const msg = messages[index]
    // Lock the checkboxes to show they were answered, but skip echoing the answers back as
    // a separate chat bubble — the locked card already shows what was selected, so a second
    // "Answers:" bubble is redundant. Go straight from checkboxes to the generated output.
    updateActiveChatMessages((msgs) => {
      const updated = [...msgs]
      updated[index] = { ...updated[index], submitted: true }
      return updated
    })
    sendMessage(`Original request: ${msg.prompt}\n\nAnswers:\n${answersText}`)
  }

  const makeShorter = (index) => {
    updateActiveChatMessages((msgs) => {
      const updated = [...msgs]
      if (updated[index].type === 'campaign') return updated
      const original = updated[index].text
      const lines = original.split('\n').filter(Boolean)
      const shortened = lines.slice(0, 2).join('\n') + `\n\n— Joseph Kim | NMLS #${nmls}`
      updated[index] = { ...updated[index], type: 'text', text: shortened }
      return updated
    })
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback
    }
  }

  const saveChatEdits = (chatId) => {
    const now = new Date().toISOString()
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title: draftChatTitle.trim() || chat.persona?.name || 'Chat',
              summary: draftChatSummary.trim(),
              updatedAt: now,
            }
          : chat
      )
    )
  }

  const toggleChatEdit = (chat) => {
    if (editingChatId === chat.id) {
      saveChatEdits(chat.id)
      setEditingChatId(null)
      return
    }

    setDraftChatTitle(chat.title || chat.persona?.name || 'Chat')
    setDraftChatSummary(chat.summary || '')
    setEditingChatId(chat.id)
  }

  const clearChat = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsTyping(false)

    const now = new Date().toISOString()
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId
          ? {
              ...chat,
              messages: [],
              summary: '',
              contentTypes: [],
              updatedAt: now,
            }
          : chat
      )
    )
    setShowClearConfirm(false)
  }

  const confirmDeleteChat = () => {
    if (!chatToDelete) return

    const id = chatToDelete.id
    const replacement = createChatSession(null)
    const next = chats.find((chat) => chat.id !== id && chat.persona)

    setChats((prev) =>
      prev.map((chat) => (chat.id === id ? replacement : chat))
    )

    if (id === activeChatId) {
      setActiveChatId(next?.id || replacement.id)
    }

    setChatToDelete(null)
  }

  if (showSetup) {
    return <PreferenceSetup onComplete={handleSetupComplete} />
  }

  return (
    // h-dvh (not h-screen/100vh) so the layout tracks Safari's actual visible viewport on
    // iPhone — 100vh is fixed to the toolbar-collapsed height, which cuts off or requires
    // scrolling to reach the message input while the address bar is still showing.
    <div className="h-dvh flex bg-slate-50 overflow-hidden">
      {/* Backdrop — mobile only, closes the drawer on tap-outside */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — dark off-canvas drawer on mobile, Ken's light static column on desktop
          (team decision: keep the mobile drawer dark, keep the light theme for desktop). */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-slate-900 md:bg-white md:border-r md:border-slate-200 flex flex-col shrink-0 transform transition-transform duration-200 ease-out md:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-slate-800 md:border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                JM
              </div>
              <h1 className="text-sm font-bold text-white md:text-slate-900">MoJoJo SMM AI</h1>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="md:hidden p-1 text-slate-400 hover:text-white transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
          <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${personaColor}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {personaLabel}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveNav(item.id)
                setSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeNav === item.id
                  ? 'bg-blue-500/15 md:bg-blue-50 text-blue-300 md:text-blue-600'
                  : 'text-slate-400 md:text-slate-500 hover:text-slate-200 md:hover:text-slate-900 hover:bg-slate-800 md:hover:bg-slate-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setShowSetup(true)
              setSidebarOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 mt-3 rounded-lg text-sm font-medium transition-colors text-slate-400 md:text-slate-500 hover:text-slate-200 md:hover:text-slate-900 hover:bg-slate-800 md:hover:bg-slate-100 border-t border-slate-800 md:border-slate-100"
          >
            <span className="text-base">➕</span>
            New Chat
          </button>

          <div className="pt-3 space-y-1.5">
            {chats
              .filter((chat) => chat.persona)
              .map((chat) => {
                const isActive = chat.id === activeChatId
                const displayLabel = chat.title || chat.persona?.name || 'Chat'
                const timestamp = formatChatTimestamp(chat.createdAt)
                const visibleTypes = (chat.contentTypes || []).slice(0, 2)
                const hiddenTypeCount = Math.max(0, (chat.contentTypes || []).length - visibleTypes.length)
                const isEditing = editingChatId === chat.id

                return (
                  <div
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id)
                      setActiveNav('chat')
                      setSidebarOpen(false)
                    }}
                    className={`group relative w-full flex flex-col items-start px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-slate-700 md:bg-slate-100 text-white md:text-slate-900'
                        : 'text-slate-400 md:text-slate-500 hover:bg-slate-800 md:hover:bg-slate-50 hover:text-slate-200 md:hover:text-slate-700'
                    }`}
                  >
                    {isEditing ? (
                      <input
                        value={draftChatTitle}
                        onChange={(e) => setDraftChatTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.stopPropagation()
                            saveChatEdits(chat.id)
                            setEditingChatId(null)
                          }
                        }}
                        maxLength={80}
                        aria-label="Chat title"
                        className="w-full pr-14 text-sm font-semibold rounded-md border px-2 py-1 outline-none bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      />
                    ) : (
                      <span className="w-full pr-14 text-sm font-semibold truncate">{displayLabel}</span>
                    )}
                    {timestamp && (
                      <span className={`mt-0.5 text-[10px] ${isActive ? 'text-slate-300 md:text-slate-500' : 'text-slate-500 md:text-slate-400'}`}>
                        {timestamp}
                      </span>
                    )}

                    {visibleTypes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5 pr-6">
                        {visibleTypes.map((type) => (
                          <span
                            key={type}
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                              isActive ? 'bg-white/10 md:bg-white text-slate-200 md:text-slate-600' : 'bg-slate-800 md:bg-slate-100 text-slate-400 md:text-slate-500'
                            }`}
                          >
                            {contentTypeLabel(type)}
                          </span>
                        ))}
                        {hiddenTypeCount > 0 && (
                          <span className={`text-[9px] ${isActive ? 'text-slate-300 md:text-slate-500' : 'text-slate-500 md:text-slate-400'}`}>
                            +{hiddenTypeCount}
                          </span>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <textarea
                        value={draftChatSummary}
                        onChange={(e) => setDraftChatSummary(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        maxLength={240}
                        placeholder="Chat description"
                        aria-label="Chat description"
                        className="mt-1.5 w-full text-[10px] leading-4 rounded-md border px-2 py-1.5 resize-none outline-none bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-500"
                      />
                    ) : (
                      chat.summary && (
                        <p
                          className={`mt-1.5 text-[10px] leading-4 line-clamp-2 ${
                            isActive ? 'text-slate-300 md:text-slate-500' : 'text-slate-500 md:text-slate-400'
                          }`}
                          title={chat.summary}
                        >
                          {chat.summary}
                        </p>
                      )
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleChatEdit(chat)
                      }}
                      aria-label={isEditing ? `Save ${displayLabel}` : `Edit ${displayLabel}`}
                      title={isEditing ? 'Save chat title and description' : 'Edit chat title and description'}
                      className={`absolute top-2 right-8 p-1 rounded-md transition-all ${
                        isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      } ${
                        isActive
                          ? 'text-slate-300 md:text-slate-500 hover:text-blue-300 md:hover:text-blue-600 hover:bg-white/10 md:hover:bg-slate-200'
                          : 'text-slate-400 hover:text-blue-400 md:hover:text-blue-600 hover:bg-slate-700 md:hover:bg-slate-200'
                      }`}
                    >
                      <EditIcon done={isEditing} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setChatToDelete(chat)
                      }}
                      aria-label={`Delete ${displayLabel}`}
                      className="absolute top-2 right-2 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 md:hover:text-red-500 hover:bg-slate-700 md:hover:bg-slate-200"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )
              })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800 md:border-slate-100 text-xs text-slate-500 md:text-slate-400">
          {preferences.name} | NMLS #{nmls}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — hamburger to open the drawer, hidden on desktop where the sidebar is always visible */}
        <div className="md:hidden flex items-center gap-3 bg-slate-900 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="text-slate-300 hover:text-white transition-colors p-1"
          >
            <MenuIcon />
          </button>
          <span className="text-sm font-bold text-white">MoJoJo SMM AI</span>
        </div>

        {activeNav === 'calendar' ? (
          <CalendarPage />
        ) : (
        <>
        {/* Chat header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {activeChat?.title || 'Chat'}
                </h2>
                {activeChat?.createdAt && (
                  <p className="text-[10px] text-slate-400">
                    {formatChatTimestamp(activeChat.createdAt)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-slate-400">
                NMLS #{nmls}
              </span>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-slate-400 bg-slate-100 hover:bg-red-50 hover:text-red-500 px-2.5 py-1 rounded-full font-medium transition-colors"
              >
                Clear Chat
              </button>
              <button
                type="button"
                onClick={() => setShowPersonaModal(true)}
                className="text-xs text-slate-400 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 px-2.5 py-1 rounded-full font-medium transition-colors max-w-[160px] sm:max-w-none truncate"
              >
                Persona: {personaLabel}
              </button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {messages.length === 0 && !isTyping && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-2xl mb-4">
                💬
              </div>
              <p className="text-slate-900 font-semibold text-sm">Start a conversation</p>
              <p className="text-slate-400 text-xs mt-1">Ask for a caption, post idea, or content strategy</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id ?? i}>
              {msg.role === 'assistant' && msg.type === 'campaign' ? (
                <div className="flex justify-start">
                  <CampaignResponse
                    data={msg.campaign}
                    nmls={nmls}
                    persona={persona}
                    onVideoGenerated={(entryIndex, video) => setCalendarEntryVideo(i, entryIndex, video)}
                  />
                </div>
              ) : msg.role === 'assistant' && msg.type === 'clarification' ? (
                <div className="flex justify-start">
                  <ClarificationResponse
                    data={msg.clarification}
                    submitted={msg.submitted}
                    onSubmit={(answersText) => submitClarificationAnswers(i, answersText)}
                  />
                </div>
              ) : msg.role === 'assistant' && msg.type === 'posts' ? (
                <div className="flex justify-start">
                  <PostsResponse data={msg.posts} nmls={nmls} persona={persona} />
                </div>
              ) : msg.role === 'assistant' ? (
                // Same card chrome as CampaignResponse's Section component — every AI
                // reply reads as one visual system, not just campaign output.
                <div className="flex justify-start">
                  <div className="w-full max-w-3xl">
                    <Section icon="💬" title="AI Response" defaultOpen>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </Section>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 whitespace-pre-wrap leading-relaxed text-sm bg-blue-600 text-white shadow-sm shadow-blue-200">
                    {msg.text}
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && (msg.type === 'campaign' || msg.type === 'clarification' || msg.type === 'posts') && (
                <div className="flex justify-start mt-2 ml-1">
                  <button onClick={() => regenerate(i)} className={actionBtnClass}>
                    🔄 Regenerate
                  </button>
                </div>
              )}

              {msg.role === 'assistant' && msg.type === 'text' && (
                <div className="flex justify-start mt-2 ml-1">
                  <div className="flex gap-1">
                    <button onClick={() => copyText(msg.text)} className={actionBtnClass}>
                      📋 Copy
                    </button>
                    <button onClick={() => regenerate(i)} className={actionBtnClass}>
                      🔄 Regenerate
                    </button>
                    <button onClick={() => makeShorter(i)} className={actionBtnClass}>
                      ✂️ Make it shorter
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Quick prompts + input */}
        <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-4 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="mb-3">
              <div className="flex flex-wrap gap-2">
                {PROMPT_CATEGORIES.map((cat) => {
                  const isActive = activePromptCategory === cat.category
                  return (
                    <button
                      key={cat.category}
                      type="button"
                      onClick={() => setActivePromptCategory(isActive ? null : cat.category)}
                      disabled={isTyping}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-100 border-transparent text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      {cat.emoji} {cat.category}
                    </button>
                  )
                })}
              </div>
              {activePromptCategory && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {PROMPT_CATEGORIES.find((cat) => cat.category === activePromptCategory)?.prompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        handleSend(prompt)
                        setActivePromptCategory(null)
                      }}
                      disabled={isTyping}
                      className="text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-500 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 placeholder:text-slate-400"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-200 inline-flex items-center gap-2"
              >
                {isTyping && (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {isTyping ? 'Generating...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Clear Chat confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900">
              Are you sure you want to clear this conversation?
            </h3>
            <p className="text-xs text-slate-500 mt-1">This cannot be undone.</p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete chat confirmation */}
      {chatToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900">
              Delete this chat? This cannot be undone.
            </h3>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setChatToDelete(null)}
                className="flex-1 text-slate-500 hover:text-slate-700 text-xs font-medium py-2 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteChat}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand summary modal */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Brand Summary</h3>
              <button
                type="button"
                onClick={() => setShowPersonaModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active Persona</h4>
                <p className="mt-2 text-sm font-semibold text-slate-900">{activePersona?.name}</p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {PERSONA_DESCRIPTIONS[persona] || activePersona?.description || 'No persona configured.'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Voice</h4>
                <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                  {activePersona?.coreValues || 'Not configured.'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Tone of Voice</h4>
                <div className="space-y-4">
                  {TONE_SCALES.map((scale) => {
                    const value = activePersona?.tone?.[scale.key]
                    return (
                      <div key={scale.key}>
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>{scale.low}</span>
                          <span>{scale.high}</span>
                        </div>
                        <div className="flex gap-1 mt-1.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span
                              key={n}
                              className={`h-2 flex-1 rounded-full ${
                                value === n ? 'bg-blue-800' : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Target Audience</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Age range</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {activePersona?.ageRange ? `Age range: ${activePersona.ageRange[0]}-${activePersona.ageRange[1]}` : 'Not configured.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Income</p>
                    <p className="mt-1 text-sm text-slate-700">{activePersona?.income || 'Not configured.'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Education</p>
                    <p className="mt-1 text-sm text-slate-700">{activePersona?.education || 'Not configured.'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">Pain points</p>
                    <p className="mt-1 text-sm text-slate-700">{activePersona?.painPoints || 'Not configured.'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">NMLS Number</h4>
                <p className="mt-2 text-sm text-slate-700">NMLS #{nmls}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
